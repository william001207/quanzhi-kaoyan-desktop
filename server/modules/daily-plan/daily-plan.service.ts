import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { eq, desc, inArray, and, sql, isNotNull, count, ilike, or, notInArray } from 'drizzle-orm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type { DailyPlan, DailyPlanItem, KnowledgePoint, KnowledgePointCardData, ExamQuestion, ExamQuestionBrief, WrongQuestion, UserSetting, KnowledgePointChapterPaths, ChapterPathNode, ErrorTag, PaginatedResponse, QuestionType } from '../../shared/api.interface';
import {
  dailyPlan,
  dailyPlanItem,
  knowledgePoint,
  examQuestion,
  questionKnowledgePoint,
  wrongQuestion as wrongQuestionTable,
  userSetting,
  subject,
  chapter,
  syllabusItem,
  reviewRecord,
  knowledgePointTextbookChapter,
} from '../../database/schema';
import { generateDailyPlanItems, type PlanItem } from '../../common/utils/daily-plan-generator';
import { CandidatesQueryDto, UpdateDailyPlanItemDto } from './dto/daily-plan.dto';

export interface DailyPlanWithItems extends DailyPlan {
  items: DailyPlanItem[];
}

const DAILY_PLAN_CACHE_PREFIX = 'dailyplan:today';
const dailyPlanCacheKey = (date: string) => `${DAILY_PLAN_CACHE_PREFIX}:${date}`;

@Injectable()
export class DailyPlanService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getToday(): Promise<DailyPlanWithItems> {
    const today = this.todayStr();
    const cacheKey = dailyPlanCacheKey(today);
    const cached = await this.cacheManager.get<DailyPlanWithItems>(cacheKey);
    if (cached) return cached;

    const rows = await this.db
      .select()
      .from(dailyPlan)
      .where(eq(dailyPlan.planDate, today))
      .limit(1);

    let planRow: typeof dailyPlan.$inferSelect;
    let result: DailyPlanWithItems;
    if (rows.length === 0) {
      result = await this.generate();
    } else {
      planRow = rows[0];
      const items = await this.loadItems(planRow.id);
      result = {
        ...this.toDailyPlan(planRow),
        items,
      };
    }

    await this.cacheManager.set(cacheKey, result, 60 * 60 * 1000);
    return result;
  }

  async generate(): Promise<DailyPlanWithItems> {
    const today = this.todayStr();
    const now = new Date();

    // 1. 查出所有知识点（只取计划生成需要的字段）、真题（精简字段）、错题
    const allKps = await this.db
      .select({
        id: knowledgePoint.id,
        subjectId: knowledgePoint.subjectId,
        chapterId: knowledgePoint.chapterId,
        title: knowledgePoint.title,
        requirementLevel: knowledgePoint.requirementLevel,
        importanceScore: knowledgePoint.importanceScore,
        examFrequency: knowledgePoint.examFrequency,
        masteryScore: knowledgePoint.masteryScore,
        status: knowledgePoint.status,
        lastReviewedAt: knowledgePoint.lastReviewedAt,
        nextReviewAt: knowledgePoint.nextReviewAt,
        reviewStage: knowledgePoint.reviewStage,
        consecutiveCorrect: knowledgePoint.consecutiveCorrect,
        consecutiveWrong: knowledgePoint.consecutiveWrong,
        totalReviewCount: knowledgePoint.totalReviewCount,
         totalQuestionCount: knowledgePoint.totalQuestionCount,
         correctQuestionCount: knowledgePoint.correctQuestionCount,
         isWeakMarked: knowledgePoint.isWeakMarked,
       })
      .from(knowledgePoint);
    const allQuestions = await this.db
      .select({
        id: examQuestion.id,
        year: examQuestion.year,
        subjectId: examQuestion.subjectId,
        questionType: examQuestion.questionType,
        questionText: examQuestion.questionText,
        source: examQuestion.source,
        difficulty: examQuestion.difficulty,
      })
      .from(examQuestion);
    const allWrong = await this.db
      .select()
      .from(wrongQuestionTable)
      .where(eq(wrongQuestionTable.resolved, false));

    // 2. 查用户设置（不存在则创建默认）
    let settingRow = await this.getUserSetting();

    // 3. 构建 questionId -> kpId[] Map
    const qkpRows = await this.db.select().from(questionKnowledgePoint);
    const questionKpMap = new Map<string, string[]>();
    for (const row of qkpRows) {
      const existing = questionKpMap.get(row.questionId) ?? [];
      existing.push(row.knowledgePointId);
      questionKpMap.set(row.questionId, existing);
    }

    // 4. 构建 kpId -> wrongCount Map
    const kpWrongCountMap = new Map<string, number>();
    for (const w of allWrong) {
      if (!w.knowledgePointId) continue;
      const cur = kpWrongCountMap.get(w.knowledgePointId) ?? 0;
      kpWrongCountMap.set(w.knowledgePointId, cur + w.wrongCount);
    }

    // 4b. 构建 questionId -> 最近作答时间 Map
    const questionLastReviewedMap = new Map<string, string | null>();
    const qReviewRows = await this.db
      .select({
        questionId: reviewRecord.questionId,
        lastReviewedAt: sql<Date>`max(${reviewRecord.reviewedAt})`,
      })
      .from(reviewRecord)
      .where(isNotNull(reviewRecord.questionId))
      .groupBy(reviewRecord.questionId);
    for (const row of qReviewRows) {
      if (!row.questionId) continue;
      questionLastReviewedMap.set(
        row.questionId,
        row.lastReviewedAt instanceof Date
          ? row.lastReviewedAt.toISOString()
          : row.lastReviewedAt
            ? new Date(row.lastReviewedAt as any).toISOString()
            : null
      );
    }

    // 5. 获取今天已有 plan，保留已完成 items
    let planRow: typeof dailyPlan.$inferSelect;
    const existingCompletedKpIds = new Set<string>();
    const existingCompletedQIds = new Set<string>();

    const existingPlans = await this.db
      .select()
      .from(dailyPlan)
      .where(eq(dailyPlan.planDate, today))
      .limit(1);

    if (existingPlans.length > 0) {
      planRow = existingPlans[0];
      // 找出已完成的 items
      const existingItems = await this.db
        .select()
        .from(dailyPlanItem)
        .where(
          and(
            eq(dailyPlanItem.dailyPlanId, planRow.id),
            eq(dailyPlanItem.completed, true),
          ),
        );
      for (const item of existingItems) {
        if (item.knowledgePointId) existingCompletedKpIds.add(item.knowledgePointId);
        if (item.questionId) existingCompletedQIds.add(item.questionId);
      }
      // 把今天已生成过的未完成 items 也加入排除集，让重新生成时换一批
      const existingUnfinishedItems = await this.db
        .select()
        .from(dailyPlanItem)
        .where(
          and(
            eq(dailyPlanItem.dailyPlanId, planRow.id),
            eq(dailyPlanItem.completed, false),
          ),
        );
      for (const item of existingUnfinishedItems) {
        if (item.knowledgePointId) existingCompletedKpIds.add(item.knowledgePointId);
        if (item.questionId) existingCompletedQIds.add(item.questionId);
      }
    } else {
      const inserted = await this.db
        .insert(dailyPlan)
        .values({ planDate: today, status: 'active' })
        .returning();
      planRow = inserted[0];
    }

    // 5b. 最近7天出过的知识点/题目（冷却排除）
    const recentSeenKpIds = new Set<string>();
    const recentSeenQIds = new Set<string>();
    {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
      const recentRows = await this.db
        .select({
          knowledgePointId: dailyPlanItem.knowledgePointId,
          questionId: dailyPlanItem.questionId,
        })
        .from(dailyPlanItem)
        .innerJoin(dailyPlan, eq(dailyPlanItem.dailyPlanId, dailyPlan.id))
        .where(
          and(
            sql`${dailyPlan.planDate} >= ${sevenDaysAgoStr}::date`,
            sql`${dailyPlan.planDate} < ${today}::date`,
          )
        );
      for (const r of recentRows) {
        if (r.knowledgePointId) recentSeenKpIds.add(r.knowledgePointId);
        if (r.questionId) recentSeenQIds.add(r.questionId);
      }
    }

    const settingsDto = this.toUserSetting(settingRow);
    const kpsDto = allKps.map((k) => this.kpRowToLightDto(k));
    const questionsDto = allQuestions.map((q) => this.questionRowToLightDto(q));
    const wrongDto = allWrong.map((w) => this.wrongRowToDto(w));

    // 6. 调用 generateDailyPlanItems 生成新 items
    const planItems: (PlanItem & { sortOrder: number })[] = generateDailyPlanItems({
      knowledgePoints: kpsDto,
      questions: questionsDto,
      wrongQuestions: wrongDto,
      questionKpMap,
      kpWrongCountMap,
      settings: settingsDto,
      existingCompletedItemKpIds: existingCompletedKpIds,
      existingCompletedItemQIds: existingCompletedQIds,
      recentSeenKpIds,
      recentSeenQIds,
      questionLastReviewedMap,
    }) as (PlanItem & { sortOrder: number })[];

    // 7 & 8 & 9: 事务中删除未完成旧 items、插入新 items、更新 plan 汇总
    let finalPlanRow = planRow;
    await this.db.transaction(async (tx) => {
      // 删除未完成的旧 items
      await tx
        .delete(dailyPlanItem)
        .where(
          and(
            eq(dailyPlanItem.dailyPlanId, planRow.id),
            eq(dailyPlanItem.completed, false),
          ),
        );

      // 插入新生成的 items
      if (planItems.length > 0) {
        await tx.insert(dailyPlanItem).values(
          planItems.map((item, index) => ({
            dailyPlanId: planRow.id,
            itemType: item.itemType,
            knowledgePointId: item.knowledgePointId,
            questionId: item.questionId,
            priorityScore: item.priorityScore,
            estimatedMinutes: item.estimatedMinutes,
            sortOrder: item.sortOrder ?? index,
            reason: item.reason,
            completed: false,
          })),
        );
      }

      // 重新统计 plan 汇总数据
      const allItemsNow = await tx
        .select()
        .from(dailyPlanItem)
        .where(eq(dailyPlanItem.dailyPlanId, planRow.id));

      const totalItems = allItemsNow.length;
      const totalEstimatedMinutes = allItemsNow.reduce(
        (sum: number, it) => sum + it.estimatedMinutes,
        0,
      );
      const completedItems = allItemsNow.filter((it) => it.completed).length;
      const completedMinutes = allItemsNow
        .filter((it) => it.completed)
        .reduce((sum: number, it) => sum + it.estimatedMinutes, 0);

      const updated = await tx
        .update(dailyPlan)
        .set({
          totalEstimatedMinutes,
          totalItems,
          completedItems,
          completedMinutes,
          generatedAt: now,
          updatedAt: now,
        })
        .where(eq(dailyPlan.id, planRow.id))
        .returning();
      if (updated.length > 0) finalPlanRow = updated[0];
    });

    const items = await this.loadItems(finalPlanRow.id);
    const result = {
      ...this.toDailyPlan(finalPlanRow),
      items,
    };
    await this.cacheManager.set(dailyPlanCacheKey(today), result, 60 * 60 * 1000);
    return result;
  }

  async getItem(id: string): Promise<DailyPlanItem> {
    validateUuid(id, '计划条目ID');
    const rows = await this.db
      .select()
      .from(dailyPlanItem)
      .where(eq(dailyPlanItem.id, id));
    if (rows.length === 0) throw new NotFoundException('计划条目不存在');
    return this.toItem(rows[0]);
  }

  async getCandidates(
    query: CandidatesQueryDto,
  ): Promise<
    PaginatedResponse<KnowledgePoint | ExamQuestionBrief>
  > {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const today = this.todayStr();

    const todayPlanRow = await this.db
      .select({ id: dailyPlan.id })
      .from(dailyPlan)
      .where(eq(dailyPlan.planDate, today))
      .limit(1);
    const planId = todayPlanRow[0]?.id;

    if (query.itemType === 'question') {
      return this.getQuestionCandidates(
        query,
        planId ?? null,
        page,
        pageSize,
      ) as Promise<PaginatedResponse<ExamQuestionBrief>>;
    }

    return this.getKnowledgePointCandidates(
      query,
      planId ?? null,
      page,
      pageSize,
    ) as Promise<PaginatedResponse<KnowledgePoint>>;
  }

  private async getKnowledgePointCandidates(
    query: CandidatesQueryDto,
    planId: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<KnowledgePoint>> {
    const conditions = [];
    if (query.keyword)
      conditions.push(ilike(knowledgePoint.title, `%${query.keyword}%`));
    if (query.subjectId)
      conditions.push(eq(knowledgePoint.subjectId, query.subjectId));

    if (planId) {
      const existingIdsResult = await this.db
        .select({ kpId: dailyPlanItem.knowledgePointId })
        .from(dailyPlanItem)
        .where(
          and(
            eq(dailyPlanItem.dailyPlanId, planId),
            isNotNull(dailyPlanItem.knowledgePointId),
          ),
        );
      const existingIds = existingIdsResult
        .map((r) => r.kpId)
        .filter((id): id is string => id !== null && id !== undefined);
      if (existingIds.length > 0) {
        conditions.push(notInArray(knowledgePoint.id, existingIds));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await this.db
      .select({ count: count() })
      .from(knowledgePoint)
      .where(where);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select({
        id: knowledgePoint.id,
        subjectId: knowledgePoint.subjectId,
        chapterId: knowledgePoint.chapterId,
        title: knowledgePoint.title,
        requirementLevel: knowledgePoint.requirementLevel,
        importanceScore: knowledgePoint.importanceScore,
        examFrequency: knowledgePoint.examFrequency,
        masteryScore: knowledgePoint.masteryScore,
        status: knowledgePoint.status,
        subjectName: subject.name,
      })
      .from(knowledgePoint)
      .innerJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .where(where)
      .orderBy(
        desc(knowledgePoint.examFrequency),
        desc(knowledgePoint.importanceScore),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: KnowledgePoint[] = rows.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      chapterId: row.chapterId ?? null,
      syllabusItemId: null,
      title: row.title,
      requirementLevel: row.requirementLevel as KnowledgePoint['requirementLevel'],
      importanceScore: row.importanceScore ?? 0,
      examFrequency: row.examFrequency ?? 0,
      masteryScore: row.masteryScore ?? 0,
      recallMastery: 0,
      questionMastery: 0,
      answeredQuestionCount: 0,
      status: row.status as KnowledgePoint['status'],
      firstLearnedAt: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewStage: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      totalReviewCount: 0,
      totalQuestionCount: 0,
      correctQuestionCount: 0,
      manuallyPinned: false,
      isWeakMarked: false,
      weakMarkedAt: null,
      weakMarkReason: null,
      cardData: { flowSteps: [] },
      subjectName: row.subjectName,
      chapterPaths: undefined,
    }));

    return { items, total, page, pageSize };
  }

  private async getQuestionCandidates(
    query: CandidatesQueryDto,
    planId: string | null,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<ExamQuestionBrief>> {
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

    if (planId) {
      const existingIdsResult = await this.db
        .select({ qId: dailyPlanItem.questionId })
        .from(dailyPlanItem)
        .where(
          and(
            eq(dailyPlanItem.dailyPlanId, planId),
            isNotNull(dailyPlanItem.questionId),
          ),
        );
      const existingIds = existingIdsResult
        .map((r) => r.qId)
        .filter((id): id is string => id !== null && id !== undefined);
      if (existingIds.length > 0) {
        conditions.push(notInArray(examQuestion.id, existingIds));
      }
    }

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
        subjectName: subject.name,
      })
      .from(examQuestion)
      .innerJoin(subject, eq(examQuestion.subjectId, subject.id))
      .where(where)
      .orderBy(
        desc(examQuestion.year),
        desc(examQuestion.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: ExamQuestionBrief[] = rows.map((row) => ({
      id: row.id,
      year: row.year,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      questionType: row.questionType as QuestionType,
      questionText: row.questionText,
      source: row.source,
      difficulty: row.difficulty ?? 0,
      masteryScore: row.masteryScore ?? 0,
      answered: row.answered ?? false,
      answerCount: row.answerCount ?? 0,
      knowledgePointCount: 0,
      examFrequency: 0,
    }));

    return { items, total, page, pageSize };
  }

  async addManualItems(
    knowledgePointIds: string[],
    questionIds: string[] = [],
  ): Promise<DailyPlanWithItems> {
    // 确保今日计划存在
    const todayPlan = await this.getToday();
    const planId = todayPlan.id;
    const now = new Date();

    // 查询今日已有 items
    const existingItems = await this.db
      .select()
      .from(dailyPlanItem)
      .where(eq(dailyPlanItem.dailyPlanId, planId));

    const existingKpIds = new Set<string>();
    const existingQuestionIds = new Set<string>();
    let maxSortOrder = -1;
    for (const item of existingItems) {
      if (!item.completed && item.knowledgePointId) {
        existingKpIds.add(item.knowledgePointId);
      }
      if (!item.completed && item.questionId) {
        existingQuestionIds.add(item.questionId);
      }
      if (item.sortOrder > maxSortOrder) {
        maxSortOrder = item.sortOrder;
      }
    }

    const newKpIds = knowledgePointIds.filter(
      (kpId: string) => !existingKpIds.has(kpId),
    );
    const newQuestionIds = questionIds.filter(
      (qId: string) => !existingQuestionIds.has(qId),
    );
    if (newKpIds.length === 0 && newQuestionIds.length === 0) return todayPlan;

    let kpRows: Array<{ id: string }> = [];
    if (newKpIds.length > 0) {
      kpRows = await this.db
        .select({ id: knowledgePoint.id })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, newKpIds));
    }

    let qRows: Array<{ id: string }> = [];
    if (newQuestionIds.length > 0) {
      qRows = await this.db
        .select({ id: examQuestion.id })
        .from(examQuestion)
        .where(inArray(examQuestion.id, newQuestionIds));
    }

    if (kpRows.length === 0 && qRows.length === 0) return todayPlan;

    await this.db.transaction(async (tx) => {
      let sortOrder = maxSortOrder + 1;
      const insertValues: Array<typeof dailyPlanItem.$inferInsert> = [];
      for (const kp of kpRows) {
        insertValues.push({
          dailyPlanId: planId,
          itemType: 'manual',
          knowledgePointId: kp.id,
          questionId: null,
          priorityScore: 80,
          estimatedMinutes: 15,
          completed: false,
          sortOrder,
          reason: '手动添加',
        });
        sortOrder += 1;
      }
      for (const q of qRows) {
        insertValues.push({
          dailyPlanId: planId,
          itemType: 'manual_question',
          knowledgePointId: null,
          questionId: q.id,
          priorityScore: 80,
          estimatedMinutes: 10,
          completed: false,
          sortOrder,
          reason: '手动添加真题',
        });
        sortOrder += 1;
      }

      await tx.insert(dailyPlanItem).values(insertValues);

      const addedCount = insertValues.length;
      const addedMinutes = kpRows.length * 15 + qRows.length * 10;

      await tx
        .update(dailyPlan)
        .set({
          totalItems: todayPlan.totalItems + addedCount,
          totalEstimatedMinutes: todayPlan.totalEstimatedMinutes + addedMinutes,
          updatedAt: now,
        })
        .where(eq(dailyPlan.id, planId));
    });

    await this.cacheManager.del(dailyPlanCacheKey(this.todayStr()));
    return this.getToday();
  }

  async updateItem(
    id: string,
    dto: UpdateDailyPlanItemDto,
  ): Promise<DailyPlanItem> {
    const rows = await this.db
      .select()
      .from(dailyPlanItem)
      .where(eq(dailyPlanItem.id, id));
    if (rows.length === 0) throw new NotFoundException('计划条目不存在');
    const existing = rows[0];

    if (dto.completed === undefined) {
      return this.toItem(existing);
    }

    let updatedItem: typeof dailyPlanItem.$inferSelect = existing;

    await this.db.transaction(async (tx) => {
      const patch: Partial<typeof dailyPlanItem.$inferInsert> = {
        completed: dto.completed,
        completedAt: dto.completed ? new Date() : null,
      };

      const updated = await tx
        .update(dailyPlanItem)
        .set(patch)
        .where(eq(dailyPlanItem.id, id))
        .returning();
      if (updated.length === 0) throw new NotFoundException('计划条目不存在');
      updatedItem = updated[0];

      // 更新 plan 的 completedItems / completedMinutes
      const allItems = await tx
        .select()
        .from(dailyPlanItem)
        .where(eq(dailyPlanItem.dailyPlanId, existing.dailyPlanId));

      const completedItems = allItems.filter((it) => it.completed).length;
      const completedMinutes = allItems
        .filter((it) => it.completed)
        .reduce((sum: number, it) => sum + it.estimatedMinutes, 0);

      await tx
        .update(dailyPlan)
        .set({ completedItems, completedMinutes, updatedAt: new Date() })
        .where(eq(dailyPlan.id, existing.dailyPlanId));
    });

    await this.cacheManager.del(dailyPlanCacheKey(this.todayStr()));
    return this.toItem(updatedItem);
  }

  private async getUserSetting(): Promise<typeof userSetting.$inferSelect> {
    const rows = await this.db.select().from(userSetting).limit(1);
    if (rows.length > 0) return rows[0];
    const inserted = await this.db
      .insert(userSetting)
      .values({
        dailyMinutes: 300,
        examMode: false,
        weightSyllabus: 30,
        weightExamFreq: 20,
        weightMastery: 20,
        weightForgetting: 15,
        weightWrong: 10,
        weightOverdue: 5,
      })
      .returning();
    return inserted[0];
  }

  private async loadItems(planId: string): Promise<DailyPlanItem[]> {
    const rows = await this.db
      .select()
      .from(dailyPlanItem)
      .where(eq(dailyPlanItem.dailyPlanId, planId))
      .orderBy(dailyPlanItem.sortOrder, desc(dailyPlanItem.priorityScore));

    const kpIds = rows
      .map((r) => r.knowledgePointId)
      .filter((v): v is string => v !== null);
    const qIds = rows
      .map((r) => r.questionId)
      .filter((v): v is string => v !== null);

    const kpDetailMap = new Map<string, {
      title: string;
      subjectId: string;
      chapterId: string;
      syllabusItemId: string | null;
      requirementLevel: string;
      examFrequency: number;
      masteryScore: number;
      lastReviewedAt: Date | null;
      isWeakMarked: boolean;
    }>();
    if (kpIds.length > 0) {
      const kpRows = await this.db
        .select({
          id: knowledgePoint.id,
          title: knowledgePoint.title,
          subjectId: knowledgePoint.subjectId,
          chapterId: knowledgePoint.chapterId,
          syllabusItemId: knowledgePoint.syllabusItemId,
          requirementLevel: knowledgePoint.requirementLevel,
          examFrequency: knowledgePoint.examFrequency,
          masteryScore: knowledgePoint.masteryScore,
          lastReviewedAt: knowledgePoint.lastReviewedAt,
          isWeakMarked: knowledgePoint.isWeakMarked,
        })
        .from(knowledgePoint)
        .where(inArray(knowledgePoint.id, kpIds));
      for (const r of kpRows) {
        kpDetailMap.set(r.id, {
          title: r.title,
          subjectId: r.subjectId,
          chapterId: r.chapterId,
          syllabusItemId: r.syllabusItemId,
          requirementLevel: r.requirementLevel,
          examFrequency: r.examFrequency,
          masteryScore: r.masteryScore,
          lastReviewedAt: r.lastReviewedAt,
          isWeakMarked: r.isWeakMarked,
        });
      }
    }

    const qMap = new Map<string, { questionText: string; year: number; subjectId: string; questionType: string; source: string | null; difficulty: number; masteryScore: number; answerCount: number }>();
    if (qIds.length > 0) {
      const qRows = await this.db
        .select({
          id: examQuestion.id,
          questionText: examQuestion.questionText,
          year: examQuestion.year,
          subjectId: examQuestion.subjectId,
          questionType: examQuestion.questionType,
          source: examQuestion.source,
          difficulty: examQuestion.difficulty,
          masteryScore: examQuestion.masteryScore,
          answerCount: examQuestion.answerCount,
        })
        .from(examQuestion)
        .where(inArray(examQuestion.id, qIds));
      for (const r of qRows) {
        qMap.set(r.id, { questionText: r.questionText, year: r.year, subjectId: r.subjectId, questionType: r.questionType, source: r.source, difficulty: r.difficulty, masteryScore: r.masteryScore, answerCount: r.answerCount ?? 0 });
      }
    }

    const qKpFreqMap = new Map<string, number>();
    if (qIds.length > 0) {
      const qkpRows = await this.db
        .select({
          questionId: questionKnowledgePoint.questionId,
          examFrequency: knowledgePoint.examFrequency,
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          knowledgePoint,
          eq(questionKnowledgePoint.knowledgePointId, knowledgePoint.id)
        )
        .where(inArray(questionKnowledgePoint.questionId, qIds));
      for (const r of qkpRows) {
        const prev = qKpFreqMap.get(r.questionId) ?? 0;
        if ((r.examFrequency ?? 0) > prev) qKpFreqMap.set(r.questionId, r.examFrequency ?? 0);
      }
    }

    // 科目名
    const subjectIds = new Set<string>();
    for (const kp of kpDetailMap.values()) subjectIds.add(kp.subjectId);
    for (const q of qMap.values()) subjectIds.add(q.subjectId);
    const subjectMap = new Map<string, string>();
    if (subjectIds.size > 0) {
      const subjRows = await this.db
        .select({ id: subject.id, name: subject.name })
        .from(subject)
        .where(inArray(subject.id, Array.from(subjectIds)));
      for (const r of subjRows) subjectMap.set(r.id, r.name);
    }

    // 章节路径（自底向上构建）
    const chapterIds = new Set<string>();
    for (const kp of kpDetailMap.values()) chapterIds.add(kp.chapterId);
    const chapterMap = new Map<string, { title: string; parentId: string | null; level: number }>();
    if (chapterIds.size > 0) {
      const chRows = await this.db
        .select({
          id: chapter.id,
          title: chapter.title,
          parentChapterId: chapter.parentChapterId,
          level: chapter.level,
        })
        .from(chapter)
        .where(inArray(chapter.id, Array.from(chapterIds)));
      for (const r of chRows) {
          chapterMap.set(r.id, { title: r.title, parentId: r.parentChapterId, level: r.level ?? 1 });
        if (r.parentChapterId) chapterIds.add(r.parentChapterId);
      }
      // 补齐父级章节
      const parentIds = Array.from(chapterIds).filter((id) => !chapterMap.has(id));
      if (parentIds.length > 0) {
        const parentRows = await this.db
          .select({
            id: chapter.id,
            title: chapter.title,
            parentChapterId: chapter.parentChapterId,
            level: chapter.level,
          })
          .from(chapter)
          .where(inArray(chapter.id, parentIds));
        for (const r of parentRows) {
          chapterMap.set(r.id, { title: r.title, parentId: r.parentChapterId, level: r.level ?? 1 });
        }
      }
    }

    const getChapterPath = (chapterId: string): ChapterPathNode[] => {
      const path: ChapterPathNode[] = [];
      let cur: string | null = chapterId;
      while (cur) {
        const ch = chapterMap.get(cur);
        if (!ch) break;
        path.unshift({ id: cur, title: ch.title, level: ch.level ?? 1 });
        cur = ch.parentId;
      }
      return path;
    };

    // 教材章节归属（kp -> 主教材章节id）
    const kpTextbookChapterMap = new Map<string, string>();
    if (kpIds.length > 0) {
      const tbRows = await this.db
        .select({
          kpId: knowledgePointTextbookChapter.knowledgePointId,
          chapterId: knowledgePointTextbookChapter.chapterId,
          isPrimary: knowledgePointTextbookChapter.isPrimary,
        })
        .from(knowledgePointTextbookChapter)
        .where(inArray(knowledgePointTextbookChapter.knowledgePointId, kpIds));
      for (const r of tbRows) {
        if (!r.kpId || !r.chapterId) continue;
        const existing = kpTextbookChapterMap.get(r.kpId);
        if (!existing || r.isPrimary) kpTextbookChapterMap.set(r.kpId, r.chapterId);
      }
      // 把教材章节也塞进 chapterIds，补齐到 chapterMap
      for (const chId of kpTextbookChapterMap.values()) {
        if (!chapterMap.has(chId)) chapterIds.add(chId);
      }
      const missingTb = Array.from(kpTextbookChapterMap.values()).filter(
        (id) => !chapterMap.has(id),
      );
      if (missingTb.length > 0) {
        const tbChRows = await this.db
          .select({
            id: chapter.id,
            title: chapter.title,
            parentChapterId: chapter.parentChapterId,
            level: chapter.level,
          })
          .from(chapter)
          .where(inArray(chapter.id, missingTb));
        for (const r of tbChRows) {
          chapterMap.set(r.id, { title: r.title, parentId: r.parentChapterId, level: r.level });
          if (r.parentChapterId) chapterIds.add(r.parentChapterId);
        }
        // 再补一轮父级
        const tbParentIds = Array.from(chapterIds).filter((id) => !chapterMap.has(id));
        if (tbParentIds.length > 0) {
          const parentRows = await this.db
            .select({
              id: chapter.id,
              title: chapter.title,
              parentChapterId: chapter.parentChapterId,
              level: chapter.level,
            })
            .from(chapter)
            .where(inArray(chapter.id, tbParentIds));
          for (const r of parentRows) {
            chapterMap.set(r.id, { title: r.title, parentId: r.parentChapterId, level: r.level });
          }
        }
      }
    }

    // 大纲条目
    const syllabusIds = new Set<string>();
    for (const kp of kpDetailMap.values()) {
      if (kp.syllabusItemId) syllabusIds.add(kp.syllabusItemId);
    }
    const syllabusMap = new Map<string, { title: string }>();
    if (syllabusIds.size > 0) {
      const syRows = await this.db
        .select({ id: syllabusItem.id, title: syllabusItem.title })
        .from(syllabusItem)
        .where(inArray(syllabusItem.id, Array.from(syllabusIds)));
      for (const r of syRows) syllabusMap.set(r.id, { title: r.title });
    }

    // 知识点 -> 真题年份列表
    const kpExamYearsMap = new Map<string, number[]>();
    if (kpIds.length > 0) {
      const qkpRows = await this.db
        .select({
          kpId: questionKnowledgePoint.knowledgePointId,
          year: examQuestion.year,
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          examQuestion,
          eq(questionKnowledgePoint.questionId, examQuestion.id),
        )
        .where(inArray(questionKnowledgePoint.knowledgePointId, kpIds));
      for (const r of qkpRows) {
        const years = kpExamYearsMap.get(r.kpId) ?? [];
        if (!years.includes(r.year)) years.push(r.year);
        kpExamYearsMap.set(r.kpId, years);
      }
      for (const [kpId, years] of kpExamYearsMap) {
        years.sort((a, b) => b - a);
      }
    }

    // 最近一次复习自评（用 DISTINCT ON 一次查出每组最新）
    const lastReviewMap = new Map<string, { rating: string; reviewedAt: Date }>();
    if (kpIds.length > 0) {
      const idsSql = sql.join(kpIds.map((id) => sql`${id}::uuid`), sql`, `);
      const lastReviewRows = await this.db.execute(sql`
        SELECT DISTINCT ON (knowledge_point_id)
          knowledge_point_id AS kp_id,
          self_rating,
          reviewed_at
        FROM review_record
        WHERE knowledge_point_id = ANY(ARRAY[${idsSql}])
        ORDER BY knowledge_point_id, reviewed_at DESC
      `);
      for (const r of lastReviewRows as unknown as Array<{
        kp_id: string;
        self_rating: string;
        reviewed_at: Date;
      }>) {
        lastReviewMap.set(r.kp_id, { rating: r.self_rating, reviewedAt: r.reviewed_at });
      }
    }

    // 知识点 -> 未解决错题数
    const kpWrongCountMap = new Map<string, number>();
    if (kpIds.length > 0) {
      const wrongRows = await this.db
        .select({
          kpId: wrongQuestionTable.knowledgePointId,
          count: sql<number>`count(*)`,
        })
        .from(wrongQuestionTable)
        .where(
          and(
            inArray(wrongQuestionTable.knowledgePointId, kpIds),
            eq(wrongQuestionTable.resolved, false),
          ),
        )
        .groupBy(wrongQuestionTable.knowledgePointId);
      for (const r of wrongRows) {
        if (r.kpId) kpWrongCountMap.set(r.kpId, Number(r.count));
      }
    }

    return rows.map((row) => {
      const item = this.toItem(row);
      if (item.knowledgePointId) {
        const kp = kpDetailMap.get(item.knowledgePointId);
        if (kp) {
          item.knowledgePointTitle = kp.title;
          item.requirementLevel =
            kp.requirementLevel as DailyPlanItem['requirementLevel'];
          item.examFrequency = kp.examFrequency;
          item.masteryScore = kp.masteryScore;
          item.lastReviewedAt = kp.lastReviewedAt
            ? kp.lastReviewedAt.toISOString()
            : null;
          item.subjectName = subjectMap.get(kp.subjectId);
          item.chapterPath = getChapterPath(kp.chapterId).map((n) => n.title);
          const tbChapterId = kpTextbookChapterMap.get(item.knowledgePointId!);
          const textbookPath = tbChapterId ? getChapterPath(tbChapterId) : [];
          item.chapterPaths = {
            examSyllabus: getChapterPath(kp.chapterId),
            textbook: textbookPath,
          };
          if (kp.syllabusItemId) {
            item.syllabusTitle = syllabusMap.get(kp.syllabusItemId)?.title;
          }
          const years = kpExamYearsMap.get(item.knowledgePointId);
          if (years && years.length > 0) {
            item.examYears = years;
            item.latestExamYear = years[0];
            item.pendingQuestionCount = years.length;
          } else {
            item.pendingQuestionCount = 0;
          }
          item.pendingWrongCount = kpWrongCountMap.get(item.knowledgePointId) ?? 0;
          item.isWeakMarked = kp.isWeakMarked;
          const last = lastReviewMap.get(item.knowledgePointId);
          if (last) {
            item.lastReviewRating =
              last.rating as DailyPlanItem['lastReviewRating'];
          }
        }
      }
      if (item.questionId) {
        const q = qMap.get(item.questionId);
        if (q) {
          item.questionText = q.questionText;
          item.subjectName = subjectMap.get(q.subjectId);
          item.latestExamYear = q.year;
          item.questionType = q.questionType as DailyPlanItem['questionType'];
          item.questionSource = q.source;
          item.questionDifficulty = q.difficulty;
          item.questionAnswerCount = q.answerCount;
          item.masteryScore = q.masteryScore;
          const qFreq = qKpFreqMap.get(item.questionId);
          if (qFreq !== undefined) item.examFrequency = qFreq;
        }
      }
      return item;
    });
  }

  private toDailyPlan(row: typeof dailyPlan.$inferSelect): DailyPlan {
    return {
      id: row.id,
      planDate: row.planDate as string,
      generatedAt: row.generatedAt.toISOString(),
      status: row.status,
      totalEstimatedMinutes: row.totalEstimatedMinutes,
      completedMinutes: row.completedMinutes,
      totalItems: row.totalItems,
      completedItems: row.completedItems,
    };
  }

  private toItem(row: typeof dailyPlanItem.$inferSelect): DailyPlanItem {
    return {
      id: row.id,
      dailyPlanId: row.dailyPlanId,
      itemType: row.itemType as DailyPlanItem['itemType'],
      knowledgePointId: row.knowledgePointId,
      questionId: row.questionId,
      priorityScore: row.priorityScore,
      estimatedMinutes: row.estimatedMinutes,
      completed: row.completed,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      sortOrder: row.sortOrder,
      reason: row.reason,
    };
  }

  private kpRowToLightDto(row: {
    id: string;
    subjectId: string;
    chapterId: string;
    title: string;
    requirementLevel: string;
    importanceScore: number;
    examFrequency: number;
    masteryScore: number;
    status: string;
    lastReviewedAt: Date | null;
    nextReviewAt: Date | null;
    reviewStage: number;
    consecutiveCorrect: number;
    consecutiveWrong: number;
    totalReviewCount: number;
    totalQuestionCount: number;
     correctQuestionCount: number;
     isWeakMarked: boolean;
   }): KnowledgePoint {
    return {
      id: row.id,
      subjectId: row.subjectId,
      chapterId: row.chapterId,
      syllabusItemId: '',
      title: row.title,
      requirementLevel: row.requirementLevel as KnowledgePoint['requirementLevel'],
      importanceScore: row.importanceScore,
      examFrequency: row.examFrequency,
      masteryScore: row.masteryScore,
      recallMastery: 0,
      questionMastery: 0,
      answeredQuestionCount: 0,
      status: row.status as KnowledgePoint['status'],
      firstLearnedAt: null,
      lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
      nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
      reviewStage: row.reviewStage,
      consecutiveCorrect: row.consecutiveCorrect,
      consecutiveWrong: row.consecutiveWrong,
      totalReviewCount: row.totalReviewCount,
      totalQuestionCount: row.totalQuestionCount,
       correctQuestionCount: row.correctQuestionCount,
       manuallyPinned: false,
       isWeakMarked: row.isWeakMarked,
       weakMarkedAt: null,
       weakMarkReason: null,
       cardData: undefined as unknown as KnowledgePointCardData,
    };
  }

  private questionRowToLightDto(row: {
    id: string;
    year: number;
    subjectId: string;
    questionType: string;
    questionText: string;
    source: string;
    difficulty: number;
  }): ExamQuestion {
    return {
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
      masteryScore: 0,
      answered: false,
      answerCount: 0,
      lastAnsweredAt: null,
      cardData: undefined,
    };
  }

  private kpRowToDto(row: typeof knowledgePoint.$inferSelect): KnowledgePoint {
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

   private questionRowToDto(row: typeof examQuestion.$inferSelect): ExamQuestion {
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
     };
   }

  private wrongRowToDto(row: typeof wrongQuestionTable.$inferSelect): WrongQuestion {
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
      mistakeReason: row.mistakeReason,
      errorTags: (row.errorTags ?? []) as ErrorTag[],
    };
  }

  private toUserSetting(row: typeof userSetting.$inferSelect): UserSetting {
    return {
      id: row.id,
      examDate: row.examDate as string | null,
      dailyMinutes: row.dailyMinutes,
      dailyKpConfig: (row.dailyKpConfig as Record<string, number>) ?? {},
      dailyQuestionConfig: (row.dailyQuestionConfig as Record<string, number>) ?? {},
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
      mockExamScoreConfig: (row.mockExamScoreConfig as Record<string, number>) ?? {},
    };
  }

  private todayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
