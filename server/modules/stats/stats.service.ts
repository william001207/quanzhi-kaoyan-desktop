import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, count, sql, sum, gte, lt, inArray } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type {
  StatsOverview,
  SubjectStats,
  MasteryDistribution,
  ReviewLoadDay,
  FreqMasteryPoint,
  HighFreqItem,
  ChapterPathNode,
  KnowledgePointChapterPaths,
} from '../../shared/api.interface';
import {
  knowledgePoint,
  examQuestion,
  questionKnowledgePoint,
  subject,
  chapter,
  knowledgePointTextbookChapter,
  reviewRecord,
} from '../../database/schema';
import { ReviewLoadQueryDto, HighFreqQueryDto, DateRangeQueryDto } from './dto/stats.dto';

@Injectable()
export class StatsService {
  private static readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getOverview(query: DateRangeQueryDto = {}): Promise<StatsOverview> {
    const { startDate, endDate } = query;
    const hasRange = !!startDate && !!endDate;

    if (!hasRange) {
      return this.getOverviewAllTime();
    }

    const startIso = new Date(startDate).toISOString();
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endIso = endDateObj.toISOString();

    // Total knowledge points & total questions remain all-time
    const totalKpResult = await this.db
      .select({ count: count() })
      .from(knowledgePoint);
    const totalKnowledgePoints = Number(totalKpResult[0]?.count ?? 0);

    const totalQResult = await this.db
      .select({ count: count() })
      .from(examQuestion);
    const totalQuestions = totalQResult[0]?.count ?? 0;

    // KPs that have at least one review record in the range
    const rangeKpSubquery = this.db
      .select({ knowledgePointId: reviewRecord.knowledgePointId })
      .from(reviewRecord)
      .where(
        sql`
          ${reviewRecord.reviewedAt} >= ${startIso}::timestamptz
          AND ${reviewRecord.reviewedAt} < ${endIso}::timestamptz
        `,
      )
      .groupBy(reviewRecord.knowledgePointId)
      .as('range_kp');

    // Count of started KPs in range (all with review records)
    const startedResult = await this.db
      .select({ count: count() })
      .from(rangeKpSubquery);
    const startedKnowledgePoints = Number(startedResult[0]?.count ?? 0);

    // Mastered KPs: those with review records in range AND current status = 'mastered'
    const masteredResult = await this.db
      .select({ count: count() })
      .from(rangeKpSubquery)
      .innerJoin(
        knowledgePoint,
        eq(rangeKpSubquery.knowledgePointId, knowledgePoint.id),
      )
      .where(eq(knowledgePoint.status, 'mastered'));
    const masteredKnowledgePoints = Number(masteredResult[0]?.count ?? 0);

    // Question records and correct counts in range
    const qStatsResult = await this.db
      .select({
        doneQuestions: sql<number>`count(*)`,
        correctQuestions: sql<number>`
          sum(case when ${reviewRecord.questionScore} > 0 then 1 else 0 end)
        `,
      })
      .from(reviewRecord)
      .where(
        sql`
          ${reviewRecord.reviewedAt} >= ${startIso}::timestamptz
          AND ${reviewRecord.reviewedAt} < ${endIso}::timestamptz
          AND ${reviewRecord.reviewType} = 'question'
        `,
      );
    const doneQuestions = Number(qStatsResult[0]?.doneQuestions ?? 0);
    const correctQuestions = Number(qStatsResult[0]?.correctQuestions ?? 0);

    // Average mastery of KPs that have review records in range
    const avgResult = await this.db
      .select({ avgMastery: sql<number>`avg(${knowledgePoint.masteryScore})` })
      .from(rangeKpSubquery)
      .innerJoin(
        knowledgePoint,
        eq(rangeKpSubquery.knowledgePointId, knowledgePoint.id),
      );
    const avgMastery = Number(avgResult[0]?.avgMastery ?? 0);

    return {
      syllabusCoverage: totalKnowledgePoints > 0 ? startedKnowledgePoints / totalKnowledgePoints : 0,
      masteryRate: avgMastery / 100,
      questionCompletionRate: totalQuestions > 0 ? Math.min(1, doneQuestions / totalQuestions) : 0,
      questionAccuracy: doneQuestions > 0 ? correctQuestions / doneQuestions : 0,
      totalKnowledgePoints,
      startedKnowledgePoints,
      masteredKnowledgePoints,
      totalQuestions,
      doneQuestions,
      correctQuestions,
    };
  }

  private async getOverviewAllTime(): Promise<StatsOverview> {
    const key = 'stats:overview:all';
    const cached = await this.cache.get<StatsOverview>(key);
    if (cached !== null && cached !== undefined) return cached;

    const result = await this.db
      .select({
        totalKnowledgePoints: count(),
        startedKnowledgePoints: sql<number>`
          sum(case when ${knowledgePoint.status} != 'not_started' then 1 else 0 end)
        `,
        masteredKnowledgePoints: sql<number>`
          sum(case when ${knowledgePoint.status} = 'mastered' then 1 else 0 end)
        `,
        doneQuestions: sql<number>`coalesce(sum(${knowledgePoint.totalQuestionCount}), 0)`,
        correctQuestions: sql<number>`coalesce(sum(${knowledgePoint.correctQuestionCount}), 0)`,
        avgMastery: sql<number>`avg(${knowledgePoint.masteryScore})`,
      })
      .from(knowledgePoint);
    const row = result[0];
    const totalKnowledgePoints = Number(row?.totalKnowledgePoints ?? 0);
    const startedKnowledgePoints = Number(row?.startedKnowledgePoints ?? 0);
    const masteredKnowledgePoints = Number(row?.masteredKnowledgePoints ?? 0);
    const doneQuestions = Number(row?.doneQuestions ?? 0);
    const correctQuestions = Number(row?.correctQuestions ?? 0);
    const avgMastery = Number(row?.avgMastery ?? 0);

    const totalQResult = await this.db
      .select({ count: count() })
      .from(examQuestion);
    const totalQuestions = totalQResult[0]?.count ?? 0;

    const data: StatsOverview = {
      syllabusCoverage: totalKnowledgePoints > 0 ? startedKnowledgePoints / totalKnowledgePoints : 0,
      masteryRate: avgMastery / 100,
      questionCompletionRate: totalQuestions > 0 ? Math.min(1, doneQuestions / totalQuestions) : 0,
      questionAccuracy: doneQuestions > 0 ? correctQuestions / doneQuestions : 0,
      totalKnowledgePoints,
      startedKnowledgePoints,
      masteredKnowledgePoints,
      totalQuestions,
      doneQuestions,
      correctQuestions,
    };
    await this.cache.set(key, data, StatsService.CACHE_TTL);
    return data;
  }

  async getBySubject(query: DateRangeQueryDto = {}): Promise<SubjectStats[]> {
    const { startDate, endDate } = query;
    const hasRange = !!startDate && !!endDate;

    if (!hasRange) {
      return this.getBySubjectAllTime();
    }

    const startIso = new Date(startDate).toISOString();
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endIso = endDateObj.toISOString();

    // KPs with review records in range
    const rangeKpSubquery = this.db
      .select({
        knowledgePointId: reviewRecord.knowledgePointId,
        questionDone: sql<number>`
          sum(case when ${reviewRecord.reviewType} = 'question' then 1 else 0 end)
        `.as('questionDone'),
        questionCorrect: sql<number>`
          sum(case when ${reviewRecord.reviewType} = 'question' AND ${reviewRecord.questionScore} > 0 then 1 else 0 end)
        `.as('questionCorrect'),
      })
      .from(reviewRecord)
      .where(
        sql`
          ${reviewRecord.reviewedAt} >= ${startIso}::timestamptz
          AND ${reviewRecord.reviewedAt} < ${endIso}::timestamptz
        `,
      )
      .groupBy(reviewRecord.knowledgePointId)
      .as('range_kp');

    const rows = await this.db
      .select({
        subjectId: knowledgePoint.subjectId,
        subjectName: subject.name,
        totalPoints: sql<number>`count(*)`,
        startedPoints: sql<number>`count(*)`,
        masteredPoints: sql<number>`
          sum(case when ${knowledgePoint.status} = 'mastered' then 1 else 0 end)
        `,
        avgMasteryScore: sql<number>`avg(${knowledgePoint.masteryScore})`,
        questionAccuracy: sql<number>`
          case when sum(${rangeKpSubquery.questionDone}) > 0
            then sum(${rangeKpSubquery.questionCorrect})::float / sum(${rangeKpSubquery.questionDone})
            else 0 end
        `,
        weakPointCount: sql<number>`
          sum(case when ${knowledgePoint.status} = 'weak' then 1 else 0 end)
        `,
      })
      .from(rangeKpSubquery)
      .innerJoin(
        knowledgePoint,
        eq(rangeKpSubquery.knowledgePointId, knowledgePoint.id),
      )
      .innerJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .groupBy(knowledgePoint.subjectId, subject.name)
      .orderBy(subject.name);

    return rows.map((row): SubjectStats => ({
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      totalPoints: Number(row.totalPoints),
      startedPoints: Number(row.startedPoints),
      masteredPoints: Number(row.masteredPoints),
      avgMasteryScore: Number(row.avgMasteryScore) || 0,
      questionAccuracy: Number(row.questionAccuracy) || 0,
      weakPointCount: Number(row.weakPointCount),
    }));
  }

  private async getBySubjectAllTime(): Promise<SubjectStats[]> {
    const key = 'stats:by-subject:all';
    const cached = await this.cache.get<SubjectStats[]>(key);
    if (cached !== null && cached !== undefined) return cached;

    const rows = await this.db
      .select({
        subjectId: knowledgePoint.subjectId,
        subjectName: subject.name,
        totalPoints: count(),
        masteredPoints: sql<number>`
          sum(case when ${knowledgePoint.status} = 'mastered' then 1 else 0 end)
        `,
        startedPoints: sql<number>`
          sum(case when ${knowledgePoint.status} != 'not_started' then 1 else 0 end)
        `,
        avgMasteryScore: sql<number>`avg(${knowledgePoint.masteryScore})`,
        questionAccuracy: sql<number>`
          case when sum(${knowledgePoint.totalQuestionCount}) > 0
            then sum(${knowledgePoint.correctQuestionCount})::float / sum(${knowledgePoint.totalQuestionCount})
            else 0 end
        `,
        weakPointCount: sql<number>`
          sum(case when ${knowledgePoint.status} = 'weak' then 1 else 0 end)
        `,
      })
      .from(knowledgePoint)
      .innerJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .groupBy(knowledgePoint.subjectId, subject.name)
      .orderBy(subject.name);

    const data: SubjectStats[] = rows.map((row): SubjectStats => ({
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      totalPoints: Number(row.totalPoints),
      startedPoints: Number(row.startedPoints),
      masteredPoints: Number(row.masteredPoints),
      avgMasteryScore: Number(row.avgMasteryScore) || 0,
      questionAccuracy: Number(row.questionAccuracy) || 0,
      weakPointCount: Number(row.weakPointCount),
    }));
    await this.cache.set(key, data, StatsService.CACHE_TTL);
    return data;
  }

  async getMasteryDistribution(query: DateRangeQueryDto = {}): Promise<MasteryDistribution> {
    const { startDate, endDate } = query;
    const hasRange = !!startDate && !!endDate;

    if (!hasRange) {
      return this.getMasteryDistributionAllTime();
    }

    const startIso = new Date(startDate).toISOString();
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endIso = endDateObj.toISOString();

    // KPs with review records in range, grouped by current status
    const rows = await this.db
      .select({
        status: knowledgePoint.status,
        count: count(),
      })
      .from(reviewRecord)
      .innerJoin(
        knowledgePoint,
        eq(reviewRecord.knowledgePointId, knowledgePoint.id),
      )
      .where(
        sql`
          ${reviewRecord.reviewedAt} >= ${startIso}::timestamptz
          AND ${reviewRecord.reviewedAt} < ${endIso}::timestamptz
        `,
      )
      .groupBy(knowledgePoint.status);

    const byStatus = new Map<string, number>();
    for (const r of rows) byStatus.set(r.status, Number(r.count));

    return {
      notStarted: byStatus.get('not_started') ?? 0,
      weak: byStatus.get('weak') ?? 0,
      medium: byStatus.get('medium') ?? 0,
      familiar: byStatus.get('familiar') ?? 0,
      mastered: byStatus.get('mastered') ?? 0,
    };
  }

  private async getMasteryDistributionAllTime(): Promise<MasteryDistribution> {
    const key = 'stats:mastery-distribution:all';
    const cached = await this.cache.get<MasteryDistribution>(key);
    if (cached !== null && cached !== undefined) return cached;

    const rows = await this.db
      .select({
        status: knowledgePoint.status,
        count: count(),
      })
      .from(knowledgePoint)
      .groupBy(knowledgePoint.status);

    const byStatusAllTime = new Map<string, number>();
    for (const r of rows) byStatusAllTime.set(r.status, Number(r.count));

    const data: MasteryDistribution = {
      notStarted: byStatusAllTime.get('not_started') ?? 0,
      weak: byStatusAllTime.get('weak') ?? 0,
      medium: byStatusAllTime.get('medium') ?? 0,
      familiar: byStatusAllTime.get('familiar') ?? 0,
      mastered: byStatusAllTime.get('mastered') ?? 0,
    };
    await this.cache.set(key, data, StatsService.CACHE_TTL);
    return data;
  }

  async getFreqMastery(): Promise<FreqMasteryPoint[]> {
    const rows = await this.db
      .select({
        knowledgePointId: knowledgePoint.id,
        title: knowledgePoint.title,
        examFrequency: knowledgePoint.examFrequency,
        masteryScore: knowledgePoint.masteryScore,
        subjectName: subject.name,
      })
      .from(knowledgePoint)
      .innerJoin(subject, eq(knowledgePoint.subjectId, subject.id))
      .where(sql`${knowledgePoint.examFrequency} > 0`)
      .orderBy(desc(knowledgePoint.examFrequency))
      .limit(100);

    return rows.map((row): FreqMasteryPoint => ({
      knowledgePointId: row.knowledgePointId,
      title: row.title,
      examFrequency: row.examFrequency,
      masteryScore: row.masteryScore,
      subjectName: row.subjectName,
    }));
  }

  async getReviewLoad(query: ReviewLoadQueryDto): Promise<ReviewLoadDay[]> {
    const days = query.days ?? 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);
    const endIso = endDate.toISOString();

    // 先查逾期总数（今天之前到期的）
    const overdueRows = await this.db
      .select({ count: count() })
      .from(knowledgePoint)
      .where(
        sql`
          ${knowledgePoint.nextReviewAt} IS NOT NULL
          AND ${knowledgePoint.nextReviewAt} < ${todayIso}::timestamptz
        `,
      );
    const totalOverdue = Number(overdueRows[0]?.count ?? 0);

    // 按日聚合未来 N 天的复习量
    const dailyRows = await this.db
      .select({
        date: sql<string>`date(${knowledgePoint.nextReviewAt})`,
        count: count(),
      })
      .from(knowledgePoint)
      .where(
        sql`
          ${knowledgePoint.nextReviewAt} IS NOT NULL
          AND ${knowledgePoint.nextReviewAt} >= ${todayIso}::timestamptz
          AND ${knowledgePoint.nextReviewAt} < ${endIso}::timestamptz
        `,
      )
      .groupBy(sql`date(${knowledgePoint.nextReviewAt})`)
      .orderBy(sql`date(${knowledgePoint.nextReviewAt})`);

    const byDate = new Map<string, number>();
    for (const r of dailyRows) {
      byDate.set(r.date, Number(r.count));
    }

    const result: ReviewLoadDay[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        count: byDate.get(dateStr) ?? 0,
        overdue: i === 0 ? totalOverdue : 0,
      });
    }
    return result;
  }

  async getHighFreq(query: HighFreqQueryDto): Promise<HighFreqItem[]> {
    const limit = query.limit ?? 20;

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
      .groupBy(knowledgePoint.id, subject.name)
      .orderBy(
         desc(sql<number>`count(*)`),
         desc(sql<number>`max(${examQuestion.year})`),
       )
      .limit(limit);

    const kpIds = rows.map((r) => r.knowledgePointId);
    const chapterPathsMap = await this.buildChapterPathsMap(kpIds);

    return rows.map(
      (row, index): HighFreqItem => ({
        rank: index + 1,
        knowledgePointId: row.knowledgePointId,
        title: row.title,
         count: Number(row.count),
         latestYear: Number(row.latestYear),
        subjectName: row.subjectName,
        sourceSchools: [],
        chapterPaths: chapterPathsMap.get(row.knowledgePointId),
      }),
    );
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
}
