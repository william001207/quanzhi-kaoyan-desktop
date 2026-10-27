import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { and, desc, eq, lt, lte, isNotNull, inArray, sql, count } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type {
  KnowledgePoint,
  ReviewRecord,
  ChapterPathNode,
  KnowledgePointChapterPaths,
} from '../../shared/api.interface';
import {
  knowledgePoint,
  reviewRecord,
  questionKnowledgePoint,
  wrongQuestion,
  chapter,
  knowledgePointTextbookChapter,
  examQuestion,
} from '../../database/schema';
import {
  calculateReviewResult,
  calculateQuestionResult,
  calcOverallMastery,
  calculateQuestionMastery,
  statusFromMastery,
  calculatePriorityScore,
} from '../../common/utils/review-algorithm';
import {
  SubmitReviewDto,
  SubmitQuestionReviewDto,
  ReviewQueueQueryDto,
} from './dto/review.dto';
import { userSetting } from '../../database/schema';

export interface ReviewResult {
  knowledgePoint: KnowledgePoint;
  reviewRecord: ReviewRecord;
}

export interface QuestionReviewResult {
  knowledgePoints: KnowledgePoint[];
  reviewRecords: ReviewRecord[];
}

@Injectable()
export class ReviewService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async submitKnowledgePointReview(
    id: string,
    dto: SubmitReviewDto,
  ): Promise<{ knowledgePoint: KnowledgePoint; reviewRecord: ReviewRecord }> {
    validateUuid(id, '知识点ID');
    const kpRows = await this.db
      .select()
      .from(knowledgePoint)
      .where(eq(knowledgePoint.id, id));
    if (kpRows.length === 0) throw new NotFoundException('知识点不存在');
    const oldKp = kpRows[0];

    const result = calculateReviewResult({
      currentMastery: oldKp.masteryScore,
      currentStage: oldKp.reviewStage,
      consecutiveCorrect: oldKp.consecutiveCorrect,
      consecutiveWrong: oldKp.consecutiveWrong,
      selfRating: dto.selfRating,
    });

    const now = new Date();

    const newRecallMastery = result.newMastery;
    const newOverallMastery = calcOverallMastery(
      newRecallMastery,
      oldKp.questionMastery ?? 0,
      oldKp.answeredQuestionCount ?? 0,
    );

    const kpPatch: Partial<typeof knowledgePoint.$inferInsert> = {
      masteryScore: newOverallMastery,
      recallMastery: newRecallMastery,
      status: result.status,
      lastReviewedAt: now,
      nextReviewAt: result.nextReviewAt,
      reviewStage: result.newStage,
      consecutiveCorrect: result.consecutiveCorrect,
      consecutiveWrong: result.consecutiveWrong,
      totalReviewCount: oldKp.totalReviewCount + 1,
      updatedAt: now,
    };

    const [updatedKpRow, insertedRecord] = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(knowledgePoint)
        .set(kpPatch)
        .where(eq(knowledgePoint.id, id))
        .returning();
      if (updated.length === 0) throw new NotFoundException('知识点不存在');

      const inserted = await tx
        .insert(reviewRecord)
        .values({
          knowledgePointId: id,
          selfRating: dto.selfRating,
          recallScore: dto.recallScore ?? null,
          questionScore: null,
          oldMasteryScore: oldKp.masteryScore,
          newMasteryScore: newOverallMastery,
          oldReviewStage: oldKp.reviewStage,
          newReviewStage: result.newStage,
          nextReviewAt: result.nextReviewAt,
          reviewType: 'review',
          reviewedAt: now,
        })
        .returning();

      return [updated[0], inserted[0]];
    });

    return {
      knowledgePoint: this.toKp(updatedKpRow),
      reviewRecord: this.toReviewRecord(insertedRecord),
    };
  }

  async submitQuestionReview(
    questionId: string,
    dto: SubmitQuestionReviewDto,
  ): Promise<ReviewResult> {
    validateUuid(questionId, '真题ID');
    const result = await this.submitQuestionResult(questionId, dto);
    if (result.knowledgePoints.length === 0 || result.reviewRecords.length === 0) {
      throw new NotFoundException('处理结果为空');
    }
    return {
      knowledgePoint: result.knowledgePoints[0],
      reviewRecord: result.reviewRecords[0],
    };
  }

  async submitQuestionResult(
    questionId: string,
    dto: SubmitQuestionReviewDto,
  ): Promise<QuestionReviewResult> {
    const qkpRows = await this.db
      .select()
      .from(questionKnowledgePoint)
      .where(eq(questionKnowledgePoint.questionId, questionId));
    if (qkpRows.length === 0) throw new NotFoundException('真题或关联知识点不存在');

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
        .where(eq(examQuestion.id, questionId));

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
        .where(inArray(questionKnowledgePoint.knowledgePointId, kpIds))
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
        const stats = qStatsMap.get(kp.id) ?? { avgMastery: 0, answeredCount: 0 };
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
            questionId,
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
          .from(wrongQuestion)
          .where(eq(wrongQuestion.questionId, questionId))
          .limit(1);
        if (existingWq.length > 0) {
          const patch: Partial<typeof wrongQuestion.$inferInsert> = {
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
            .update(wrongQuestion)
            .set(patch)
            .where(eq(wrongQuestion.id, existingWq[0].id));
        } else {
          await tx.insert(wrongQuestion).values({
            questionId,
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
      knowledgePoints: updatedKps.map((row) => this.toKp(row)),
      reviewRecords: insertedRecords.map((row) => this.toReviewRecord(row)),
    };
  }

  async getQueue(
    query: ReviewQueueQueryDto,
  ): Promise<KnowledgePoint[]> {
    const limit = query.limit ?? 20;
    const type = query.type ?? 'due';

    // 今日 0 点
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // 明日 0 点
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    let timeCondition;
    if (type === 'overdue') {
      // 已逾期：nextReviewAt < 今日 0 点
      timeCondition = and(
        isNotNull(knowledgePoint.nextReviewAt),
        lt(knowledgePoint.nextReviewAt, todayStart),
      );
    } else if (type === 'all') {
      // 全部未来：所有已安排复习的知识点
      timeCondition = isNotNull(knowledgePoint.nextReviewAt);
    } else {
      // due（今日到期）：nextReviewAt 在 [今日0点, 明日0点) 之间 + 已逾期
      timeCondition = and(
        isNotNull(knowledgePoint.nextReviewAt),
        lt(knowledgePoint.nextReviewAt, tomorrowStart),
      );
    }

    const rows = await this.db
      .select()
      .from(knowledgePoint)
      .where(timeCondition)
      .limit(limit);

    const settingRows = await this.db.select().from(userSetting).limit(1);
    const setting = settingRows[0];
    const kpSettings = {
      kpWeightSyllabus: setting?.kpWeightSyllabus ?? 30,
      kpWeightExamFreq: setting?.kpWeightExamFreq ?? 20,
      kpWeightMastery: setting?.kpWeightMastery ?? 20,
      kpWeightForgetting: setting?.kpWeightForgetting ?? 15,
      kpWeightWrong: setting?.kpWeightWrong ?? 10,
      kpWeightOverdue: setting?.kpWeightOverdue ?? 5,
    };

    const kpIds = rows.map((r) => r.id);
    const wrongRows = kpIds.length > 0
      ? await this.db
          .select({
            knowledgePointId: wrongQuestion.knowledgePointId,
            wrongCount: sql<number>`sum(${wrongQuestion.wrongCount})`,
          })
          .from(wrongQuestion)
          .where(inArray(wrongQuestion.knowledgePointId, kpIds))
          .groupBy(wrongQuestion.knowledgePointId)
      : [];
    const wrongMap = new Map<string, number>();
    for (const w of wrongRows) {
      if (!w.knowledgePointId) continue;
      wrongMap.set(w.knowledgePointId, Number(w.wrongCount) || 0);
    }

    const withScore = rows.map((row) => ({
      row,
      score: calculatePriorityScore({
        requirementLevel: row.requirementLevel as string,
        examFrequency: row.examFrequency ?? 0,
        masteryScore: row.masteryScore ?? 0,
        lastReviewedAt: row.lastReviewedAt ? new Date(row.lastReviewedAt) : null,
        reviewStage: row.reviewStage ?? 0,
        wrongCount: wrongMap.get(row.id) ?? 0,
        nextReviewAt: row.nextReviewAt ? new Date(row.nextReviewAt) : null,
        settings: kpSettings,
      }),
    }));

    withScore.sort((a, b) => b.score - a.score);
    const sortedRows = withScore.map((item) => item.row);

    const items = sortedRows.map((row) => this.toKp(row));

    if (items.length > 0) {
      const kpIds = items.map((kp) => kp.id);
      // 考纲章节
      const examChapterIds = [...new Set(items.map((kp) => kp.chapterId).filter(Boolean))];
      if (examChapterIds.length > 0) {
        const examChRows = await this.db
          .select({ id: chapter.id, title: chapter.title })
          .from(chapter)
          .where(inArray(chapter.id, examChapterIds));
        const examChMap = new Map(examChRows.map((r) => [r.id, r.title]));
        for (const item of items) {
          const title = examChMap.get(item.chapterId);
          if (title) {
            item.chapterPaths = {
              examSyllabus: [{ id: item.chapterId, title, level: 1 }],
              textbook: [],
            };
          }
        }
      }
      // 教材章节（主归属）
      const tbRows = await this.db
        .select({
          kpId: knowledgePointTextbookChapter.knowledgePointId,
          chapterId: knowledgePointTextbookChapter.chapterId,
          isPrimary: knowledgePointTextbookChapter.isPrimary,
        })
        .from(knowledgePointTextbookChapter)
        .where(inArray(knowledgePointTextbookChapter.knowledgePointId, kpIds));
      const tbKpMap = new Map<string, { chapterId: string; isPrimary: boolean }>();
      for (const r of tbRows) {
        if (!r.kpId || !r.chapterId) continue;
        const existing = tbKpMap.get(r.kpId);
        if (!existing || r.isPrimary) tbKpMap.set(r.kpId, { chapterId: r.chapterId, isPrimary: r.isPrimary });
      }
      const tbChapterIds = [...new Set([...tbKpMap.values()].map((v) => v.chapterId))];
      if (tbChapterIds.length > 0) {
        const tbChRows = await this.db
          .select({ id: chapter.id, title: chapter.title })
          .from(chapter)
          .where(inArray(chapter.id, tbChapterIds));
        const tbChMap = new Map(tbChRows.map((r) => [r.id, r.title]));
        for (const item of items) {
          const tbInfo = tbKpMap.get(item.id);
          if (!tbInfo) continue;
          const title = tbChMap.get(tbInfo.chapterId);
          if (!title) continue;
          if (!item.chapterPaths) {
            item.chapterPaths = { examSyllabus: [], textbook: [] };
          }
          item.chapterPaths.textbook = [
            { id: tbInfo.chapterId, title, level: 1 },
          ];
        }
      }
    }

    return items;
  }

  private scoreToSelfRating(score: number): 'again' | 'hard' | 'good' | 'easy' {
    if (score >= 80) return 'easy';
    if (score >= 60) return 'good';
    if (score >= 30) return 'hard';
    return 'again';
  }

  private toKp(row: typeof knowledgePoint.$inferSelect): KnowledgePoint {
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
        cardData: (row.cardData ?? {}) as KnowledgePoint['cardData'],
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
