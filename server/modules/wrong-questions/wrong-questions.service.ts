import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { and, desc, eq, count, inArray, sql, ilike } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type {
    WrongQuestionWithDetail,
    PaginatedResponse,
    TopWrongItem,
    ChapterPathNode,
    KnowledgePointChapterPaths,
    WrongQuestionStats,
    WrongSubjectDistributionItem,
    WrongReasonDistributionItem,
    WrongQuestionStatsOverview,
    WeakMarkKnowledgePoint,
    KnowledgePointStatus,
    WeakMarkReason,
    ErrorTagDistributionItem,
    ErrorTag,
    WrongQuestion,
  } from '../../shared/api.interface';
import { ERROR_TAG_VALUES } from '../../shared/api.interface';
import {
  wrongQuestion,
  knowledgePoint,
  examQuestion,
  subject,
  chapter,
  knowledgePointTextbookChapter,
  questionKnowledgePoint as questionKnowledgePointTable,
  userSetting,
} from '../../database/schema';
import { calculateQuestionPriorityScore } from '../../common/utils/review-algorithm';
import {
    WrongQuestionListQueryDto,
    UpdateWrongQuestionDto,
    WrongQuestionTopQueryDto,
    BatchRemoveWrongQuestionsDto,
    WeakKnowledgePointsQueryDto,
  } from './dto/wrong-questions.dto';

@Injectable()
export class WrongQuestionsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async findList(
    query: WrongQuestionListQueryDto,
  ): Promise<PaginatedResponse<WrongQuestionWithDetail>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const conditions = [];
    if (query.subjectId) {
      conditions.push(eq(examQuestion.subjectId, query.subjectId));
    }
    if (query.resolved !== undefined) {
      conditions.push(eq(wrongQuestion.resolved, query.resolved === 'true'));
    }
    if (query.mistakeReason) {
      conditions.push(eq(wrongQuestion.mistakeReason, query.mistakeReason));
    }
    if (query.keyword && query.keyword.trim().length > 0) {
      conditions.push(ilike(examQuestion.questionText, `%${query.keyword.trim()}%`));
    }
   if (query.errorTags && query.errorTags.length > 0) {
     const validTags = query.errorTags.filter((t) =>
       ERROR_TAG_VALUES.includes(t as ErrorTag),
     );
     if (validTags.length > 0) {
       conditions.push(
         sql`${wrongQuestion.errorTags} && ARRAY[${sql.join(validTags.map((t) => sql`${t}`), sql`, `)}]::text[]`,
       );
     }
   }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await this.db
      .select({ count: count() })
      .from(wrongQuestion)
      .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
      .where(where);
    const total = totalResult[0]?.count ?? 0;

     const rows = await this.db
       .select({
         wrongQuestion,
         questionText: examQuestion.questionText,
         questionYear: examQuestion.year,
         questionType: examQuestion.questionType,
         questionSource: examQuestion.source,
          difficulty: examQuestion.difficulty,
          masteryScore: examQuestion.masteryScore,
          answerCount: examQuestion.answerCount,
          knowledgePointTitle: knowledgePoint.title,
          subjectName: subject.name,
        })
        .from(wrongQuestion)
        .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
        .leftJoin(
          knowledgePoint,
          eq(wrongQuestion.knowledgePointId, knowledgePoint.id),
        )
        .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
        .where(where)
        .orderBy(
          desc(wrongQuestion.wrongCount),
          desc(wrongQuestion.lastWrongAt),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

    const questionIds = rows
      .map((r) => r.wrongQuestion.questionId)
      .filter((id): id is string => id != null);
    const knowledgePointsMap = await this.loadKnowledgePointsForQuestions(questionIds);
    const examFreqMap = await this.loadExamFrequencyMap(questionIds);

    // 掌握度（用于排序，不写入返回结构）
    const masteryScoreMap = new Map<string, number>();
    for (const row of rows) {
      if (row.wrongQuestion.questionId) {
        masteryScoreMap.set(row.wrongQuestion.questionId, row.masteryScore ?? 0);
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

    const allKpIds = new Set<string>();
    for (const kps of knowledgePointsMap.values()) {
      for (const kp of kps) allKpIds.add(kp.id);
    }
    const chapterPathsMap = await this.buildChapterPathsMap([...allKpIds]);

    const items = rows.map((row) => {
      const item = this.toWrongQuestionWithDetail(row);
      const kps = knowledgePointsMap.get(item.questionId) ?? [];
      item.knowledgePoints = kps;
      item.examFrequency = examFreqMap.get(item.questionId) ?? 0;
      if (kps.length > 0) {
        item.chapterPaths = chapterPathsMap.get(kps[0].id);
      }
      return item;
    });

    // 按优先级重排当前页
    items.sort((a, b) => {
      const scoreA = calculateQuestionPriorityScore({
        examFrequency: a.examFrequency ?? 0,
        masteryScore: masteryScoreMap.get(a.questionId) ?? 0,
        wrongCount: a.wrongCount,
        nextReviewAt: null,
        lastReviewedAt: null,
        difficulty: a.difficulty ?? 0,
        settings: qSettings,
      });
      const scoreB = calculateQuestionPriorityScore({
        examFrequency: b.examFrequency ?? 0,
        masteryScore: masteryScoreMap.get(b.questionId) ?? 0,
        wrongCount: b.wrongCount,
        nextReviewAt: null,
        lastReviewedAt: null,
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

  async getWeakKnowledgePoints(
    query: WeakKnowledgePointsQueryDto,
  ): Promise<PaginatedResponse<WeakMarkKnowledgePoint>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const conditions = [eq(knowledgePoint.isWeakMarked, true)];
    if (query.subjectId) {
      conditions.push(eq(knowledgePoint.subjectId, query.subjectId));
    }
    if (query.search && query.search.trim().length > 0) {
      conditions.push(ilike(knowledgePoint.title, `%${query.search.trim()}%`));
    }
    const where = and(...conditions);

    const totalResult = await this.db
      .select({ count: count() })
      .from(knowledgePoint)
      .where(where);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select({
        id: knowledgePoint.id,
        title: knowledgePoint.title,
        subjectId: knowledgePoint.subjectId,
        subjectName: subject.name,
        chapterId: knowledgePoint.chapterId,
        chapterName: chapter.title,
        masteryScore: knowledgePoint.masteryScore,
        status: knowledgePoint.status,
        weakMarkedAt: knowledgePoint.weakMarkedAt,
        weakMarkReason: knowledgePoint.weakMarkReason,
      })
      .from(knowledgePoint)
      .leftJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .leftJoin(chapter, eq(knowledgePoint.chapterId, chapter.id))
      .where(where)
      .orderBy(desc(knowledgePoint.weakMarkedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: WeakMarkKnowledgePoint[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      subjectId: row.subjectId,
      subjectName: row.subjectName ?? '',
      chapterId: row.chapterId,
      chapterName: row.chapterName ?? undefined,
      masteryScore: row.masteryScore,
      status: row.status as KnowledgePointStatus,
      weakMarkedAt: row.weakMarkedAt ? row.weakMarkedAt.toISOString() : null,
      weakMarkReason: (row.weakMarkReason as WeakMarkReason | null) ?? null,
    }));

    return { items, total, page, pageSize };
  }

  private async loadKnowledgePointsForQuestions(
    questionIds: string[],
  ): Promise<Map<string, { id: string; title: string }[]>> {
    const result = new Map<string, { id: string; title: string }[]>();
    if (questionIds.length === 0) return result;

    const rows = await this.db
      .select({
        questionId: questionKnowledgePointTable.questionId,
        id: knowledgePoint.id,
        title: knowledgePoint.title,
      })
      .from(questionKnowledgePointTable)
      .leftJoin(
        knowledgePoint,
        eq(questionKnowledgePointTable.knowledgePointId, knowledgePoint.id),
      )
      .where(inArray(questionKnowledgePointTable.questionId, questionIds))
      .orderBy(questionKnowledgePointTable.questionId);

    for (const r of rows) {
      if (!r.questionId || !r.id) continue;
      const existing = result.get(r.questionId) ?? [];
      existing.push({ id: r.id, title: r.title ?? '' });
      result.set(r.questionId, existing);
    }
    return result;
  }

  private async loadExamFrequencyMap(
    questionIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (questionIds.length === 0) return result;

    const rows = await this.db
      .select({
        questionId: questionKnowledgePointTable.questionId,
        maxFreq: sql<number>`MAX(${knowledgePoint.examFrequency})`,
      })
      .from(questionKnowledgePointTable)
      .innerJoin(
        knowledgePoint,
        eq(questionKnowledgePointTable.knowledgePointId, knowledgePoint.id),
      )
      .where(inArray(questionKnowledgePointTable.questionId, questionIds))
      .groupBy(questionKnowledgePointTable.questionId);

    for (const r of rows) {
      if (r.questionId) {
        result.set(r.questionId, Number(r.maxFreq) || 0);
      }
    }
    return result;
  }

  async update(
    id: string,
    dto: UpdateWrongQuestionDto,
  ): Promise<WrongQuestionWithDetail> {
    const patch: Partial<typeof wrongQuestion.$inferInsert> = {};
    if (dto.resolved !== undefined) patch.resolved = dto.resolved;
    if (dto.mistakeReason !== undefined) patch.mistakeReason = dto.mistakeReason;
    if (dto.userAnswer !== undefined) patch.userAnswer = dto.userAnswer;
    if (dto.errorTags !== undefined) {
      const validTags = dto.errorTags.filter((t) =>
        ERROR_TAG_VALUES.includes(t as ErrorTag),
      );
      patch.errorTags = validTags;
    }

    if (Object.keys(patch).length === 0) {
      return this.findOne(id);
    }

    const updated = await this.db
      .update(wrongQuestion)
      .set(patch)
      .where(eq(wrongQuestion.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('错题记录不存在');
    return this.findOne(id);
  }

  async getByQuestionId(
    questionId: string,
  ): Promise<WrongQuestionWithDetail | null> {
     const rows = await this.db
       .select({
         wrongQuestion,
         questionText: examQuestion.questionText,
         questionYear: examQuestion.year,
         questionType: examQuestion.questionType,
         questionSource: examQuestion.source,
         difficulty: examQuestion.difficulty,
         answerCount: examQuestion.answerCount,
         knowledgePointTitle: knowledgePoint.title,
         subjectName: subject.name,
       })
       .from(wrongQuestion)
       .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
       .leftJoin(
         knowledgePoint,
         eq(wrongQuestion.knowledgePointId, knowledgePoint.id),
       )
       .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
       .where(eq(wrongQuestion.questionId, questionId))
       .limit(1);
    if (rows.length === 0) return null;
    const item = this.toWrongQuestionWithDetail(rows[0]);
    const kpsMap = await this.loadKnowledgePointsForQuestions([questionId]);
    item.knowledgePoints = kpsMap.get(questionId) ?? [];
    const freqMap = await this.loadExamFrequencyMap([questionId]);
    item.examFrequency = freqMap.get(questionId) ?? 0;
    return item;
  }

  async addToWrongBook(
    questionId: string,
    mistakeReason?: string,
    userAnswer?: string,
  ): Promise<WrongQuestionWithDetail> {
    const qResult = await this.db
      .select({
        id: examQuestion.id,
        subjectId: examQuestion.subjectId,
      })
      .from(examQuestion)
      .where(eq(examQuestion.id, questionId))
      .limit(1);
    if (qResult.length === 0) {
      throw new BadRequestException('题目不存在');
    }

    const kpResult = await this.db
      .select({ id: knowledgePoint.id })
      .from(knowledgePoint)
      .leftJoin(
        questionKnowledgePointTable,
        eq(questionKnowledgePointTable.knowledgePointId, knowledgePoint.id),
      )
      .where(eq(questionKnowledgePointTable.questionId, questionId))
      .limit(1);
    const knowledgePointId = kpResult[0]?.id ?? null;

    const now = new Date();
    const nextRetryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const existing = await this.db
      .select()
      .from(wrongQuestion)
      .where(
        and(
          eq(wrongQuestion.questionId, questionId),
          knowledgePointId
            ? eq(wrongQuestion.knowledgePointId, knowledgePointId)
            : sql`${wrongQuestion.knowledgePointId} IS NULL`,
        ),
      );

    if (existing.length > 0) {
      const patch: Partial<typeof wrongQuestion.$inferInsert> = {
        wrongCount: existing[0].wrongCount + 1,
        lastWrongAt: now,
        resolved: false,
        nextRetryAt,
      };
      if (mistakeReason !== undefined) {
        patch.mistakeReason = mistakeReason;
      }
      if (userAnswer !== undefined) {
        patch.userAnswer = userAnswer;
      }
      await this.db
        .update(wrongQuestion)
        .set(patch)
        .where(eq(wrongQuestion.id, existing[0].id));
      return this.findOne(existing[0].id);
    }

    const inserted = await this.db
      .insert(wrongQuestion)
      .values({
        questionId,
        knowledgePointId,
        wrongCount: 1,
        firstWrongAt: now,
        lastWrongAt: now,
        resolved: false,
        nextRetryAt,
        mistakeReason: mistakeReason ?? null,
        userAnswer: userAnswer ?? null,
      })
      .returning();
    return this.findOne(inserted[0].id);
  }

  async redoResult(
    id: string,
    score: number,
    userAnswer?: string,
    mastered?: boolean,
  ): Promise<WrongQuestionWithDetail> {
    const existing = await this.db
      .select()
      .from(wrongQuestion)
      .where(eq(wrongQuestion.id, id));
    if (existing.length === 0) {
      throw new NotFoundException('错题记录不存在');
    }

    const now = new Date();
    const isMastered = mastered === true || score >= 60;

    if (isMastered) {
      await this.db
        .update(wrongQuestion)
        .set({
          resolved: true,
          userAnswer: userAnswer !== undefined ? userAnswer : existing[0].userAnswer,
        })
        .where(eq(wrongQuestion.id, id));
    } else {
      const nextRetryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await this.db
        .update(wrongQuestion)
        .set({
          wrongCount: existing[0].wrongCount + 1,
          lastWrongAt: now,
          resolved: false,
          nextRetryAt,
          userAnswer: userAnswer !== undefined ? userAnswer : existing[0].userAnswer,
        })
        .where(eq(wrongQuestion.id, id));
    }

    return this.findOne(id);
  }

   async remove(id: string, _userId: string): Promise<void> {
     const deleted = await this.db
       .delete(wrongQuestion)
       .where(eq(wrongQuestion.id, id))
       .returning({ id: wrongQuestion.id });
     if (deleted.length === 0) throw new NotFoundException('错题记录不存在');
   }

   async batchRemove(dto: BatchRemoveWrongQuestionsDto): Promise<number> {
     let deleted: { id: string }[];
     if (dto.ids && dto.ids.length > 0) {
       deleted = await this.db
         .delete(wrongQuestion)
         .where(inArray(wrongQuestion.id, dto.ids))
         .returning({ id: wrongQuestion.id });
     } else if (dto.onlyUnresolved) {
       deleted = await this.db
         .delete(wrongQuestion)
         .where(eq(wrongQuestion.resolved, false))
         .returning({ id: wrongQuestion.id });
     } else {
       deleted = await this.db
         .delete(wrongQuestion)
         .returning({ id: wrongQuestion.id });
     }
     return deleted.length;
   }

   async getStats(): Promise<WrongQuestionStats> {
     const overview = await this.getStatsOverview();
     const bySubject = await this.getStatsBySubject();
     const byReason = await this.getStatsByReason();
     const topWrong = await this.getTop({ limit: 10 });
     const byErrorTags = await this.getStatsByErrorTags();
     return { overview, bySubject, byReason, topWrong, byErrorTags };
   }

   private async getStatsOverview(): Promise<WrongQuestionStatsOverview> {
     const rows = await this.db
       .select({
         totalCount: count(),
         resolvedCount: sql<number>`
           sum(case when ${wrongQuestion.resolved} = true then 1 else 0 end)
         `,
       })
       .from(wrongQuestion);
     const row = rows[0];
     const totalCount = Number(row?.totalCount ?? 0);
     const resolvedCount = Number(row?.resolvedCount ?? 0);
     const unresolvedCount = totalCount - resolvedCount;
     return {
       totalCount,
       resolvedCount,
       unresolvedCount,
       masteryRate: totalCount > 0 ? resolvedCount / totalCount : 0,
     };
   }

   private async getStatsBySubject(): Promise<WrongSubjectDistributionItem[]> {
     const rows = await this.db
       .select({
         subjectId: subject.id,
         subjectName: subject.name,
         totalCount: count(),
         unresolvedCount: sql<number>`
           sum(case when ${wrongQuestion.resolved} = false then 1 else 0 end)
         `,
       })
       .from(wrongQuestion)
       .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
       .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
       .groupBy(subject.id, subject.name)
       .orderBy((t) => desc(t.unresolvedCount));
     return rows.map((r) => ({
       subjectId: r.subjectId ?? 'unknown',
       subjectName: r.subjectName ?? '未分类',
       totalCount: Number(r.totalCount ?? 0),
       unresolvedCount: Number(r.unresolvedCount ?? 0),
     }));
   }

    private async getStatsByErrorTags(): Promise<ErrorTagDistributionItem[]> {
      const rows = await this.db
        .select({
          count: count(),
          hasTags: sql<boolean>`
            coalesce(array_length(${wrongQuestion.errorTags}, 1), 0) > 0
          `,
        })
        .from(wrongQuestion)
        .where(eq(wrongQuestion.resolved, false))
        .groupBy(sql`coalesce(array_length(${wrongQuestion.errorTags}, 1), 0) > 0`);

      const unmarkedRow = rows.find((r) => r.hasTags === false);
      const markedRow = rows.find((r) => r.hasTags === true);
      const unmarkedCount = Number(unmarkedRow?.count ?? 0);

      const perTagRows = await this.db
        .select({
          tag: sql<string>`unnest(${wrongQuestion.errorTags})`,
          count: count(),
        })
        .from(wrongQuestion)
        .where(eq(wrongQuestion.resolved, false))
        .groupBy(sql`unnest(${wrongQuestion.errorTags})`);

      const tagCountMap = new Map<string, number>();
      for (const tag of ERROR_TAG_VALUES) {
        tagCountMap.set(tag, 0);
      }
      for (const row of perTagRows) {
        if (ERROR_TAG_VALUES.includes(row.tag as ErrorTag)) {
          tagCountMap.set(row.tag, Number(row.count ?? 0));
        }
      }

      const result: ErrorTagDistributionItem[] = [];
      for (const tag of ERROR_TAG_VALUES) {
        result.push({
          tag: tag as ErrorTag,
          count: tagCountMap.get(tag) ?? 0,
        });
      }
      result.push({ tag: 'unmarked', count: unmarkedCount });
      return result;
    }

    private async getStatsByReason(): Promise<WrongReasonDistributionItem[]> {
     const rows = await this.db
       .select({
         mistakeReason: wrongQuestion.mistakeReason,
         count: count(),
       })
       .from(wrongQuestion)
       .where(eq(wrongQuestion.resolved, false))
       .groupBy(wrongQuestion.mistakeReason)
       .orderBy((t) => desc(t.count));
     return rows.map((r) => ({
       mistakeReason: r.mistakeReason ?? null,
       count: Number(r.count ?? 0),
     }));
   }

   async getTop(query: WrongQuestionTopQueryDto): Promise<TopWrongItem[]> {
     const limit = query.limit ?? 10;
 
     const rows = await this.db
       .select({
         questionId: wrongQuestion.questionId,
         questionText: examQuestion.questionText,
         wrongCount: wrongQuestion.wrongCount,
         difficulty: examQuestion.difficulty,
         answerCount: examQuestion.answerCount,
         knowledgePointId: knowledgePoint.id,
         knowledgePointTitle: knowledgePoint.title,
         subjectName: subject.name,
       })
      .from(wrongQuestion)
      .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
      .leftJoin(
        knowledgePoint,
        eq(wrongQuestion.knowledgePointId, knowledgePoint.id),
      )
      .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
      .where(eq(wrongQuestion.resolved, false))
      .orderBy(desc(wrongQuestion.wrongCount))
      .limit(limit);

    const kpIds = rows
      .map((r) => r.knowledgePointId)
      .filter((id): id is string => id != null);
    const chapterPathsMap = await this.buildChapterPathsMap(kpIds);

     return rows.map((row, index): TopWrongItem => ({
       rank: index + 1,
       questionId: row.questionId,
       questionText: row.questionText ?? '未知题目',
       wrongCount: Number(row.wrongCount),
       difficulty: row.difficulty ?? 0,
       answerCount: row.answerCount ?? 0,
       knowledgePointId: row.knowledgePointId ?? null,
       knowledgePointTitle: row.knowledgePointTitle ?? null,
       subjectName: row.subjectName ?? '未知科目',
       chapterPaths: row.knowledgePointId
         ? chapterPathsMap.get(row.knowledgePointId)
         : undefined,
     }));
  }

   private async findOne(id: string): Promise<WrongQuestionWithDetail> {
    validateUuid(id, '错题ID');
     const rows = await this.db
       .select({
         wrongQuestion,
         questionText: examQuestion.questionText,
         questionYear: examQuestion.year,
         questionType: examQuestion.questionType,
         questionSource: examQuestion.source,
         difficulty: examQuestion.difficulty,
         answerCount: examQuestion.answerCount,
         knowledgePointTitle: knowledgePoint.title,
         subjectName: subject.name,
       })
      .from(wrongQuestion)
      .leftJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
      .leftJoin(
        knowledgePoint,
        eq(wrongQuestion.knowledgePointId, knowledgePoint.id),
      )
      .leftJoin(subject, eq(examQuestion.subjectId, subject.id))
      .where(eq(wrongQuestion.id, id));
    if (rows.length === 0) throw new NotFoundException('错题记录不存在');
    const item = this.toWrongQuestionWithDetail(rows[0]);
    const kpsMap = await this.loadKnowledgePointsForQuestions([item.questionId]);
    item.knowledgePoints = kpsMap.get(item.questionId) ?? [];
    const freqMap = await this.loadExamFrequencyMap([item.questionId]);
    item.examFrequency = freqMap.get(item.questionId) ?? 0;
    return item;
  }

   private toWrongQuestionWithDetail(row: {
     wrongQuestion: typeof wrongQuestion.$inferSelect;
     questionText: string | null;
     questionYear: number | null;
     questionType: string | null;
     questionSource: string | null;
     difficulty: number | null;
     masteryScore?: number | null;
     answerCount: number | null;
     knowledgePointTitle: string | null;
     subjectName: string | null;
   }): WrongQuestionWithDetail {
     const base = this.toWrongQuestion(row.wrongQuestion);
     return {
       ...base,
       questionText: row.questionText ?? '',
       questionYear: row.questionYear ?? 0,
       questionType: row.questionType ?? 'other',
       questionSource: row.questionSource,
       difficulty: row.difficulty ?? 0,
       answerCount: row.answerCount ?? 0,
       knowledgePointTitle: row.knowledgePointTitle,
       subjectName: row.subjectName,
       knowledgePoints: [],
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
    for (const r of kpRows) {
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

   private toWrongQuestion(
     row: typeof wrongQuestion.$inferSelect,
   ): WrongQuestion {
     return {
       id: row.id,
       questionId: row.questionId,
       knowledgePointId: row.knowledgePointId,
       firstWrongAt: row.firstWrongAt.toISOString(),
       lastWrongAt: row.lastWrongAt.toISOString(),
       wrongCount: row.wrongCount,
       resolved: row.resolved,
       nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
       userAnswer: row.userAnswer,
       mistakeReason: row.mistakeReason as WrongQuestion['mistakeReason'],
       errorTags: (row.errorTags ?? []) as ErrorTag[],
     };
   }
}
