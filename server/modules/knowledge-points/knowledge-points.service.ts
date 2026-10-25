import { Inject, Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import { and, desc, eq, count, inArray, ilike, or, sql } from 'drizzle-orm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type {
  KnowledgePoint,
  ExamQuestion,
  ReviewRecord,
  PaginatedResponse,
  SyllabusItem,
  SyllabusMode,
  ChapterPathNode,
  KnowledgePointChapterPaths,
} from '../../shared/api.interface';
import {
   knowledgePoint,
   examQuestion,
   questionKnowledgePoint,
   reviewRecord,
   chapter,
   syllabusItem,
   subject,
   knowledgePointTextbookChapter,
   userSetting,
   wrongQuestion,
 } from '../../database/schema';
import {
   KnowledgePointListQueryDto,
   CreateKnowledgePointDto,
   UpdateKnowledgePointDto,
   WeakMarkDto,
 } from './dto/knowledge-points.dto';
import { statusFromMastery, calculatePriorityScore } from '../../common/utils/review-algorithm';

export interface KnowledgePointDetail extends KnowledgePoint {
  syllabusItem?: SyllabusItem;
}

@Injectable()
export class KnowledgePointsService {
  /**
   * 列表缓存代次。cache-manager 的 Cache 接口没有清空全库的方法，
   * 而列表缓存 key 是按查询条件拼出来的，无法逐个删除。
   * 这里用「代次」把旧 key 整体作废：新增知识点后 +1，
   * 旧缓存自然在 30 秒后过期，新请求一定走数据库。
   */
  private listCacheEpoch = 0;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async findList(
    query: KnowledgePointListQueryDto,
  ): Promise<PaginatedResponse<KnowledgePoint>> {
    const cacheKey = `kp:list:v${this.listCacheEpoch}:${JSON.stringify(query)}`;
    const cached = await this.cacheManager.get<PaginatedResponse<KnowledgePoint>>(cacheKey);
    if (cached) return cached;

    const result = await this.findListFromDb(query);
    await this.cacheManager.set(cacheKey, result, 30 * 1000);
    return result;
  }

  private async findListFromDb(
    query: KnowledgePointListQueryDto,
  ): Promise<PaginatedResponse<KnowledgePoint>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const conditions = [];
    if (query.keyword)
      conditions.push(
        or(
          ilike(knowledgePoint.title, `%${query.keyword}%`),
          ilike(knowledgePoint.summary, `%${query.keyword}%`),
        ),
      );
    if (query.subjectId) conditions.push(eq(knowledgePoint.subjectId, query.subjectId));
    if (query.status) conditions.push(eq(knowledgePoint.status, query.status));
    if (query.weakMarked !== undefined)
      conditions.push(eq(knowledgePoint.isWeakMarked, query.weakMarked));

    const source = query.source ?? 'exam_syllabus';

    // 「篇 / 章」这类父节点本身不直接挂知识点，必须带上整棵子树一起筛，
    // 否则大纲地图里点父节点永远是 0 条。默认仍走精确匹配。
    let scopeChapterIds: string[] | null = null;
    if (query.chapterId) {
      scopeChapterIds = query.includeDescendants
        ? await this.collectChapterSubtreeIds(query.chapterId)
        : [query.chapterId];
    }

    if (source === 'textbook') {
      if (scopeChapterIds) {
        const kpIds = await this.db
          .select({ kpId: knowledgePointTextbookChapter.knowledgePointId })
          .from(knowledgePointTextbookChapter)
          .where(inArray(knowledgePointTextbookChapter.chapterId, scopeChapterIds));
        if (kpIds.length === 0) {
          return { items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
        }
        conditions.push(inArray(knowledgePoint.id, kpIds.map((r) => r.kpId)));
      } else if (query.subjectId) {
        const kpIds = await this.db
          .select({ kpId: knowledgePointTextbookChapter.knowledgePointId })
          .from(knowledgePointTextbookChapter)
          .innerJoin(chapter, eq(chapter.id, knowledgePointTextbookChapter.chapterId))
          .where(eq(chapter.subjectId, query.subjectId));
        if (kpIds.length === 0) {
          return { items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
        }
        conditions.push(inArray(knowledgePoint.id, kpIds.map((r) => r.kpId)));
      }
    } else {
      if (scopeChapterIds) conditions.push(inArray(knowledgePoint.chapterId, scopeChapterIds));
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
        syllabusItemId: knowledgePoint.syllabusItemId,
        title: knowledgePoint.title,
        keywords: knowledgePoint.keywords,
        requirementLevel: knowledgePoint.requirementLevel,
        importanceScore: knowledgePoint.importanceScore,
        examFrequency: knowledgePoint.examFrequency,
        masteryScore: knowledgePoint.masteryScore,
        recallMastery: knowledgePoint.recallMastery,
        questionMastery: knowledgePoint.questionMastery,
        answeredQuestionCount: knowledgePoint.answeredQuestionCount,
        status: knowledgePoint.status,
        firstLearnedAt: knowledgePoint.firstLearnedAt,
        lastReviewedAt: knowledgePoint.lastReviewedAt,
        nextReviewAt: knowledgePoint.nextReviewAt,
        reviewStage: knowledgePoint.reviewStage,
        consecutiveCorrect: knowledgePoint.consecutiveCorrect,
        consecutiveWrong: knowledgePoint.consecutiveWrong,
        totalReviewCount: knowledgePoint.totalReviewCount,
        totalQuestionCount: knowledgePoint.totalQuestionCount,
         correctQuestionCount: knowledgePoint.correctQuestionCount,
         manuallyPinned: knowledgePoint.manuallyPinned,
         isWeakMarked: knowledgePoint.isWeakMarked,
         weakMarkedAt: knowledgePoint.weakMarkedAt,
         weakMarkReason: knowledgePoint.weakMarkReason,
       })
      .from(knowledgePoint)
      .where(where)
      .orderBy(
        desc(knowledgePoint.manuallyPinned),
        desc(knowledgePoint.importanceScore),
        desc(knowledgePoint.examFrequency),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: KnowledgePoint[] = rows.map((row) => ({
      ...row,
      summary: '',
      content: '',
      keywords: row.keywords ?? [],
      requirementLevel: row.requirementLevel as KnowledgePoint['requirementLevel'],
      status: row.status as KnowledgePoint['status'],
      firstLearnedAt: row.firstLearnedAt ? row.firstLearnedAt.toISOString() : null,
      lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
      nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
      manuallyPinned: row.manuallyPinned,
      isWeakMarked: row.isWeakMarked,
      weakMarkedAt: row.weakMarkedAt ? row.weakMarkedAt.toISOString() : null,
      weakMarkReason: (row.weakMarkReason as KnowledgePoint['weakMarkReason']) ?? null,
      cardData: { blocks: [], summary: '', flowSteps: [] },
    }));

    if (items.length > 0) {
      const kpIds = items.map((kp) => kp.id);
      const yearRows = await this.db
        .select({
          kpId: questionKnowledgePoint.knowledgePointId,
          year: examQuestion.year,
          source: examQuestion.source,
        })
        .from(questionKnowledgePoint)
        .innerJoin(
          examQuestion,
          eq(questionKnowledgePoint.questionId, examQuestion.id),
        )
        .where(inArray(questionKnowledgePoint.knowledgePointId, kpIds));
      const yearMap = new Map<string, number>();
      const sourceMap = new Map<string, string[]>();
      for (const r of yearRows) {
        const cur = yearMap.get(r.kpId);
        if (cur === undefined || r.year > cur) {
          yearMap.set(r.kpId, r.year);
        }
        if (r.source) {
          const arr = sourceMap.get(r.kpId) ?? [];
          if (!arr.includes(r.source)) arr.push(r.source);
          sourceMap.set(r.kpId, arr);
        }
      }
      for (const item of items) {
        item.latestExamYear = yearMap.get(item.id) ?? null;
        item.examSources = sourceMap.get(item.id) ?? [];
      }

      // 批量加载考纲章节标题
      const examChapterIds = [...new Set(items.map((kp) => kp.chapterId).filter(Boolean))] as string[];
      if (examChapterIds.length > 0) {
        const examChRows = await this.db
          .select({ id: chapter.id, title: chapter.title })
          .from(chapter)
          .where(inArray(chapter.id, examChapterIds));
        const examChMap = new Map<string, string>(examChRows.map((r) => [r.id, r.title] as [string, string]));
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

      // 批量加载教材章节标题（取主归属）
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
        const tbChMap = new Map<string, string>(tbChRows.map((r) => [r.id, r.title] as [string, string]));
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

    // 按用户权重计算优先级并重排当前页（置顶保持最高优先级）
    if (items.length > 0) {
      const kpIds = items.map((kp: KnowledgePoint) => kp.id);

      // 错题计数
      const wrongRows = await this.db
        .select({
          knowledgePointId: wrongQuestion.knowledgePointId,
          totalWrong: sql<number>`SUM(${wrongQuestion.wrongCount})`,
        })
        .from(wrongQuestion)
        .where(inArray(wrongQuestion.knowledgePointId, kpIds))
        .groupBy(wrongQuestion.knowledgePointId);
      const wrongMap = new Map<string, number>();
      for (const r of wrongRows) {
        if (r.knowledgePointId) {
          wrongMap.set(r.knowledgePointId, Number(r.totalWrong) || 0);
        }
      }

      // 用户权重设置
      const settingsRows = await this.db.select().from(userSetting).limit(1);
      const s = settingsRows[0];
      const kpSettings = {
        kpWeightSyllabus: s?.kpWeightSyllabus ?? 30,
        kpWeightExamFreq: s?.kpWeightExamFreq ?? 20,
        kpWeightMastery: s?.kpWeightMastery ?? 20,
        kpWeightForgetting: s?.kpWeightForgetting ?? 15,
        kpWeightWrong: s?.kpWeightWrong ?? 10,
        kpWeightOverdue: s?.kpWeightOverdue ?? 5,
      };

      items.sort((a: KnowledgePoint, b: KnowledgePoint) => {
        if (a.manuallyPinned !== b.manuallyPinned) {
          return a.manuallyPinned ? -1 : 1;
        }
        const scoreA = calculatePriorityScore({
          requirementLevel: a.requirementLevel,
          examFrequency: a.examFrequency,
          masteryScore: a.masteryScore,
          lastReviewedAt: a.lastReviewedAt ? new Date(a.lastReviewedAt) : null,
          reviewStage: a.reviewStage,
          wrongCount: wrongMap.get(a.id) ?? 0,
          nextReviewAt: a.nextReviewAt ? new Date(a.nextReviewAt) : null,
          settings: kpSettings,
        });
        const scoreB = calculatePriorityScore({
          requirementLevel: b.requirementLevel,
          examFrequency: b.examFrequency,
          masteryScore: b.masteryScore,
          lastReviewedAt: b.lastReviewedAt ? new Date(b.lastReviewedAt) : null,
          reviewStage: b.reviewStage,
          wrongCount: wrongMap.get(b.id) ?? 0,
          nextReviewAt: b.nextReviewAt ? new Date(b.nextReviewAt) : null,
          settings: kpSettings,
        });
        return scoreB - scoreA;
      });
    }

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 取某个章节连同其全部下级章节的 id。
   * 章节表按 subjectId + source 分成两套树，规模都在千条以内，
   * 这里一次性取同科目同来源的全部节点在内存里向下遍历，比递归 CTE 更好维护。
   */
  private async collectChapterSubtreeIds(chapterId: string): Promise<string[]> {
    const rootRows = await this.db
      .select({
        id: chapter.id,
        subjectId: chapter.subjectId,
        source: chapter.source,
      })
      .from(chapter)
      .where(eq(chapter.id, chapterId));
    if (rootRows.length === 0) return [chapterId];

    const { subjectId, source } = rootRows[0];
    const all = await this.db
      .select({ id: chapter.id, parentChapterId: chapter.parentChapterId })
      .from(chapter)
      .where(
        and(eq(chapter.subjectId, subjectId), eq(chapter.source, source)),
      );

    const childrenMap = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentChapterId) continue;
      const list = childrenMap.get(row.parentChapterId) ?? [];
      list.push(row.id);
      childrenMap.set(row.parentChapterId, list);
    }

    const ids: string[] = [];
    const stack: string[] = [chapterId];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      ids.push(current);
      const children = childrenMap.get(current);
      if (children) stack.push(...children);
    }
    return ids;
  }

  /**
   * 各章节的知识点数量（已按父子关系向上汇总），给大纲地图左侧树做数字角标。
   * 必须和列表的「含下级章节」语义一致，点开父节点看到的条数才等于角标上的数字。
   */
  async chapterCounts(
    subjectId: string,
    source: SyllabusMode = 'exam_syllabus',
  ): Promise<Record<string, number>> {
    validateUuid(subjectId, '科目ID');

    const chapterRows = await this.db
      .select({ id: chapter.id, parentChapterId: chapter.parentChapterId })
      .from(chapter)
      .where(and(eq(chapter.subjectId, subjectId), eq(chapter.source, source)));

    const parentMap = new Map<string, string | null>();
    for (const row of chapterRows) {
      parentMap.set(row.id, row.parentChapterId ?? null);
    }

    const direct = new Map<string, number>();
    if (source === 'textbook') {
      const rows = await this.db
        .select({
          chapterId: knowledgePointTextbookChapter.chapterId,
          total: count(),
        })
        .from(knowledgePointTextbookChapter)
        .innerJoin(
          chapter,
          eq(chapter.id, knowledgePointTextbookChapter.chapterId),
        )
        .where(eq(chapter.subjectId, subjectId))
        .groupBy(knowledgePointTextbookChapter.chapterId);
      for (const row of rows) {
        if (!row.chapterId) continue;
        direct.set(row.chapterId, Number(row.total));
      }
    } else {
      const rows = await this.db
        .select({ chapterId: knowledgePoint.chapterId, total: count() })
        .from(knowledgePoint)
        .where(eq(knowledgePoint.subjectId, subjectId))
        .groupBy(knowledgePoint.chapterId);
      for (const row of rows) {
        if (!row.chapterId) continue;
        direct.set(row.chapterId, Number(row.total));
      }
    }

    const totals = new Map<string, number>();
    for (const [chapterId, value] of direct) {
      let current: string | null = chapterId;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        totals.set(current, (totals.get(current) ?? 0) + value);
        current = parentMap.get(current) ?? null;
      }
    }

    return Object.fromEntries(totals);
  }

  async findOne(id: string): Promise<KnowledgePointDetail> {
    validateUuid(id, '知识点ID');
    const rows = await this.db
      .select()
      .from(knowledgePoint)
      .where(eq(knowledgePoint.id, id));
    if (rows.length === 0) throw new NotFoundException('知识点不存在');
    const kp = rows[0];

    const result: KnowledgePointDetail = {
      ...this.toKnowledgePoint(kp),
    };

    // 科目名
    const subjRows = await this.db
      .select({ name: subject.name })
      .from(subject)
      .where(eq(subject.id, kp.subjectId));
    if (subjRows.length > 0) {
      result.subjectName = subjRows[0].name;
    }

    // 加载两套目录的完整章节路径
    result.chapterPaths = await this.buildChapterPaths(kp.id, kp.chapterId, kp.subjectId);
    // 兼容旧字段：取考纲路径标题数组
    if (result.chapterPaths.examSyllabus.length > 0) {
      result.chapterPath = result.chapterPaths.examSyllabus.map((n) => n.title);
    }

    // 加载大纲条目
    if (kp.syllabusItemId) {
      const syRows = await this.db
        .select()
        .from(syllabusItem)
        .where(eq(syllabusItem.id, kp.syllabusItemId));
      if (syRows.length > 0) {
        result.syllabusItem = this.toSyllabusItem(syRows[0]);
        result.syllabusTitle = syRows[0].title;
      }
    }

    return result;
  }

  async findQuestions(id: string): Promise<ExamQuestion[]> {
    const rows = await this.db
      .select({
        id: examQuestion.id,
        year: examQuestion.year,
        subjectId: examQuestion.subjectId,
        questionType: examQuestion.questionType,
        questionText: examQuestion.questionText,
        answer: examQuestion.answer,
        answerKeywords: examQuestion.answerKeywords,
        source: examQuestion.source,
        notes: examQuestion.notes,
        difficulty: examQuestion.difficulty,
        masteryScore: examQuestion.masteryScore,
        answered: examQuestion.answered,
        answerCount: examQuestion.answerCount,
        lastAnsweredAt: examQuestion.lastAnsweredAt,
         cardData: examQuestion.cardData,
      })
      .from(questionKnowledgePoint)
      .innerJoin(
        examQuestion,
        eq(questionKnowledgePoint.questionId, examQuestion.id),
      )
      .where(eq(questionKnowledgePoint.knowledgePointId, id))
      .orderBy(desc(examQuestion.year));

    return rows.map((row) => ({
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
        cardData: (row.cardData ?? {}) as ExamQuestion['cardData'],
     }));
  }

  async findReviewRecords(id: string): Promise<ReviewRecord[]> {
    const rows = await this.db
      .select()
      .from(reviewRecord)
      .where(eq(reviewRecord.knowledgePointId, id))
      .orderBy(desc(reviewRecord.reviewedAt))
      .limit(100);

    return rows.map((row) => this.toReviewRecord(row));
  }

  /**
   * 手动新增知识点。
   *
   * 知识点表里 subject_id / chapter_id 都是非空外键，所以必须挂在某个科目下的某个章节里；
   * 这里额外校验「章节确实属于该科目」，避免前端传错造成跨科目挂载。
   * 手动新增的知识点 syllabus_item_id 为空，不参与大纲条目统计。
   */
  async create(dto: CreateKnowledgePointDto): Promise<KnowledgePoint> {
    validateUuid(dto.subjectId, '科目 ID');
    validateUuid(dto.chapterId, '章节 ID');

    const title = (dto.title ?? '').trim();
    if (!title) {
      throw new BadRequestException('知识点标题不能为空');
    }

    const subjectRows = await this.db
      .select({ id: subject.id })
      .from(subject)
      .where(eq(subject.id, dto.subjectId));
    if (subjectRows.length === 0) {
      throw new NotFoundException('科目不存在');
    }

    const chapterRows = await this.db
      .select({ id: chapter.id, subjectId: chapter.subjectId })
      .from(chapter)
      .where(eq(chapter.id, dto.chapterId));
    if (chapterRows.length === 0) {
      throw new NotFoundException('章节不存在');
    }
    if (chapterRows[0].subjectId !== dto.subjectId) {
      throw new BadRequestException('所选章节不属于该科目');
    }

    const dup = await this.db
      .select({ id: knowledgePoint.id })
      .from(knowledgePoint)
      .where(
        and(
          eq(knowledgePoint.chapterId, dto.chapterId),
          eq(knowledgePoint.title, title),
        ),
      );
    if (dup.length > 0) {
      throw new ConflictException('该章节下已存在同名知识点');
    }

    const inserted = await this.db
      .insert(knowledgePoint)
      .values({
        subjectId: dto.subjectId,
        chapterId: dto.chapterId,
        title,
        content: dto.content ?? null,
        summary: dto.summary ?? null,
        keywords: dto.keywords ?? [],
        requirementLevel: dto.requirementLevel ?? 'unmarked',
        importanceScore: dto.importanceScore ?? 0,
        cardData: (dto.cardData ?? {}) as any,
      })
      .returning();

    this.listCacheEpoch += 1;
    await this.invalidateDailyPlanCache();
    return this.toKnowledgePoint(inserted[0]);
  }

  async update(id: string, dto: UpdateKnowledgePointDto): Promise<KnowledgePoint> {
    const patch: Partial<typeof knowledgePoint.$inferInsert> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.summary !== undefined) patch.summary = dto.summary;
    if (dto.requirementLevel !== undefined)
      patch.requirementLevel = dto.requirementLevel;
    if (dto.masteryScore !== undefined) {
      patch.masteryScore = dto.masteryScore;
      patch.status = statusFromMastery(dto.masteryScore);
    }
    if (dto.cardData !== undefined) {
      (patch as any).cardData = dto.cardData;
    }

    if (Object.keys(patch).length === 0) {
      return this.findOne(id);
    }

    patch.updatedAt = new Date();

    const updated = await this.db
      .update(knowledgePoint)
      .set(patch)
      .where(eq(knowledgePoint.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('知识点不存在');
    return this.toKnowledgePoint(updated[0]);
  }

  async pin(id: string): Promise<KnowledgePoint> {
    const updated = await this.db
      .update(knowledgePoint)
      .set({ manuallyPinned: true, updatedAt: new Date() })
      .where(eq(knowledgePoint.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('知识点不存在');
    return this.toKnowledgePoint(updated[0]);
  }

  async unpin(id: string): Promise<KnowledgePoint> {
    const updated = await this.db
      .update(knowledgePoint)
      .set({ manuallyPinned: false, updatedAt: new Date() })
      .where(eq(knowledgePoint.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('知识点不存在');
    return this.toKnowledgePoint(updated[0]);
  }

  async markWeak(id: string, dto: WeakMarkDto): Promise<KnowledgePoint> {
    const now = new Date();
    const updated = await this.db
      .update(knowledgePoint)
      .set({
        isWeakMarked: true,
        weakMarkedAt: now,
        weakMarkReason: dto.reason ?? null,
        updatedAt: now,
      })
      .where(eq(knowledgePoint.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('知识点不存在');
    await this.invalidateDailyPlanCache();
    return this.toKnowledgePoint(updated[0]);
  }

  async unmarkWeak(id: string): Promise<KnowledgePoint> {
    const now = new Date();
    const updated = await this.db
      .update(knowledgePoint)
      .set({
        isWeakMarked: false,
        weakMarkedAt: null,
        weakMarkReason: null,
        updatedAt: now,
      })
      .where(eq(knowledgePoint.id, id))
      .returning();
    if (updated.length === 0) throw new NotFoundException('知识点不存在');
    await this.invalidateDailyPlanCache();
    return this.toKnowledgePoint(updated[0]);
  }

  async recalculateAllStatuses(): Promise<{ updated: number }> {
    const result = await this.db.execute(sql`
      UPDATE knowledge_point
      SET status = CASE
        WHEN total_review_count = 0 AND answered_question_count = 0 AND recall_mastery = 0 AND question_mastery = 0 THEN 'not_started'::varchar
        WHEN mastery_score >= 90 THEN 'mastered'::varchar
        WHEN mastery_score >= 70 THEN 'familiar'::varchar
        WHEN mastery_score >= 40 THEN 'medium'::varchar
        ELSE 'weak'::varchar
      END
      WHERE status != CASE
        WHEN total_review_count = 0 AND answered_question_count = 0 AND recall_mastery = 0 AND question_mastery = 0 THEN 'not_started'::varchar
        WHEN mastery_score >= 90 THEN 'mastered'::varchar
        WHEN mastery_score >= 70 THEN 'familiar'::varchar
        WHEN mastery_score >= 40 THEN 'medium'::varchar
        ELSE 'weak'::varchar
      END
    `);
    const updated = Number((result as unknown as { rowCount: number }).rowCount ?? 0);
    return { updated };
  }

  async addQuestion(
    knowledgePointId: string,
    questionId: string,
  ): Promise<void> {
    validateUuid(knowledgePointId, '知识点ID');
    validateUuid(questionId, '真题ID');

    const kpRows = await this.db
      .select({ id: knowledgePoint.id })
      .from(knowledgePoint)
      .where(eq(knowledgePoint.id, knowledgePointId));
    if (kpRows.length === 0) throw new NotFoundException('知识点不存在');

    const qRows = await this.db
      .select({ id: examQuestion.id })
      .from(examQuestion)
      .where(eq(examQuestion.id, questionId));
    if (qRows.length === 0) throw new NotFoundException('真题不存在');

    const existing = await this.db
      .select()
      .from(questionKnowledgePoint)
      .where(and(
        eq(questionKnowledgePoint.questionId, questionId),
        eq(questionKnowledgePoint.knowledgePointId, knowledgePointId),
      ));
    if (existing.length > 0) {
      throw new ConflictException('该真题已关联');
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

    await this.recalcExamFrequency(knowledgePointId);
    await this.invalidateDailyPlanCache();
  }

  async removeQuestion(
    knowledgePointId: string,
    questionId: string,
  ): Promise<void> {
    validateUuid(knowledgePointId, '知识点ID');
    validateUuid(questionId, '真题ID');

    const deleted = await this.db
      .delete(questionKnowledgePoint)
      .where(and(
        eq(questionKnowledgePoint.questionId, questionId),
        eq(questionKnowledgePoint.knowledgePointId, knowledgePointId),
      ))
      .returning({ knowledgePointId: questionKnowledgePoint.knowledgePointId });
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

    await this.recalcExamFrequency(knowledgePointId);
    await this.invalidateDailyPlanCache();
  }

  private async recalcExamFrequency(kpId: string): Promise<void> {
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

  private async invalidateDailyPlanCache(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await this.cacheManager.del(`dailyplan:today:${today}`);
  }

  private async buildChapterPaths(
    knowledgePointId: string,
    examSyllabusChapterId: string,
    subjectId: string,
  ): Promise<KnowledgePointChapterPaths> {
    const examPath = await this.buildChapterPathNodes(examSyllabusChapterId);

    const tbRows = await this.db
      .select({ chapterId: knowledgePointTextbookChapter.chapterId })
      .from(knowledgePointTextbookChapter)
      .where(eq(knowledgePointTextbookChapter.knowledgePointId, knowledgePointId))
      .orderBy(desc(knowledgePointTextbookChapter.isPrimary))
      .limit(1);

    let textbookPath: ChapterPathNode[] = [];
    if (tbRows.length > 0 && tbRows[0].chapterId) {
      textbookPath = await this.buildChapterPathNodes(tbRows[0].chapterId);
    }

    return { examSyllabus: examPath, textbook: textbookPath };
  }

  private async buildChapterPathNodes(chapterId: string): Promise<ChapterPathNode[]> {
    const path: ChapterPathNode[] = [];
    let currentId: string | null = chapterId;
    const maxDepth = 10;
    let depth = 0;

    while (currentId && depth < maxDepth) {
      const rows = await this.db
        .select({
          id: chapter.id,
          title: chapter.title,
          level: chapter.level,
          parentChapterId: chapter.parentChapterId,
        })
        .from(chapter)
        .where(eq(chapter.id, currentId));
      if (rows.length === 0) break;
      path.unshift({ id: rows[0].id, title: rows[0].title, level: rows[0].level });
      currentId = rows[0].parentChapterId;
      depth++;
    }

    return path;
  }

  private async buildChapterPathArray(chapterId: string): Promise<string[]> {
    return (await this.buildChapterPathNodes(chapterId)).map((n) => n.title);
  }

  private async buildChapterPath(chapterId: string): Promise<string> {
    return (await this.buildChapterPathArray(chapterId)).join(' / ');
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
      content: row.content,
      summary: row.summary,
      keywords: row.keywords ?? [],
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

  private toSyllabusItem(
    row: typeof syllabusItem.$inferSelect,
  ): SyllabusItem {
    return {
      id: row.id,
      subjectId: row.subjectId,
      chapterId: row.chapterId,
      title: row.title,
      originalText: row.originalText,
      requirementLevel: row.requirementLevel as SyllabusItem['requirementLevel'],
      source: row.source,
      sortOrder: row.sortOrder,
    };
  }
}
