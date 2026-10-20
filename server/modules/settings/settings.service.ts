import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { UserSetting, ClearDataResult, MockExamScoreConfig } from '../../shared/api.interface';
import {
  userSetting,
  knowledgePoint,
  examQuestion,
  reviewRecord,
  wrongQuestion,
  dailyPlanItem,
  dailyPlan,
} from '../../database/schema';
import { ClearLearningDataDto, UpdateUserSettingDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  private static readonly CACHE_KEYS = [
    'stats:overview:all',
    'stats:by-subject:all',
    'stats:mastery-distribution:all',
  ];

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async get(): Promise<UserSetting> {
    const rows = await this.db.select().from(userSetting).limit(1);
    if (rows.length === 0) {
      const inserted = await this.db
        .insert(userSetting)
        .values({})
        .returning();
      return this.toUserSetting(inserted[0]);
    }
    return this.toUserSetting(rows[0]);
  }

  async update(dto: UpdateUserSettingDto): Promise<UserSetting> {
    const existing = await this.db
      .select()
      .from(userSetting)
      .limit(1);
    let id: string;
    if (existing.length === 0) {
      const inserted = await this.db
        .insert(userSetting)
        .values({})
        .returning();
      id = inserted[0].id;
    } else {
      id = existing[0].id;
    }

    const patch: Partial<typeof userSetting.$inferInsert> = {};
    if (dto.examDate !== undefined) patch.examDate = dto.examDate ?? null;
    if (dto.dailyMinutes !== undefined) patch.dailyMinutes = dto.dailyMinutes;
    if (dto.examMode !== undefined) patch.examMode = dto.examMode;
    if (dto.kpWeightSyllabus !== undefined) patch.kpWeightSyllabus = dto.kpWeightSyllabus;
    if (dto.kpWeightExamFreq !== undefined) patch.kpWeightExamFreq = dto.kpWeightExamFreq;
    if (dto.kpWeightMastery !== undefined) patch.kpWeightMastery = dto.kpWeightMastery;
    if (dto.kpWeightForgetting !== undefined) patch.kpWeightForgetting = dto.kpWeightForgetting;
    if (dto.kpWeightWrong !== undefined) patch.kpWeightWrong = dto.kpWeightWrong;
    if (dto.kpWeightOverdue !== undefined) patch.kpWeightOverdue = dto.kpWeightOverdue;
    if (dto.qWeightExamFreq !== undefined) patch.qWeightExamFreq = dto.qWeightExamFreq;
    if (dto.qWeightMastery !== undefined) patch.qWeightMastery = dto.qWeightMastery;
    if (dto.qWeightWrong !== undefined) patch.qWeightWrong = dto.qWeightWrong;
    if (dto.qWeightOverdue !== undefined) patch.qWeightOverdue = dto.qWeightOverdue;
    if (dto.qWeightDifficulty !== undefined) patch.qWeightDifficulty = dto.qWeightDifficulty;
    if (dto.dailyKpConfig !== undefined) {
      patch.dailyKpConfig = dto.dailyKpConfig as any;
    }
    if (dto.dailyQuestionConfig !== undefined) {
      patch.dailyQuestionConfig = dto.dailyQuestionConfig as any;
    }
    if (dto.mockExamScoreConfig !== undefined) {
      patch.mockExamScoreConfig = dto.mockExamScoreConfig as any;
    }

    if (Object.keys(patch).length === 0) {
      return this.get();
    }

    const updated = await this.db
      .update(userSetting)
      .set(patch)
      .where(eq(userSetting.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('设置不存在');
    return this.toUserSetting(updated[0]);
  }

  private toUserSetting(row: typeof userSetting.$inferSelect): UserSetting {
    return {
      id: row.id,
      examDate: row.examDate ? (row.examDate as string) : null,
      dailyMinutes: row.dailyMinutes,
      dailyKpConfig: (row.dailyKpConfig as Record<string, number>) ?? {},
      dailyQuestionConfig: (row.dailyQuestionConfig as Record<string, number>) ?? {},
      mockExamScoreConfig: (row.mockExamScoreConfig as MockExamScoreConfig) ?? {},
      examMode: row.examMode,
      kpWeightSyllabus: row.kpWeightSyllabus,
      kpWeightExamFreq: row.kpWeightExamFreq,
      kpWeightMastery: row.kpWeightMastery,
      kpWeightForgetting: row.kpWeightForgetting,
      kpWeightWrong: row.kpWeightWrong,
      kpWeightOverdue: row.kpWeightOverdue,
      qWeightExamFreq: row.qWeightExamFreq,
      qWeightMastery: row.qWeightMastery,
      qWeightWrong: row.qWeightWrong,
      qWeightOverdue: row.qWeightOverdue,
      qWeightDifficulty: row.qWeightDifficulty,
    };
  }

  async clearLearningData(dto: ClearLearningDataDto): Promise<ClearDataResult> {
    const { type, range } = dto;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 86399999);

    const isToday = range === 'today';
    const clearRecall = type === 'recall' || type === 'all';
    const clearQuestion = type === 'question' || type === 'all';
    const clearAll = type === 'all' && range === 'all';

    const result = await this.db.transaction(async (tx) => {
      let reviewRecordsDeleted = 0;
      let wrongQuestionsDeleted = 0;
      let knowledgePointsReset = 0;
      let questionsReset = 0;
      let dailyPlanItemsReset = 0;

      if (clearRecall) {
        const where = isToday
          ? and(
              eq(reviewRecord.reviewType, 'review'),
              gte(reviewRecord.reviewedAt, todayStart),
              lte(reviewRecord.reviewedAt, todayEnd),
            )
          : eq(reviewRecord.reviewType, 'review');

        const affectedKpRows = await tx
          .select({ id: reviewRecord.knowledgePointId })
          .from(reviewRecord)
          .where(where)
          .groupBy(reviewRecord.knowledgePointId);
        const affectedKpIds = affectedKpRows
          .map((r) => r.id)
          .filter((id): id is string => id !== null);

        const del = await tx.delete(reviewRecord).where(where).returning({ id: reviewRecord.id });
        reviewRecordsDeleted = del.length;

        if (clearAll || (!isToday && type === 'recall')) {
          const kpUpdate = await tx.execute(sql`
            UPDATE knowledge_point SET
              recall_mastery = 0,
              total_review_count = 0,
              review_stage = 0,
              consecutive_correct = 0,
              consecutive_wrong = 0,
              next_review_at = NULL,
              last_reviewed_at = NULL,
              first_learned_at = NULL,
              mastery_score = question_mastery,
              status = CASE
                WHEN answered_question_count = 0 AND question_mastery = 0
                THEN 'not_started'::varchar
                WHEN question_mastery >= 90 THEN 'mastered'::varchar
                WHEN question_mastery >= 70 THEN 'familiar'::varchar
                WHEN question_mastery >= 40 THEN 'medium'::varchar
                ELSE 'weak'::varchar
              END,
              _updated_at = CURRENT_TIMESTAMP
          `);
          knowledgePointsReset = Number((kpUpdate as unknown as { rowCount: number }).rowCount ?? 0);
        } else if (affectedKpIds.length > 0) {
          const idsList = sql.join(affectedKpIds.map((id) => sql`(${id}::uuid)`), sql`, `);
          const kpUpdate = await tx.execute(sql`
            UPDATE knowledge_point kp SET
              recall_mastery = 0,
              total_review_count = COALESCE(r.cnt, 0),
              review_stage = 0,
              consecutive_correct = 0,
              consecutive_wrong = 0,
              next_review_at = r.next_at,
              last_reviewed_at = r.last_at,
              mastery_score = kp.question_mastery,
              status = CASE
                WHEN COALESCE(r.cnt, 0) = 0 AND kp.answered_question_count = 0 AND kp.question_mastery = 0
                THEN 'not_started'::varchar
                WHEN kp.question_mastery >= 90 THEN 'mastered'::varchar
                WHEN kp.question_mastery >= 70 THEN 'familiar'::varchar
                WHEN kp.question_mastery >= 40 THEN 'medium'::varchar
                ELSE 'weak'::varchar
              END,
              _updated_at = CURRENT_TIMESTAMP
            FROM (VALUES ${idsList}) AS v(id)
            LEFT JOIN LATERAL (
              SELECT
                count(*) AS cnt,
                MAX(r2.next_review_at) AS next_at,
                MAX(r2.reviewed_at) AS last_at
              FROM review_record r2
              WHERE r2.knowledge_point_id = v.id
                AND r2.review_type = 'review'
            ) r ON true
            WHERE kp.id = v.id
          `);
          knowledgePointsReset = Number((kpUpdate as unknown as { rowCount: number }).rowCount ?? 0);
        }
      }

      if (clearQuestion) {
        const qWhere = isToday
          ? and(
              eq(reviewRecord.reviewType, 'question'),
              gte(reviewRecord.reviewedAt, todayStart),
              lte(reviewRecord.reviewedAt, todayEnd),
            )
          : eq(reviewRecord.reviewType, 'question');

        const affectedQRows = await tx
          .select({ id: reviewRecord.questionId })
          .from(reviewRecord)
          .where(and(qWhere, sql`${reviewRecord.questionId} IS NOT NULL`))
          .groupBy(reviewRecord.questionId);
        const affectedQIds = affectedQRows
          .map((r) => r.id)
          .filter((id): id is string => id !== null);

        const affectedKpRows = await tx
          .select({ id: reviewRecord.knowledgePointId })
          .from(reviewRecord)
          .where(and(qWhere, sql`${reviewRecord.knowledgePointId} IS NOT NULL`))
          .groupBy(reviewRecord.knowledgePointId);
        const affectedKpIds = affectedKpRows
          .map((r) => r.id)
          .filter((id): id is string => id !== null);

        const del = await tx.delete(reviewRecord).where(qWhere).returning({ id: reviewRecord.id });
        reviewRecordsDeleted += del.length;

        if (clearAll || (!isToday && type === 'question')) {
          const qUpdate = await tx.execute(sql`
            UPDATE exam_question SET
              answered = false,
              answer_count = 0,
              mastery_score = 0,
              last_answered_at = NULL,
              _updated_at = CURRENT_TIMESTAMP
          `);
          questionsReset = Number((qUpdate as unknown as { rowCount: number }).rowCount ?? 0);

          const wqDel = await tx.delete(wrongQuestion).returning({ id: wrongQuestion.id });
          wrongQuestionsDeleted = wqDel.length;
        } else {
          if (isToday) {
            const wqDel = await tx
              .delete(wrongQuestion)
              .where(
                and(
                  gte(wrongQuestion.createdAt, todayStart),
                  lte(wrongQuestion.createdAt, todayEnd),
                ),
              )
              .returning({ id: wrongQuestion.id });
            wrongQuestionsDeleted = wqDel.length;
          }

          if (affectedQIds.length > 0) {
            const qIdsList = sql.join(affectedQIds.map((id) => sql`(${id}::uuid)`), sql`, `);
            const qUpdate = await tx.execute(sql`
              UPDATE exam_question eq SET
                answered = COALESCE(r.cnt, 0) > 0,
                answer_count = COALESCE(r.cnt, 0),
                mastery_score = COALESCE(r.latest_score, 0),
                last_answered_at = r.last_at,
                _updated_at = CURRENT_TIMESTAMP
              FROM (VALUES ${qIdsList}) AS v(id)
              LEFT JOIN LATERAL (
                SELECT
                  count(*) AS cnt,
                  MAX(r2.reviewed_at) AS last_at,
                  (
                    SELECT r3.question_score
                    FROM review_record r3
                    WHERE r3.question_id = v.id
                      AND r3.review_type = 'question'
                    ORDER BY r3.reviewed_at DESC
                    LIMIT 1
                  ) AS latest_score
                FROM review_record r2
                WHERE r2.question_id = v.id
                  AND r2.review_type = 'question'
              ) r ON true
              WHERE eq.id = v.id
            `);
            questionsReset = Number((qUpdate as unknown as { rowCount: number }).rowCount ?? 0);
          }
        }

        if (clearAll || (!isToday && type === 'question')) {
          const kpUpdate = await tx.execute(sql`
            UPDATE knowledge_point SET
              question_mastery = 0,
              answered_question_count = 0,
              total_question_count = 0,
              correct_question_count = 0,
              mastery_score = recall_mastery,
              status = CASE
                WHEN total_review_count = 0 AND recall_mastery = 0
                THEN 'not_started'::varchar
                WHEN recall_mastery >= 90 THEN 'mastered'::varchar
                WHEN recall_mastery >= 70 THEN 'familiar'::varchar
                WHEN recall_mastery >= 40 THEN 'medium'::varchar
                ELSE 'weak'::varchar
              END,
              _updated_at = CURRENT_TIMESTAMP
          `);
          knowledgePointsReset += Number((kpUpdate as unknown as { rowCount: number }).rowCount ?? 0);
        } else if (affectedKpIds.length > 0) {
          const kpIdsList = sql.join(affectedKpIds.map((id) => sql`(${id}::uuid)`), sql`, `);
          const kpUpdate = await tx.execute(sql`
            UPDATE knowledge_point kp SET
              question_mastery = COALESCE(r.avg_score, 0),
              answered_question_count = COALESCE(r.qcnt, 0),
              total_question_count = COALESCE(r.total_q, 0),
              correct_question_count = COALESCE(r.correct_q, 0),
              mastery_score = kp.recall_mastery,
              status = CASE
                WHEN kp.total_review_count = 0 AND COALESCE(r.qcnt, 0) = 0 AND kp.recall_mastery = 0
                THEN 'not_started'::varchar
                WHEN kp.recall_mastery >= 90 THEN 'mastered'::varchar
                WHEN kp.recall_mastery >= 70 THEN 'familiar'::varchar
                WHEN kp.recall_mastery >= 40 THEN 'medium'::varchar
                ELSE 'weak'::varchar
              END,
              _updated_at = CURRENT_TIMESTAMP
            FROM (VALUES ${kpIdsList}) AS v(id)
            LEFT JOIN LATERAL (
              SELECT
                count(DISTINCT r2.question_id) AS qcnt,
                count(*) AS total_q,
                sum(case when r2.question_score > 0 then 1 else 0 end) AS correct_q,
                avg(r2.question_score) AS avg_score
              FROM review_record r2
              WHERE r2.knowledge_point_id = v.id
                AND r2.review_type = 'question'
            ) r ON true
            WHERE kp.id = v.id
          `);
          knowledgePointsReset += Number((kpUpdate as unknown as { rowCount: number }).rowCount ?? 0);
        }
      }

      if (clearAll) {
        const dpiResult = await tx
          .update(dailyPlanItem)
          .set({ completed: false, completedAt: null })
          .where(eq(dailyPlanItem.completed, true))
          .returning({ id: dailyPlanItem.id });
        dailyPlanItemsReset = dpiResult.length;

        await tx.update(dailyPlan).set({ completedMinutes: 0, completedItems: 0 });
      }

      return {
        reviewRecordsDeleted,
        wrongQuestionsDeleted,
        knowledgePointsReset,
        questionsReset,
        dailyPlanItemsReset,
      };
    });

    await this.invalidateCache();
    return result;
  }

  private async invalidateCache(): Promise<void> {
    for (const key of SettingsService.CACHE_KEYS) {
      await this.cache.del(key);
    }
  }
}
