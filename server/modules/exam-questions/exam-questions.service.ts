import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { and, desc, eq, count, sql, inArray, ilike, or, type SQL } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type {
  ExamQuestion,
  KnowledgePointBrief,
  KnowledgePoint,
  KnowledgePointCardData,
  ReviewRecord,
  PaginatedResponse,
  HighFreqItem,
  HighFreqQuestion,
  SchoolQuestionGroup,
  YearQuestionGroup,
  ChapterPathNode,
  KnowledgePointChapterPaths,
  YearQuestionOverview,
  SchoolQuestionOverview,
  SubjectQuestionOverview,
  ExamQuestionBrief,
  QuestionType,
  QuestionReviewDetail,
} from '../../shared/api.interface';
import {
  examQuestion,
  questionKnowledgePoint,
  knowledgePoint,
  subject,
  reviewRecord,
  wrongQuestion as wrongQuestionTable,
  chapter,
  knowledgePointTextbookChapter,
  userSetting,
} from '../../database/schema';
import {
  calculateQuestionResult,
  calculateQuestionMastery,
  calcOverallMastery,
  statusFromMastery,
  calculateQuestionPriorityScore,
} from '../../common/utils/review-algorithm';
import {
  ExamQuestionListQueryDto,
  HighFreqQueryDto,
  SubmitQuestionResultDto,
} from './dto/exam-questions.dto';

export interface QuestionSubmitResult {
  knowledgePoints: KnowledgePoint[];
  reviewRecords: ReviewRecord[];
  success: boolean;
}

@Injectable()
export class ExamQuestionsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private static readonly YEAR_OVERVIEW_CACHE_KEY = 'eq:year-overview';
  private static readonly SCHOOL_OVERVIEW_CACHE_KEY = 'eq:school-overview';
  private static readonly SUBJECT_OVERVIEW_CACHE_KEY = 'eq:subject-overview';
  private static readonly OVERVIEW_CACHE_TTL = 10 * 60 * 1000;

  async findList(
    query: ExamQuestionListQueryDto,
  ): Promise<PaginatedResponse<ExamQuestion>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const conditions = [];
    if (query.keyword)
      conditions.push(
        or(
          ilike(examQuestion.questionText, `%${query.keyword}%`),
          ilike(examQuestion.source, `%${query.keyword}%`),
        ),
      );
    if (query.subjectId)
      conditions.push(eq(examQuestion.subjectId, query.subjectId));
    if (query.year) conditions.push(eq(examQuestion.year, query.year));
    if (query.questionType)
      conditions.push(eq(examQuestion.questionType, query.questionType));
    if (query.school) conditions.push(eq(examQuestion.source, query.school));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await this.db
      .select({ count: count() })
      .from(examQuestion)
      .where(where);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select({
        id: examQuestion.id,
        year: examQuestion.year,
        subjectId: examQuestion.subjectId,
        questionType: examQuestion.questionType,
        questionText: examQuestion.questionText,
        source: examQuestion.source,
        difficulty: examQuestion.difficulty,
        masteryScore: examQuestion.masteryScore,
        answered: examQuestion.answered,
        answerCount: examQuestion.answerCount,
        lastAnsweredAt: examQuestion.lastAnsweredAt,
      })
      .from(examQuestion)
      .where(where)
      .orderBy(desc(examQuestion.year), desc(examQuestion.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const ids = rows.map((r) => r.id);
    const freqMap = ids.length > 0
      ? await this.loadExamFrequencyMap(ids)
      : new Map<string, number>();

    // 错题计数
    const wrongMap = new Map<string, number>();
    if (ids.length > 0) {
      const wrongRows = await this.db
        .select({
          questionId: wrongQuestionTable.questionId,
          totalWrong: sql<number>`SUM(${wrongQuestionTable.wrongCount})`,
        })
        .from(wrongQuestionTable)
        .where(inArray(wrongQuestionTable.questionId, ids))
        .groupBy(wrongQuestionTable.questionId);
      for (const r of wrongRows) {
        if (r.questionId) {
          wrongMap.set(r.questionId, Number(r.totalWrong) || 0);
        }
      }
    }

    // 最后复习时间（review_record 按 questionId 取 max(reviewedAt)）
    const lastReviewedMap = new Map<string, Date | null>();
    if (ids.length > 0) {
      const lrRows = await this.db
        .select({
          questionId: reviewRecord.questionId,
          maxReviewedAt: sql<Date>`MAX(${reviewRecord.reviewedAt})`,
        })
        .from(reviewRecord)
        .where(and(inArray(reviewRecord.questionId, ids), eq(reviewRecord.reviewType, 'question')))
        .groupBy(reviewRecord.questionId);
      for (const r of lrRows) {
        if (r.questionId && r.maxReviewedAt) {
          lastReviewedMap.set(r.questionId, new Date(r.maxReviewedAt));
        }
      }
    }

    // 用户权重设置
    const settingsRows = await this.db.select().from(userSetting).limit(1);
    const s = settingsRows[0];
    const qSettings = {
      qWeightExamFreq: s?.qWeightExamFreq ?? 30,
      qWeightMastery: s?.qWeightMastery ?? 25,
      qWeightWrong: s?.qWeightWrong ?? 20,
      qWeightOverdue: s?.qWeightOverdue ?? 10,
      qWeightDifficulty: s?.qWeightDifficulty ?? 15,
    };

    const items = rows.map((row) => ({
      id: row.id,
      year: row.year,
      subjectId: row.subjectId,
      questionType: row.questionType as ExamQuestion['questionType'],
      questionText: row.questionText,
      answer: '',
      answerKeywords: [],
      source: row.source,
      notes: '',
      difficulty: row.difficulty,
      masteryScore: row.masteryScore ?? 0,
      answered: row.answered ?? false,
      answerCount: row.answerCount ?? 0,
      lastAnsweredAt: row.lastAnsweredAt
        ? row.lastAnsweredAt.toISOString()
        : null,
      cardData: undefined,
      examFrequency: freqMap.get(row.id) ?? 0,
    }));

    // 按优先级重排当前页
    items.sort((a, b) => {
      const scoreA = calculateQuestionPriorityScore({
        examFrequency: freqMap.get(a.id) ?? 0,
        masteryScore: a.masteryScore,
        wrongCount: wrongMap.get(a.id) ?? 0,
        nextReviewAt: null,
        lastReviewedAt: lastReviewedMap.get(a.id) ?? null,
        difficulty: a.difficulty ?? 0,
        settings: qSettings,
      });
      const scoreB = calculateQuestionPriorityScore({
        examFrequency: freqMap.get(b.id) ?? 0,
        masteryScore: b.masteryScore,
        wrongCount: wrongMap.get(b.id) ?? 0,
        nextReviewAt: null,
        lastReviewedAt: lastReviewedMap.get(b.id) ?? null,
        difficulty: b.difficulty ?? 0,
        settings: qSettings,
      });
      return scoreB - scoreA;
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async create(dto: {
    year: number;
    subjectId: string;
    questionType: 'noun_explanation' | 'short_answer' | 'essay' | 'multiple_choice' | 'fill_blank' | 'other';
    questionText: string;
    answer?: string;
    answerKeywords?: string[];
    source?: string;
    difficulty: number;
    knowledgePointIds?: string[];
  }): Promise<ExamQuestion> {
    validateUuid(dto.subjectId, '科目ID');

    const subjectRows = await this.db
      .select({ id: subject.id })
      .from(subject)
      .where(eq(subject.id, dto.subjectId));
    if (subjectRows.length === 0) throw new NotFoundException('科目不存在');

    const kpIds = dto.knowledgePointIds ?? [];
    if (kpIds.length > 0) {
      const kpRows = await this.db
        .select({ id: knowledgePoint.id })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds));
      if (kpRows.length !== kpIds.length) {
        throw new BadRequestException('部分知识点不存在');
      }
    }

    const inserted = await this.db
      .insert(examQuestion)
      .values({
        year: dto.year,
        subjectId: dto.subjectId,
        questionType: dto.questionType,
        questionText: dto.questionText,
        answer: dto.answer ?? null,
        answerKeywords: dto.answerKeywords ?? [],
        source: dto.source ?? null,
        difficulty: dto.difficulty,
      })
      .returning();

    const question = this.toExamQuestion(inserted[0]);

    if (kpIds.length > 0) {
      const values = kpIds.map((kpId, idx) => ({
        questionId: question.id,
        knowledgePointId: kpId,
        relevance: 8,
        isPrimary: idx === 0,
      }));
      await this.db.insert(questionKnowledgePoint).values(values);
    }

    const subjectNameRows = await this.db
      .select({ name: subject.name })
      .from(subject)
      .where(eq(subject.id, question.subjectId));
    if (subjectNameRows.length > 0) question.subjectName = subjectNameRows[0].name;

    if (kpIds.length > 0) {
      const kpRows = await this.db
        .select({
          id: knowledgePoint.id,
          title: knowledgePoint.title,
          masteryScore: knowledgePoint.masteryScore,
          isPrimary: questionKnowledgePoint.isPrimary,
          subjectId: knowledgePoint.subjectId,
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          knowledgePoint,
          eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id),
        )
        .where(eq(questionKnowledgePoint.questionId, question.id));
      question.knowledgePoints = kpRows.map(
        (row): KnowledgePointBrief => ({
          id: row.id,
          title: row.title,
          masteryScore: row.masteryScore,
          isPrimary: row.isPrimary,
          subjectId: row.subjectId,
        }),
      );
      question.knowledgePointCount = kpRows.length;
    } else {
      question.knowledgePoints = [];
      question.knowledgePointCount = 0;
    }

    return question;
  }

  async findOne(id: string): Promise<ExamQuestion> {
    validateUuid(id, '真题ID');
    const rows = await this.db
      .select()
      .from(examQuestion)
      .where(eq(examQuestion.id, id));
    if (rows.length === 0) throw new NotFoundException('真题不存在');
    const question = this.toExamQuestion(rows[0]);

    const subjectRows = await this.db
      .select({ name: subject.name })
      .from(subject)
      .where(eq(subject.id, question.subjectId));
    if (subjectRows.length > 0) question.subjectName = subjectRows[0].name;

    const kpRows = await this.db
      .select({
        id: knowledgePoint.id,
        title: knowledgePoint.title,
        masteryScore: knowledgePoint.masteryScore,
        isPrimary: questionKnowledgePoint.isPrimary,
        subjectId: knowledgePoint.subjectId,
      })
      .from(questionKnowledgePoint)
      .innerJoin(
        knowledgePoint,
        eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id),
      )
      .where(eq(questionKnowledgePoint.questionId, id));

    const kpIds = kpRows.map((r) => r.id);
    const chapterPathsMap = await this.buildChapterPathsMap(kpIds);

    question.knowledgePoints = kpRows.map(
      (row): KnowledgePointBrief => ({
        id: row.id,
        title: row.title,
        masteryScore: row.masteryScore,
        isPrimary: row.isPrimary,
        subjectId: row.subjectId,
        chapterPaths: chapterPathsMap.get(row.id),
      }),
    );

    const freqMap = await this.loadExamFrequencyMap([id]);
    question.examFrequency = freqMap.get(id) ?? 0;

    return question;
  }

  async getReviewDetail(id: string): Promise<QuestionReviewDetail> {
    const question = await this.findOne(id);

    const reviewRows = await this.db
      .select()
      .from(reviewRecord)
      .where(and(eq(reviewRecord.questionId, id), eq(reviewRecord.reviewType, 'question')))
      .orderBy(desc(reviewRecord.reviewedAt))
      .limit(1);
    const latestReview = reviewRows.length > 0 ? this.toReviewRecord(reviewRows[0]) : null;

    const wqRows = await this.db
      .select()
      .from(wrongQuestionTable)
      .where(eq(wrongQuestionTable.questionId, id))
      .limit(1);
    const wrongQuestion = wqRows.length > 0 ? {
      id: wqRows[0].id,
      wrongCount: wqRows[0].wrongCount,
      lastWrongAt: wqRows[0].lastWrongAt ? wqRows[0].lastWrongAt.toISOString() : null,
      userAnswer: wqRows[0].userAnswer ?? null,
      mistakeReason: wqRows[0].mistakeReason ?? null,
      resolved: wqRows[0].resolved,
    } : null;

    return { question, latestReview, wrongQuestion };
  }

  async getHighFreq(query: HighFreqQueryDto): Promise<HighFreqItem[]> {
    const limit = query.limit ?? 20;

    const conditions = [];
    if (query.subjectId) {
      conditions.push(eq(knowledgePoint.subjectId, query.subjectId));
    }
    if (query.source) {
      conditions.push(eq(examQuestion.source, query.source));
    }
    if (query.year) {
      conditions.push(eq(examQuestion.year, query.year));
    }
    if (query.questionType) {
      conditions.push(eq(examQuestion.questionType, query.questionType));
    }
    if (query.keyword) {
      conditions.push(
        or(
          ilike(examQuestion.questionText, `%${query.keyword}%`),
          ilike(knowledgePoint.title, `%${query.keyword}%`),
        ),
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        knowledgePointId: knowledgePoint.id,
        title: knowledgePoint.title,
        count: count(),
        latestYear: sql<number>`max(${examQuestion.year})`,
        subjectName: subject.name,
      })
      .from(questionKnowledgePoint)
      .innerJoin(
        knowledgePoint,
        eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id),
      )
      .innerJoin(
        examQuestion,
        eq(questionKnowledgePoint.questionId, examQuestion.id),
      )
      .innerJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .where(where)
      .groupBy(knowledgePoint.id, subject.name)
      .orderBy(
         desc(sql<number>`count(*)`),
         desc(sql<number>`max(${examQuestion.year})`),
       )
      .limit(limit);

    if (rows.length === 0) return [];

    const kpIds = rows.map((r) => r.knowledgePointId);
    const sourceRows = await this.db
      .select({
        kpId: questionKnowledgePoint.knowledgePointId,
        source: examQuestion.source,
      })
      .from(questionKnowledgePoint)
      .innerJoin(
        examQuestion,
        eq(questionKnowledgePoint.questionId, examQuestion.id),
      )
      .where(
        and(
          inArray(questionKnowledgePoint.knowledgePointId, kpIds),
          query.source
            ? eq(examQuestion.source, query.source)
            : undefined,
        ),
      );

    const sourceMap = new Map<string, string[]>();
    for (const r of sourceRows) {
      if (!r.source) continue;
      const arr = sourceMap.get(r.kpId) ?? [];
      if (!arr.includes(r.source)) arr.push(r.source);
      sourceMap.set(r.kpId, arr);
    }

    const chapterPathsMap = await this.buildChapterPathsMap(kpIds);

    return rows.map(
      (row, index): HighFreqItem => ({
        rank: index + 1,
        knowledgePointId: row.knowledgePointId,
        title: row.title,
        count: Number(row.count),
        latestYear: Number(row.latestYear),
        subjectName: row.subjectName,
        sourceSchools: sourceMap.get(row.knowledgePointId) ?? [],
        chapterPaths: chapterPathsMap.get(row.knowledgePointId),
      }),
    );
  }

  async getHighFreqQuestions(
    query: HighFreqQueryDto & { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<HighFreqQuestion>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const whereClauses: SQL[] = [];

    if (query.subjectId) {
      whereClauses.push(sql`kp.subject_id = ${query.subjectId}`);
    }
    if (query.source) {
      whereClauses.push(sql`eq.source = ${query.source}`);
    }
    if (query.year) {
      whereClauses.push(sql`eq.year = ${query.year}`);
    }
    if (query.questionType) {
      whereClauses.push(sql`eq.question_type = ${query.questionType}`);
    }
    if (query.keyword) {
      whereClauses.push(sql`eq.question_text ILIKE ${`%${query.keyword}%`}`);
    }
    const whereSql = whereClauses.length > 0
      ? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
      : sql``;

    const totalRows = await this.db.execute(sql<{ count: number }>`
      SELECT COUNT(*)::int AS count
      FROM exam_question eq
      LEFT JOIN question_knowledge_point qkp ON eq.id = qkp.question_id
      LEFT JOIN knowledge_point kp ON qkp.knowledge_point_id = kp.id
      ${whereSql}
    `);
    const total = Number(totalRows[0]?.count ?? 0);

    const rows = await this.db.execute(sql<{
      id: string;
      year: number;
      subject_id: string;
      question_type: string;
      question_text: string;
      source: string | null;
      difficulty: number;
      answered: boolean;
      mastery_score: number;
      answer_count: number;
      frequency: number;
     }>`
       SELECT eq.id, eq.year, eq.subject_id, eq.question_type, eq.question_text, eq.source, eq.difficulty,
               eq.answered AS answered, eq.mastery_score AS mastery_score,
               eq.answer_count AS answer_count,
               COUNT(qkp.knowledge_point_id)::int AS frequency
      FROM exam_question eq
      LEFT JOIN question_knowledge_point qkp ON eq.id = qkp.question_id
      LEFT JOIN knowledge_point kp ON qkp.knowledge_point_id = kp.id
      ${whereSql}
      GROUP BY eq.id
      ORDER BY frequency DESC, eq.year DESC, eq.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `);

    const ids = rows.map((r) => r.id);
    const subjectMap = new Map<string, string>();
    const kpMap = new Map<string, KnowledgePointBrief[]>();

    if (ids.length > 0) {
      const kpRows = await this.db
        .select({
          questionId: questionKnowledgePoint.questionId,
          id: knowledgePoint.id,
          title: knowledgePoint.title,
          isPrimary: questionKnowledgePoint.isPrimary,
          subjectId: knowledgePoint.subjectId,
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          knowledgePoint,
          eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id),
        )
        .where(inArray(questionKnowledgePoint.questionId, ids as string[]))
        .orderBy(
          questionKnowledgePoint.questionId,
          desc(questionKnowledgePoint.isPrimary),
        );

      for (const r of kpRows) {
        const arr = kpMap.get(r.questionId) ?? [];
        arr.push({
          id: r.id,
          title: r.title,
          isPrimary: r.isPrimary,
          subjectId: r.subjectId,
        });
        kpMap.set(r.questionId, arr);
      }

      const subjRows = await this.db
        .select({ id: subject.id, name: subject.name })
        .from(subject);
      for (const s of subjRows) subjectMap.set(s.id, s.name);
    }

    const items: HighFreqQuestion[] = (rows as unknown as Array<{
      id: string;
      year: number;
      subject_id: string;
      question_type: string;
      question_text: string;
      source: string | null;
      difficulty: number;
       answered: boolean;
       mastery_score: number;
       answer_count: number;
       frequency: number;
      }>).map(
       (row, index): HighFreqQuestion => ({
         rank: (page - 1) * pageSize + index + 1,
         id: row.id,
         year: row.year,
         subjectId: row.subject_id,
         subjectName: subjectMap.get(row.subject_id) ?? '',
         questionType: row.question_type as QuestionType,
         questionText: row.question_text,
         source: row.source,
         difficulty: row.difficulty,
         answered: row.answered ?? false,
         masteryScore: Number(row.mastery_score) || 0,
         answerCount: Number(row.answer_count) || 0,
         frequency: Number(row.frequency),
         knowledgePoints: kpMap.get(row.id) ?? [],
       }),
     );

    return { items, total, page, pageSize };
  }

  async submit(
    id: string,
    dto: SubmitQuestionResultDto,
  ): Promise<{ success: boolean }> {
    await this.processQuestionResult(id, dto);
    return { success: true };
  }

  async processQuestionResult(
    id: string,
    dto: SubmitQuestionResultDto,
  ): Promise<QuestionSubmitResult> {
    const qRows = await this.db
      .select()
      .from(examQuestion)
      .where(eq(examQuestion.id, id));
    if (qRows.length === 0) throw new NotFoundException('真题不存在');

    const qkpRows = await this.db
      .select()
      .from(questionKnowledgePoint)
      .where(eq(questionKnowledgePoint.questionId, id));
    if (qkpRows.length === 0) {
      // 没有关联知识点也允许提交，但只返回空
      return { knowledgePoints: [], reviewRecords: [], success: true };
    }

    const kpIds = qkpRows.map((r) => r.knowledgePointId);
    const kpList = await this.db
      .select()
      .from(knowledgePoint)
      .where(inArray(knowledgePoint.id, kpIds));
    if (kpList.length === 0) throw new NotFoundException('知识点不存在');

    const now = new Date();
    const score = dto.score ?? 0;
    const nextRetryAt = new Date(now);
    nextRetryAt.setDate(nextRetryAt.getDate() + 1);
    nextRetryAt.setHours(6, 0, 0, 0);

    const updatedKps: typeof knowledgePoint.$inferSelect[] = [];
    const insertedRecords: typeof reviewRecord.$inferSelect[] = [];

    await this.db.transaction(async (tx) => {
      const questionMasteryVal = calculateQuestionMastery(score);

      await tx
        .update(examQuestion)
        .set({
          masteryScore: questionMasteryVal,
          answered: true,
          answerCount: sql`${examQuestion.answerCount} + 1`,
          lastAnsweredAt: now,
        })
        .where(eq(examQuestion.id, id));

      const kpQStats = await tx
        .select({
          knowledgePointId: questionKnowledgePoint.knowledgePointId,
          avgMastery: sql<number>`ROUND(AVG(${examQuestion.masteryScore}))`,
          answeredCount: count(examQuestion.id),
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          examQuestion,
          and(
            eq(examQuestion.id, questionKnowledgePoint.questionId),
            eq(examQuestion.answered, true),
          ),
        )
        .where(
          inArray(
            questionKnowledgePoint.knowledgePointId,
            kpIds,
          ),
        )
        .groupBy(questionKnowledgePoint.knowledgePointId);

      const qStatsMap = new Map<string, { avgMastery: number; answeredCount: number }>();
      for (const s of kpQStats) {
        qStatsMap.set(s.knowledgePointId, {
          avgMastery: Number(s.avgMastery) || 0,
          answeredCount: Number(s.answeredCount) || 0,
        });
      }

      const selfRatingFromScore = this.scoreToSelfRating(score);

      for (const kp of kpList) {
        const stats = qStatsMap.get(kp.id) ?? {
          avgMastery: 0,
          answeredCount: 0,
        };
        const newQuestionMastery = stats.avgMastery;
        const newAnsweredCount = stats.answeredCount;

        const newOverallMastery = calcOverallMastery(
          kp.recallMastery ?? 0,
          newQuestionMastery,
          newAnsweredCount,
        );

        const result = calculateQuestionResult({
          currentMastery: kp.masteryScore,
          currentStage: kp.reviewStage,
          consecutiveCorrect: kp.consecutiveCorrect,
          consecutiveWrong: kp.consecutiveWrong,
          questionScore: score,
          totalReviewCount: kp.totalReviewCount,
        });

        const patch: Partial<typeof knowledgePoint.$inferInsert> = {
          masteryScore: newOverallMastery,
          questionMastery: newQuestionMastery,
          answeredQuestionCount: newAnsweredCount,
          status: statusFromMastery(newOverallMastery),
          lastReviewedAt: now,
          nextReviewAt: result.nextReviewAt,
          reviewStage: result.newStage,
          consecutiveCorrect: result.consecutiveCorrect,
          consecutiveWrong: result.consecutiveWrong,
          totalReviewCount: kp.totalReviewCount + 1,
          totalQuestionCount: kp.totalQuestionCount + 1,
          correctQuestionCount:
            kp.correctQuestionCount + (score >= 60 ? 1 : 0),
          updatedAt: now,
        };

        const updated = await tx
          .update(knowledgePoint)
          .set(patch)
          .where(eq(knowledgePoint.id, kp.id))
          .returning();
        if (updated.length > 0) updatedKps.push(updated[0]);

        const inserted = await tx
          .insert(reviewRecord)
          .values({
            knowledgePointId: kp.id,
            questionId: id,
            selfRating: selfRatingFromScore,
            recallScore: null,
            questionScore: score,
            oldMasteryScore: kp.masteryScore,
            newMasteryScore: newOverallMastery,
            oldReviewStage: kp.reviewStage,
            newReviewStage: result.newStage,
            nextReviewAt: result.nextReviewAt,
            reviewType: 'question',
            reviewedAt: now,
            userAnswer: dto.userAnswer || null,
          })
          .returning();
        if (inserted.length > 0) insertedRecords.push(inserted[0]);
      }

      if (score < 60) {
        const primaryKpId = kpList[0]?.id ?? null;
        const existingWq = await tx
          .select()
          .from(wrongQuestionTable)
          .where(eq(wrongQuestionTable.questionId, id))
          .limit(1);
        if (existingWq.length > 0) {
          const patch: Partial<typeof wrongQuestionTable.$inferInsert> = {
            wrongCount: existingWq[0].wrongCount + 1,
            lastWrongAt: now,
            resolved: false,
            nextRetryAt,
          };
          if (dto.userAnswer !== undefined && dto.userAnswer !== '') {
            patch.userAnswer = dto.userAnswer;
          }
          if (dto.mistakeReason) {
            patch.mistakeReason = dto.mistakeReason;
          }
          if (!existingWq[0].knowledgePointId && primaryKpId) {
            patch.knowledgePointId = primaryKpId;
          }
          await tx
            .update(wrongQuestionTable)
            .set(patch)
            .where(eq(wrongQuestionTable.id, existingWq[0].id));
        } else {
          await tx.insert(wrongQuestionTable).values({
            questionId: id,
            knowledgePointId: primaryKpId,
            wrongCount: 1,
            lastWrongAt: now,
            firstWrongAt: now,
            resolved: false,
            nextRetryAt,
            userAnswer: dto.userAnswer || null,
            mistakeReason: dto.mistakeReason ?? null,
          });
        }
      }
    });

    return {
      knowledgePoints: updatedKps.map((row) => this.toKnowledgePoint(row)),
      reviewRecords: insertedRecords.map((row) => this.toReviewRecord(row)),
      success: true,
    };
  }

  private scoreToSelfRating(score: number): 'again' | 'hard' | 'good' | 'easy' {
    if (score >= 80) return 'easy';
    if (score >= 60) return 'good';
    if (score >= 30) return 'hard';
    return 'again';
  }

  async getYearOverview(subjectId?: string): Promise<YearQuestionOverview[]> {
    const cacheKey = subjectId
      ? `${ExamQuestionsService.YEAR_OVERVIEW_CACHE_KEY}:${subjectId}`
      : ExamQuestionsService.YEAR_OVERVIEW_CACHE_KEY;
    const cached = await this.cacheManager.get<YearQuestionOverview[]>(cacheKey);
    if (cached) return cached;

    const conditions = [];
    if (subjectId) {
      conditions.push(eq(examQuestion.subjectId, subjectId));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        year: examQuestion.year,
        questionType: examQuestion.questionType,
        questionCount: count(),
      })
      .from(examQuestion)
      .where(where)
      .groupBy(examQuestion.year, examQuestion.questionType)
      .orderBy(desc(examQuestion.year));

    const yearMap = new Map<number, {
      questionCount: number;
      subjectIds: Set<string>;
      typeDistribution: Record<string, number>;
    }>();

    for (const row of rows) {
      const entry = yearMap.get(row.year) ?? {
        questionCount: 0,
        subjectIds: new Set<string>(),
        typeDistribution: {
          noun_explanation: 0,
          short_answer: 0,
          essay: 0,
          multiple_choice: 0,
          fill_blank: 0,
          other: 0,
        } as Record<string, number>,
      };
      entry.questionCount += Number(row.questionCount);
      entry.typeDistribution[row.questionType] =
        (entry.typeDistribution[row.questionType] ?? 0) + Number(row.questionCount);
      yearMap.set(row.year, entry);
    }

    if (yearMap.size > 0) {
      const years = [...yearMap.keys()];
      const subjRows = await this.db
        .select({
          year: examQuestion.year,
          subjectId: examQuestion.subjectId,
        })
        .from(examQuestion)
        .where(
          where
            ? and(where, inArray(examQuestion.year, years))
            : inArray(examQuestion.year, years),
        )
        .groupBy(examQuestion.year, examQuestion.subjectId);
      for (const row of subjRows) {
        const entry = yearMap.get(row.year);
        if (entry) entry.subjectIds.add(row.subjectId);
      }
    }

    const result: YearQuestionOverview[] = [];
    for (const [year, entry] of yearMap) {
      result.push({
        year,
        questionCount: entry.questionCount,
        subjectCount: entry.subjectIds.size,
        typeDistribution: entry.typeDistribution as Record<QuestionType, number>,
      });
    }
    result.sort((a, b) => b.year - a.year);

    await this.cacheManager.set(
      cacheKey,
      result,
      ExamQuestionsService.OVERVIEW_CACHE_TTL,
    );
    return result;
  }

  async getSchoolOverview(
    keyword?: string,
  ): Promise<SchoolQuestionOverview[]> {
    const cacheKey = keyword
      ? `${ExamQuestionsService.SCHOOL_OVERVIEW_CACHE_KEY}:${keyword}`
      : ExamQuestionsService.SCHOOL_OVERVIEW_CACHE_KEY;
    const cached = await this.cacheManager.get<SchoolQuestionOverview[]>(cacheKey);
    if (cached) return cached;

    const conditions = [sql`${examQuestion.source} IS NOT NULL`];
    if (keyword) {
      conditions.push(ilike(examQuestion.source, `%${keyword}%`));
    }
    const where = and(...conditions);

    const rows = await this.db
      .select({
        school: examQuestion.source,
        questionCount: count(),
        earliestYear: sql<number>`min(${examQuestion.year})`,
        latestYear: sql<number>`max(${examQuestion.year})`,
      })
      .from(examQuestion)
      .where(where)
      .groupBy(examQuestion.source)
      .orderBy(desc(sql`count(*)`), examQuestion.source);

    const schools = rows
      .map((r) => r.school)
      .filter((s): s is string => s != null);

    let subjectCountMap = new Map<string, number>();
    if (schools.length > 0) {
      const subjRows = await this.db
        .select({
          school: examQuestion.source,
          subjectCount: sql<number>`count(DISTINCT ${examQuestion.subjectId})`,
        })
        .from(examQuestion)
        .where(
          and(
            sql`${examQuestion.source} IS NOT NULL`,
            inArray(examQuestion.source, schools),
          ),
        )
        .groupBy(examQuestion.source);
      for (const row of subjRows) {
        if (row.school) subjectCountMap.set(row.school, Number(row.subjectCount));
      }
    }

    const result: SchoolQuestionOverview[] = rows
      .filter((r): r is typeof r & { school: string } => r.school != null)
      .map((row) => ({
        school: row.school,
        questionCount: Number(row.questionCount),
        earliestYear: Number(row.earliestYear),
        latestYear: Number(row.latestYear),
        subjectCount: subjectCountMap.get(row.school) ?? 0,
      }));

    if (!keyword) {
      await this.cacheManager.set(
        cacheKey,
        result,
        ExamQuestionsService.OVERVIEW_CACHE_TTL,
      );
    }
    return result;
  }

  async getSubjectOverview(): Promise<SubjectQuestionOverview[]> {
    const cacheKey = ExamQuestionsService.SUBJECT_OVERVIEW_CACHE_KEY;
    const cached = await this.cacheManager.get<SubjectQuestionOverview[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.db
      .select({
        subjectId: examQuestion.subjectId,
        subjectName: subject.name,
        questionType: examQuestion.questionType,
        questionCount: count(),
      })
      .from(examQuestion)
      .innerJoin(subject, eq(examQuestion.subjectId, subject.id))
      .groupBy(examQuestion.subjectId, subject.name, examQuestion.questionType)
      .orderBy(desc(sql<number>`count(*)::int`), subject.name);

    const subjectMap = new Map<string, {
      subjectName: string;
      questionCount: number;
      years: Set<number>;
      schools: Set<string>;
      typeDistribution: Record<string, number>;
    }>();

    for (const row of rows) {
      if (!row.subjectId) continue;
      const entry = subjectMap.get(row.subjectId) ?? {
        subjectName: row.subjectName ?? '',
        questionCount: 0,
        years: new Set<number>(),
        schools: new Set<string>(),
        typeDistribution: {
          noun_explanation: 0,
          short_answer: 0,
          essay: 0,
          multiple_choice: 0,
          fill_blank: 0,
          other: 0,
        } as Record<string, number>,
      };
      entry.questionCount += Number(row.questionCount);
      entry.typeDistribution[row.questionType] =
        (entry.typeDistribution[row.questionType] ?? 0) + Number(row.questionCount);
      subjectMap.set(row.subjectId, entry);
    }

    if (subjectMap.size > 0) {
      const subjectIds = [...subjectMap.keys()];
      const detailRows = await this.db
        .select({
          subjectId: examQuestion.subjectId,
          year: examQuestion.year,
          source: examQuestion.source,
        })
        .from(examQuestion)
        .where(inArray(examQuestion.subjectId, subjectIds));
      for (const row of detailRows) {
        const entry = subjectMap.get(row.subjectId);
        if (!entry) continue;
        if (row.year) entry.years.add(row.year);
        if (row.source) entry.schools.add(row.source);
      }
    }

    const result: SubjectQuestionOverview[] = [];
    for (const [subjectId, entry] of subjectMap) {
      result.push({
        subjectId,
        subjectName: entry.subjectName,
        questionCount: entry.questionCount,
        yearCount: entry.years.size,
        schoolCount: entry.schools.size,
        typeDistribution: entry.typeDistribution as Record<QuestionType, number>,
      });
    }
    result.sort((a, b) => b.questionCount - a.questionCount);

    await this.cacheManager.set(
      cacheKey,
      result,
      ExamQuestionsService.OVERVIEW_CACHE_TTL,
    );
    return result;
  }

  async getQuestionsByYear(
    year: number,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.getBriefListPaginated({ year }, page, pageSize);
  }

  async getQuestionsBySchool(
    school: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.getBriefListPaginated({ source: school }, page, pageSize);
  }

  async getQuestionsBySubject(
    subjectId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    return this.getBriefListPaginated({ subjectId }, page, pageSize);
  }

  private async getBriefListPaginated(
    filters: { year?: number; source?: string; subjectId?: string },
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
    const conditions = [];
    if (filters.year !== undefined)
      conditions.push(eq(examQuestion.year, filters.year));
    if (filters.source !== undefined)
      conditions.push(eq(examQuestion.source, filters.source));
    if (filters.subjectId)
      conditions.push(eq(examQuestion.subjectId, filters.subjectId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await this.db
      .select({ count: count() })
      .from(examQuestion)
      .where(where);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select({
        id: examQuestion.id,
        year: examQuestion.year,
        subjectId: examQuestion.subjectId,
        subjectName: subject.name,
        questionType: examQuestion.questionType,
        questionText: examQuestion.questionText,
        source: examQuestion.source,
        difficulty: examQuestion.difficulty,
        masteryScore: examQuestion.masteryScore,
        answered: examQuestion.answered,
        answerCount: examQuestion.answerCount,
      })
      .from(examQuestion)
      .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
      .where(where)
      .orderBy(desc(examQuestion.year), desc(examQuestion.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const ids = rows.map((r) => r.id);
    const kpCountRows = ids.length > 0
      ? await this.db
          .select({
            questionId: questionKnowledgePoint.questionId,
            kpCount: count(),
          })
          .from(questionKnowledgePoint)
          .where(inArray(questionKnowledgePoint.questionId, ids))
          .groupBy(questionKnowledgePoint.questionId)
      : [];
    const kpCountMap = new Map<string, number>();
    for (const r of kpCountRows) {
      kpCountMap.set(r.questionId, Number(r.kpCount));
    }

    const freqMap = ids.length > 0
      ? await this.loadExamFrequencyMap(ids)
      : new Map<string, number>();

    const items: ExamQuestionBrief[] = rows.map((row) => ({
      id: row.id,
      year: row.year,
      subjectId: row.subjectId,
      subjectName: row.subjectName ?? '',
      questionType: row.questionType as QuestionType,
      questionText: row.questionText,
      source: row.source,
      difficulty: row.difficulty,
      masteryScore: row.masteryScore ?? 0,
      answered: row.answered ?? false,
      answerCount: row.answerCount ?? 0,
      knowledgePointCount: kpCountMap.get(row.id) ?? 0,
      examFrequency: freqMap.get(row.id) ?? 0,
    }));

    return { items, total, page, pageSize };
  }

  async getYearGroups(subjectId?: string): Promise<YearQuestionGroup[]> {
    const conditions = [];
    if (subjectId) {
      conditions.push(sql`eq.subject_id = ${subjectId}`);
    }
    const whereSql = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const rows = await this.db.execute(sql<{ year: number; question_count: number; questions_json: string }>`
      SELECT
        eq.year,
        COUNT(*) AS question_count,
        json_agg(
          json_build_object(
            'id', eq.id,
            'year', eq.year,
            'subject_id', eq.subject_id,
            'subject_name', s.name,
            'question_type', eq.question_type,
            'question_text', eq.question_text,
            'answer', eq.answer,
            'answer_keywords', COALESCE(eq.answer_keywords, '{}'::text[]),
            'source', eq.source,
            'notes', eq.notes,
             'difficulty', eq.difficulty,
             'kp_count', COALESCE(qkp_cnt.cnt, 0),
             'exam_frequency', COALESCE(q_freq.max_freq, 0)
           ) ORDER BY eq.id
         )::text AS questions_json
       FROM exam_question eq
       LEFT JOIN subject s ON s.id = eq.subject_id
       LEFT JOIN (
         SELECT question_id, COUNT(*) AS cnt
         FROM question_knowledge_point
         GROUP BY question_id
       ) qkp_cnt ON qkp_cnt.question_id = eq.id
       LEFT JOIN (
         SELECT qkp.question_id, MAX(kp.exam_frequency) AS max_freq
         FROM question_knowledge_point qkp
         INNER JOIN knowledge_point kp ON qkp.knowledge_point_id = kp.id
         GROUP BY qkp.question_id
       ) q_freq ON q_freq.question_id = eq.id
       ${whereSql}
      GROUP BY eq.year
      ORDER BY eq.year DESC
    `);

    return rows.map((row: { year: number; question_count: number; questions_json: string }) => {
      const parsed = JSON.parse(row.questions_json) as Array<{
        id: string;
        year: number;
        subject_id: string;
        subject_name: string;
        question_type: string;
        question_text: string;
        answer: string | null;
        answer_keywords: string[];
        source: string | null;
        notes: string | null;
        difficulty: number;
        mastery_score: number;
        answered: boolean;
         answer_count: number;
         last_answered_at: string | null;
         kp_count: number;
         exam_frequency: number;
       }>;
       return {
         year: row.year,
         questionCount: Number(row.question_count),
         questions: parsed.map((q): ExamQuestion => ({
           id: q.id,
           year: q.year,
           subjectId: q.subject_id,
           subjectName: q.subject_name,
           questionType: q.question_type as ExamQuestion['questionType'],
           questionText: q.question_text,
           answer: q.answer,
           answerKeywords: q.answer_keywords,
           source: q.source,
           notes: q.notes,
           difficulty: q.difficulty,
           masteryScore: q.mastery_score,
           answered: q.answered,
           answerCount: q.answer_count,
           lastAnsweredAt: q.last_answered_at,
           knowledgePointCount: q.kp_count,
           examFrequency: q.exam_frequency,
         })),
       };
     });
   }

   async getSchoolGroups(
    keyword?: string,
  ): Promise<SchoolQuestionGroup[]> {
    const conditions = [sql`eq.source IS NOT NULL`];
    if (keyword) {
      conditions.push(sql`eq.source ILIKE ${`%${keyword}%`}`);
    }
    const whereSql = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const rows = await this.db.execute(sql<{ school: string; question_count: number; questions_json: string }>`
      SELECT
        eq.source AS school,
        COUNT(*) AS question_count,
        json_agg(
          json_build_object(
            'id', eq.id,
            'year', eq.year,
            'subject_id', eq.subject_id,
            'subject_name', s.name,
            'question_type', eq.question_type,
            'question_text', eq.question_text,
            'answer', eq.answer,
            'answer_keywords', COALESCE(eq.answer_keywords, '{}'::text[]),
            'source', eq.source,
            'notes', eq.notes,
            'difficulty', eq.difficulty,
            'mastery_score', COALESCE(eq.mastery_score, 0),
            'answered', COALESCE(eq.answered, false),
            'answer_count', COALESCE(eq.answer_count, 0),
             'last_answered_at', eq.last_answered_at,
             'kp_count', COALESCE(qkp_cnt.cnt, 0),
             'exam_frequency', COALESCE(q_freq.max_freq, 0)
           ) ORDER BY eq.year DESC, eq.id
         )::text AS questions_json
       FROM exam_question eq
       LEFT JOIN subject s ON s.id = eq.subject_id
       LEFT JOIN (
         SELECT question_id, COUNT(*) AS cnt
         FROM question_knowledge_point
         GROUP BY question_id
       ) qkp_cnt ON qkp_cnt.question_id = eq.id
       LEFT JOIN (
         SELECT qkp.question_id, MAX(kp.exam_frequency) AS max_freq
         FROM question_knowledge_point qkp
         INNER JOIN knowledge_point kp ON qkp.knowledge_point_id = kp.id
         GROUP BY qkp.question_id
       ) q_freq ON q_freq.question_id = eq.id
       ${whereSql}
      GROUP BY eq.source
      ORDER BY question_count DESC, eq.source ASC
    `);

    return rows.map((row: { school: string; question_count: number; questions_json: string }) => {
      const parsed = JSON.parse(row.questions_json) as Array<{
        id: string;
        year: number;
        subject_id: string;
        subject_name: string;
        question_type: string;
        question_text: string;
        answer: string | null;
        answer_keywords: string[];
        source: string | null;
        notes: string | null;
        difficulty: number;
        mastery_score: number;
        answered: boolean;
         answer_count: number;
         last_answered_at: string | null;
         kp_count: number;
         exam_frequency: number;
       }>;
       return {
         school: row.school,
         questionCount: Number(row.question_count),
         questions: parsed.map((q): ExamQuestion => ({
           id: q.id,
           year: q.year,
           subjectId: q.subject_id,
           subjectName: q.subject_name,
           questionType: q.question_type as ExamQuestion['questionType'],
           questionText: q.question_text,
           answer: q.answer,
           answerKeywords: q.answer_keywords,
           source: q.source,
           notes: q.notes,
           difficulty: q.difficulty,
           masteryScore: q.mastery_score,
           answered: q.answered,
           answerCount: q.answer_count,
           lastAnsweredAt: q.last_answered_at,
           knowledgePointCount: q.kp_count,
           examFrequency: q.exam_frequency,
         })),
       };
     });
   }

  async updateDifficulty(id: string, difficulty: number): Promise<ExamQuestion> {
    const updated = await this.db
      .update(examQuestion)
      .set({ difficulty })
      .where(eq(examQuestion.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('真题不存在');
    return this.toExamQuestion(updated[0]);
  }

  async addKnowledgePoint(
    questionId: string,
    knowledgePointId: string,
  ): Promise<ExamQuestion> {
    validateUuid(questionId, '真题ID');
    validateUuid(knowledgePointId, '知识点ID');

    const qRows = await this.db
      .select({ id: examQuestion.id })
      .from(examQuestion)
      .where(eq(examQuestion.id, questionId));
    if (qRows.length === 0) throw new NotFoundException('真题不存在');

    const kpRows = await this.db
      .select({ id: knowledgePoint.id })
      .from(knowledgePoint)
      .where(eq(knowledgePoint.id, knowledgePointId));
    if (kpRows.length === 0) throw new NotFoundException('知识点不存在');

    const existing = await this.db
      .select()
      .from(questionKnowledgePoint)
      .where(and(
        eq(questionKnowledgePoint.questionId, questionId),
        eq(questionKnowledgePoint.knowledgePointId, knowledgePointId),
      ));
    if (existing.length > 0) {
      throw new ConflictException('该知识点已关联');
    }

    const primaryCount = await this.db
      .select({ count: count() })
      .from(questionKnowledgePoint)
      .where(eq(questionKnowledgePoint.questionId, questionId));
    const isPrimary = Number(primaryCount[0]?.count ?? 0) === 0;

    await this.db.insert(questionKnowledgePoint).values({
      questionId,
      knowledgePointId,
      relevance: 8,
      isPrimary,
    });

    await this.recalcKnowledgePointExamFrequency(knowledgePointId);

    return this.findOne(questionId);
  }

  async removeKnowledgePoint(
    questionId: string,
    knowledgePointId: string,
  ): Promise<ExamQuestion> {
    validateUuid(questionId, '真题ID');
    validateUuid(knowledgePointId, '知识点ID');

    const deleted = await this.db
      .delete(questionKnowledgePoint)
      .where(and(
        eq(questionKnowledgePoint.questionId, questionId),
        eq(questionKnowledgePoint.knowledgePointId, knowledgePointId),
      ))
      .returning({ questionId: questionKnowledgePoint.questionId });
    if (deleted.length === 0) throw new NotFoundException('关联不存在');

    const remainingPrimary = await this.db
      .select()
      .from(questionKnowledgePoint)
      .where(and(
        eq(questionKnowledgePoint.questionId, questionId),
        eq(questionKnowledgePoint.isPrimary, true),
      ));
    if (remainingPrimary.length === 0) {
      const firstRemaining = await this.db
        .select()
        .from(questionKnowledgePoint)
        .where(eq(questionKnowledgePoint.questionId, questionId))
        .orderBy(desc(questionKnowledgePoint.relevance))
        .limit(1);
      if (firstRemaining.length > 0) {
        await this.db
          .update(questionKnowledgePoint)
          .set({ isPrimary: true })
          .where(eq(questionKnowledgePoint.knowledgePointId, firstRemaining[0].knowledgePointId));
      }
    }

    await this.recalcKnowledgePointExamFrequency(knowledgePointId);

    return this.findOne(questionId);
  }

  private async recalcKnowledgePointExamFrequency(kpId: string): Promise<void> {
    const result = await this.db
      .select({ count: count() })
      .from(questionKnowledgePoint)
      .where(eq(questionKnowledgePoint.knowledgePointId, kpId));
    const freq = Number(result[0]?.count ?? 0);
    await this.db
      .update(knowledgePoint)
      .set({ examFrequency: freq })
      .where(eq(knowledgePoint.id, kpId));
  }

  private async loadExamFrequencyMap(
    questionIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (questionIds.length === 0) return result;

    const rows = await this.db
      .select({
        questionId: questionKnowledgePoint.questionId,
        maxFreq: sql<number>`MAX(${knowledgePoint.examFrequency})`,
      })
      .from(questionKnowledgePoint)
      .innerJoin(
        knowledgePoint,
        eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id),
      )
      .where(inArray(questionKnowledgePoint.questionId, questionIds))
      .groupBy(questionKnowledgePoint.questionId);

    for (const r of rows) {
      if (r.questionId) {
        result.set(r.questionId, Number(r.maxFreq) || 0);
      }
    }
    return result;
  }

  private toExamQuestion(
    row: typeof examQuestion.$inferSelect,
  ): ExamQuestion {
    return {
      id: row.id,
      year: row.year,
      subjectId: row.subjectId,
      questionType: row.questionType as ExamQuestion['questionType'],
      questionText: row.questionText,
      answer: row.answer,
      answerKeywords: row.answerKeywords ?? [],
      source: row.source,
      notes: row.notes,
      difficulty: row.difficulty,
      masteryScore: row.masteryScore ?? 0,
      answered: row.answered ?? false,
      answerCount: row.answerCount ?? 0,
      lastAnsweredAt: row.lastAnsweredAt
        ? row.lastAnsweredAt.toISOString()
        : null,
      cardData: row.cardData as KnowledgePointCardData | undefined,
    };
  }

  private async buildChapterPathsMap(
    kpIds: string[],
  ): Promise<Map<string, KnowledgePointChapterPaths>> {
    const result = new Map<string, KnowledgePointChapterPaths>();
    if (kpIds.length === 0) return result;

    const kpRows = await this.db
      .select({
        id: knowledgePoint.id,
        chapterId: knowledgePoint.chapterId,
      })
      .from(knowledgePoint)
      .where(inArray(knowledgePoint.id, kpIds));
    const kpChapterMap = new Map<string, string>();
    for (const r of kpRows) {
      kpChapterMap.set(r.id, r.chapterId);
      result.set(r.id, { examSyllabus: [], textbook: [] });
    }

    const examChapterIds = [...new Set(kpRows.map((r) => r.chapterId))] as string[];
    const examPathMap = await this.buildChapterPathMap(examChapterIds);
    for (const r of kpRows) {
      const existing = result.get(r.id);
      if (existing) {
        existing.examSyllabus = examPathMap.get(r.chapterId) ?? [];
      }
    }

    const tbRows = await this.db
      .select({
        kpId: knowledgePointTextbookChapter.knowledgePointId,
        chapterId: knowledgePointTextbookChapter.chapterId,
        isPrimary: knowledgePointTextbookChapter.isPrimary,
      })
      .from(knowledgePointTextbookChapter)
      .where(inArray(knowledgePointTextbookChapter.knowledgePointId, kpIds));
    const kpTbMap = new Map<string, string>();
    for (const r of tbRows) {
      if (!r.kpId || !r.chapterId) continue;
      const existing = kpTbMap.get(r.kpId);
      if (!existing || r.isPrimary) kpTbMap.set(r.kpId, r.chapterId);
    }
    const tbChapterIds = [...new Set([...kpTbMap.values()])];
    const tbPathMap = await this.buildChapterPathMap(tbChapterIds);
    for (const [kpId, tbChId] of kpTbMap) {
      const existing = result.get(kpId);
      if (existing) {
        existing.textbook = tbPathMap.get(tbChId) ?? [];
      }
    }

    return result;
  }

  private async buildChapterPathMap(
    chapterIds: string[],
  ): Promise<Map<string, ChapterPathNode[]>> {
    const result = new Map<string, ChapterPathNode[]>();
    if (chapterIds.length === 0) return result;

    const allIds = new Set<string>(chapterIds);
    const nodeMap = new Map<string, { id: string; title: string; level: number; parentChapterId: string | null }>();
    let queue = [...chapterIds];
    let depth = 0;
    const maxDepth = 10;
    while (queue.length > 0 && depth < maxDepth) {
      const rows = await this.db
        .select({
          id: chapter.id,
          title: chapter.title,
          level: chapter.level,
          parentChapterId: chapter.parentChapterId,
        })
        .from(chapter)
        .where(inArray(chapter.id, queue));
      const nextQueue: string[] = [];
      for (const r of rows) {
        nodeMap.set(r.id, r);
        if (r.parentChapterId && !allIds.has(r.parentChapterId)) {
          allIds.add(r.parentChapterId);
          nextQueue.push(r.parentChapterId);
        }
      }
      queue = nextQueue;
      depth++;
    }

    const buildPath = (id: string): ChapterPathNode[] => {
      const path: ChapterPathNode[] = [];
      let cur: string | null = id;
      while (cur) {
        const node = nodeMap.get(cur);
        if (!node) break;
        path.unshift({ id: node.id, title: node.title, level: node.level });
        cur = node.parentChapterId;
      }
      return path;
    };

    for (const id of chapterIds) {
      result.set(id, buildPath(id));
    }
    return result;
  }

  async getAllSources(): Promise<string[]> {
    const rows = await this.db
      .select({ source: examQuestion.source })
      .from(examQuestion)
      .where(sql`${examQuestion.source} IS NOT NULL`)
      .groupBy(examQuestion.source)
      .orderBy(examQuestion.source);
    return rows.map((r) => r.source).filter((s): s is string => s != null);
  }

  async updateCardData(
    id: string,
    cardData: KnowledgePointCardData,
  ): Promise<ExamQuestion> {
    const now = new Date();
    const updated = await this.db
      .update(examQuestion)
      .set({ cardData, updatedAt: now })
      .where(eq(examQuestion.id, id))
      .returning({ id: examQuestion.id });
    if (updated.length === 0) throw new NotFoundException('真题不存在');
    return this.findOne(id);
  }

  async updateAnswer(id: string, answer: string): Promise<ExamQuestion> {
    const now = new Date();
    const updated = await this.db
      .update(examQuestion)
      .set({ answer, updatedAt: now })
      .where(eq(examQuestion.id, id))
      .returning({ id: examQuestion.id });
    if (updated.length === 0) throw new NotFoundException('真题不存在');
    return this.findOne(id);
  }

  async updateQuestionText(
    id: string,
    questionText: string,
  ): Promise<ExamQuestion> {
    const now = new Date();
    const updated = await this.db
      .update(examQuestion)
      .set({ questionText, updatedAt: now })
      .where(eq(examQuestion.id, id))
      .returning({ id: examQuestion.id });
    if (updated.length === 0) throw new NotFoundException('真题不存在');
    return this.findOne(id);
  }

  async updateAnswerKeywords(
    id: string,
    answerKeywords: string[],
  ): Promise<ExamQuestion> {
    validateUuid(id, '真题ID');
    const now = new Date();
    const updated = await this.db
      .update(examQuestion)
      .set({ answerKeywords, updatedAt: now })
      .where(eq(examQuestion.id, id))
      .returning({ id: examQuestion.id });
    if (updated.length === 0) throw new NotFoundException('真题不存在');
    return this.findOne(id);
  }

  private toKnowledgePoint(
    row: typeof knowledgePoint.$inferSelect,
  ): KnowledgePoint {
    return {
      id: row.id,
      subjectId: row.subjectId,
      chapterId: row.chapterId,
      syllabusItemId: row.syllabusItemId,
      title: row.title,
      requirementLevel: row.requirementLevel as KnowledgePoint['requirementLevel'],
      importanceScore: row.importanceScore,
      examFrequency: row.examFrequency,
      masteryScore: row.masteryScore,
      recallMastery: row.recallMastery ?? 0,
      questionMastery: row.questionMastery ?? 0,
      answeredQuestionCount: row.answeredQuestionCount ?? 0,
      status: row.status as KnowledgePoint['status'],
      firstLearnedAt: row.firstLearnedAt ? row.firstLearnedAt.toISOString() : null,
      lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
      nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
      reviewStage: row.reviewStage,
      consecutiveCorrect: row.consecutiveCorrect,
      consecutiveWrong: row.consecutiveWrong,
      totalReviewCount: row.totalReviewCount,
      totalQuestionCount: row.totalQuestionCount,
      correctQuestionCount: row.correctQuestionCount,
       manuallyPinned: row.manuallyPinned,
       isWeakMarked: row.isWeakMarked,
       weakMarkedAt: row.weakMarkedAt ? row.weakMarkedAt.toISOString() : null,
       weakMarkReason: (row.weakMarkReason as KnowledgePoint['weakMarkReason']) ?? null,
       cardData: row.cardData as KnowledgePointCardData,
    };
  }

  private toReviewRecord(
    row: typeof reviewRecord.$inferSelect,
  ): ReviewRecord {
    return {
      id: row.id,
      knowledgePointId: row.knowledgePointId,
      reviewedAt: row.reviewedAt.toISOString(),
      selfRating: row.selfRating as ReviewRecord['selfRating'],
      recallScore: row.recallScore,
      questionScore: row.questionScore,
      oldMasteryScore: row.oldMasteryScore,
      newMasteryScore: row.newMasteryScore,
      oldReviewStage: row.oldReviewStage,
      newReviewStage: row.newReviewStage,
      nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
      reviewType: row.reviewType,
      notes: row.notes,
      userAnswer: row.userAnswer ?? null,
    };
  }
}
