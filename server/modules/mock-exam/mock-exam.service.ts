import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { validateUuid } from '../../common/utils/uuid-validate';
import {
  and,
  desc,
  eq,
  count,
  inArray,
  gte,
  lte,
  isNull,
} from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type {
  ExamQuestion,
  GeneratePaperResult,
  MockExamQuestionType,
  TypeAvailability,
  ExamRecord,
  ExamRecordListItem,
  ExamRecordDetail,
  StartExamResult,
  SelfRateResult,
  ExamSelfRating,
  PaginatedResponse,
  KnowledgePointBrief,
  MockExamScoreConfig,
  ExamPaperListItem,
  ExamPaperStatus,
   ExamPaperTemplate,
   CreateTemplateDto,
   UpdateTemplateDto,
   ExamPaperDetail,
 } from '../../shared/api.interface';
import { DEFAULT_MOCK_EXAM_SCORE_CONFIG } from '../../shared/api.interface';
import {
  examPaper,
  examRecord,
  examQuestion,
  reviewRecord,
  wrongQuestion,
  questionKnowledgePoint,
  knowledgePoint,
  examPaperTemplate,
} from '../../database/schema';
import type {
  GeneratePaperDto,
  GenerateByYearDto,
  SelfRateDto,
  SubmitExamDto,
  SaveAnswerDto,
} from './dto/mock-exam.dto';

const SUBJECTIVE_TYPES: MockExamQuestionType[] = [
  'noun_explanation',
  'short_answer',
  'essay',
];

const MINUTES_BY_TYPE: Record<MockExamQuestionType, number> = {
  noun_explanation: 8,
  short_answer: 15,
  essay: 20,
};

const RATING_RATIO: Record<ExamSelfRating, number> = {
  again: 0,
  partial: 0.4,
  basic: 0.7,
  full: 1,
};

function resolveScoreConfig(
  passed?: Record<string, number> | null,
): Record<MockExamQuestionType, number> {
  const result: Record<MockExamQuestionType, number> = {
    ...DEFAULT_MOCK_EXAM_SCORE_CONFIG,
  };
  if (!passed || typeof passed !== 'object') return result;
  const types: MockExamQuestionType[] = ['noun_explanation', 'short_answer', 'essay'];
  for (const t of types) {
    const v = passed[t];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) {
      result[t] = v;
    }
  }
  return result;
}

@Injectable()
export class MockExamService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  // ========= 1. 自定义组卷 =========
  async generatePaper(dto: GeneratePaperDto): Promise<GeneratePaperResult> {
    const types = dto.questionTypes.filter((t) =>
      SUBJECTIVE_TYPES.includes(t),
    );
    if (types.length === 0) {
      throw new BadRequestException('至少需要一种主观题型');
    }

    const scoreConfig = resolveScoreConfig(dto.scoreConfig);

    const availability: Partial<Record<MockExamQuestionType, TypeAvailability>> = {};
    const allSelectedIds: string[] = [];
    let totalScore = 0;
    let totalMinutes = 0;

    for (const qType of types) {
      const requested = dto.questionCounts[qType] ?? 0;
      if (requested <= 0) continue;

      const pool = await this.getQuestionPool(qType, dto);
      const available = pool.length;

      const picked = this.pickByReviewRecency(pool, requested);
      for (const id of picked) allSelectedIds.push(id);

      totalScore += picked.length * scoreConfig[qType];
      totalMinutes += picked.length * MINUTES_BY_TYPE[qType];

      availability[qType] = { requested, available };
    }

    if (allSelectedIds.length === 0) {
      throw new BadRequestException('没有符合条件的题目');
    }

    const title = dto.title?.trim() || this.buildCustomTitle(dto);
    const inserted = await this.db
      .insert(examPaper)
      .values({
        title,
        mode: 'custom',
        subjectIds: dto.subjectIds,
        source: dto.source ?? null,
        yearStart: dto.yearStart ?? null,
        yearEnd: dto.yearEnd ?? null,
        questionTypes: types,
        questionCounts: dto.questionCounts as Record<string, number>,
        totalScore,
        estimatedMinutes: totalMinutes,
        questionIds: allSelectedIds,
        scoreConfig: scoreConfig as Record<string, number>,
      })
      .returning();

    const questions = await this.loadQuestionsByIds(allSelectedIds);

    return {
      paperId: inserted[0].id,
      title,
      questions,
      totalScore,
      estimatedMinutes: totalMinutes,
      availability,
      scoreConfig,
    };
  }

  // ========= 2. 按院校年份整套 =========
  async generateByYear(dto: GenerateByYearDto): Promise<GeneratePaperResult> {
    const rows = await this.db
      .select()
      .from(examQuestion)
      .where(
        and(
          eq(examQuestion.source, dto.source),
          eq(examQuestion.year, dto.year),
          inArray(examQuestion.questionType, SUBJECTIVE_TYPES),
        ),
      )
      .orderBy(examQuestion.questionType, examQuestion.id);

    if (rows.length === 0) {
      throw new NotFoundException('未找到对应院校年份的真题');
    }

    const scoreConfig = resolveScoreConfig(dto.scoreConfig);

    const typeOrder: MockExamQuestionType[] = [
      'noun_explanation',
      'short_answer',
      'essay',
    ];
    const sorted = [...rows].sort((a, b) => {
      const ai = typeOrder.indexOf(a.questionType as MockExamQuestionType);
      const bi = typeOrder.indexOf(b.questionType as MockExamQuestionType);
      if (ai !== bi) return ai - bi;
      return a.id < b.id ? -1 : 1;
    });

    const questionIds = sorted.map((q) => q.id);
    const questionCounts: Record<string, number> = {};
    let totalScore = 0;
    let totalMinutes = 0;
    const availability: Partial<Record<MockExamQuestionType, TypeAvailability>> = {};

    for (const qType of SUBJECTIVE_TYPES) {
      const cnt = sorted.filter(
        (q) => q.questionType === qType,
      ).length;
      if (cnt > 0) {
        questionCounts[qType] = cnt;
        totalScore += cnt * scoreConfig[qType];
        totalMinutes += cnt * MINUTES_BY_TYPE[qType];
        availability[qType] = { requested: cnt, available: cnt };
      }
    }

    const title = dto.title?.trim() || `${dto.source} ${dto.year}年 真题卷`;
    const inserted = await this.db
      .insert(examPaper)
      .values({
        title,
        mode: 'by_year',
        subjectIds: [],
        source: dto.source,
        yearStart: dto.year,
        yearEnd: dto.year,
        questionTypes: Object.keys(questionCounts),
        questionCounts,
        totalScore,
        estimatedMinutes: totalMinutes,
        questionIds,
        scoreConfig: scoreConfig as Record<string, number>,
      })
      .returning();

    const questions = sorted.map((row) => this.rowToExamQuestion(row));

    return {
      paperId: inserted[0].id,
      title,
      questions,
      totalScore,
      estimatedMinutes: totalMinutes,
      availability,
      scoreConfig,
    };
  }

  // ========= 3. 开始考试 =========
  async startExam(paperId: string): Promise<StartExamResult> {
    validateUuid(paperId, '试卷ID');
    const paperRows = await this.db
      .select()
      .from(examPaper)
      .where(eq(examPaper.id, paperId));
    if (paperRows.length === 0) {
      throw new NotFoundException('试卷不存在');
    }
    const paper = paperRows[0];
    const scoreConfig = resolveScoreConfig(
      paper.scoreConfig as Record<string, number> | null,
    );

    const inserted = await this.db
      .insert(examRecord)
      .values({
        paperId: paper.id,
        title: paper.title,
        totalScore: paper.totalScore,
        earnedScore: '0',
        totalQuestions: paper.questionIds.length,
        status: 'in_progress',
      })
      .returning();

    const questions = await this.loadQuestionsByIds(paper.questionIds);

    const availability: Partial<Record<MockExamQuestionType, TypeAvailability>> = {};
    for (const qType of paper.questionTypes as MockExamQuestionType[]) {
      const cnt = questions.filter((q) => q.questionType === qType).length;
      availability[qType] = { requested: cnt, available: cnt };
    }

    return {
      recordId: inserted[0].id,
      paper: {
        paperId: paper.id,
        title: paper.title,
        questions,
        totalScore: paper.totalScore,
        estimatedMinutes: paper.estimatedMinutes,
        availability,
        scoreConfig,
      },
    };
  }

  // ========= 4. 保存单题作答 =========
  async saveAnswer(
    recordId: string,
    dto: SaveAnswerDto,
  ): Promise<{ ok: boolean }> {
    validateUuid(recordId, '考试记录ID');
    const existing = await this.db
      .select({ answers: examRecord.answers, status: examRecord.status })
      .from(examRecord)
      .where(eq(examRecord.id, recordId));
    if (existing.length === 0) {
      throw new NotFoundException('考试记录不存在');
    }
    if (existing[0].status === 'submitted') {
      throw new BadRequestException('已交卷，不能再修改答案');
    }

    const currentAnswers = (existing[0].answers ?? {}) as Record<string, string>;
    const newAnswers = { ...currentAnswers, [dto.questionId]: dto.answer };

    await this.db
      .update(examRecord)
      .set({ answers: newAnswers })
      .where(eq(examRecord.id, recordId));

    return { ok: true };
  }

  // ========= 5. 交卷 =========
  async submitExam(
    recordId: string,
    dto: SubmitExamDto,
  ): Promise<ExamRecordDetail> {
    validateUuid(recordId, '考试记录ID');
    const rows = await this.db
      .select()
      .from(examRecord)
      .where(eq(examRecord.id, recordId));
    if (rows.length === 0) {
      throw new NotFoundException('考试记录不存在');
    }
    if (rows[0].status === 'submitted') {
      throw new BadRequestException('已经交卷');
    }

    const now = new Date();
    const updated = await this.db
      .update(examRecord)
      .set({
        answers: dto.answers,
        submittedAt: now,
        status: 'submitted',
        totalDurationSeconds: dto.durationSeconds,
      })
      .where(eq(examRecord.id, recordId))
      .returning();

    const record = updated[0];
    const paperRows = await this.db
      .select({ questionIds: examPaper.questionIds, scoreConfig: examPaper.scoreConfig })
      .from(examPaper)
      .where(eq(examPaper.id, record.paperId));
    const questionIds = paperRows[0]?.questionIds ?? [];
    const scoreConfig = resolveScoreConfig(
      (paperRows[0]?.scoreConfig ?? {}) as Record<string, number>,
    );
    const questions = await this.loadQuestionsByIds(questionIds);

    return this.toExamRecordDetail(record, questions, scoreConfig);
  }

  // ========= 6. 自评得分 =========
  async selfRate(
    recordId: string,
    dto: SelfRateDto,
  ): Promise<SelfRateResult> {
    validateUuid(recordId, '考试记录ID');
    const rows = await this.db
      .select()
      .from(examRecord)
      .where(eq(examRecord.id, recordId));
    if (rows.length === 0) {
      throw new NotFoundException('考试记录不存在');
    }
    const record = rows[0];
    if (record.status !== 'submitted') {
      throw new BadRequestException('未交卷不能自评');
    }

    // 取试卷分值配置
    const paperRows = await this.db
      .select({ scoreConfig: examPaper.scoreConfig })
      .from(examPaper)
      .where(eq(examPaper.id, record.paperId));
    const scoreConfig = resolveScoreConfig(
      (paperRows[0]?.scoreConfig ?? {}) as Record<string, number>,
    );

    // 取题目信息（含题型与分值）
    const qRows = await this.db
      .select()
      .from(examQuestion)
      .where(eq(examQuestion.id, dto.questionId))
      .limit(1);
    if (qRows.length === 0) {
      throw new BadRequestException('题目不存在');
    }
    const qRow = qRows[0];
    const qType = qRow.questionType as MockExamQuestionType;
    const fullScore = scoreConfig[qType] ?? 0;
    const questionScore = Math.round(fullScore * RATING_RATIO[dto.rating] * 10) / 10;

    const currentRatings = (record.selfRatings ?? {}) as Record<string, ExamSelfRating>;
    const currentScores = (record.scores ?? {}) as Record<string, number>;
    const currentAdded = (record.addedToWrong ?? {}) as Record<string, boolean>;

    const newRatings = { ...currentRatings, [dto.questionId]: dto.rating };
    const newScores = { ...currentScores, [dto.questionId]: questionScore };
    const newAdded = { ...currentAdded, [dto.questionId]: dto.addToWrong };

    // 重算 earned_score
    let earned = 0;
    for (const v of Object.values(newScores)) {
      earned += Number(v) || 0;
    }

    const updated = await this.db
      .update(examRecord)
      .set({
        selfRatings: newRatings,
        scores: newScores,
        addedToWrong: newAdded,
        earnedScore: String(earned),
      })
      .where(eq(examRecord.id, recordId))
      .returning();

    // 写错题本
    if (dto.addToWrong) {
      await this.ensureWrongQuestion(dto.questionId, dto.knowledgePointIds);
    }

    // 返回详情
    const paperRows2 = await this.db
      .select({ questionIds: examPaper.questionIds, scoreConfig: examPaper.scoreConfig })
      .from(examPaper)
      .where(eq(examPaper.id, updated[0].paperId));
    const questionIds = paperRows2[0]?.questionIds ?? [];
    const detailScoreConfig = resolveScoreConfig(
      (paperRows2[0]?.scoreConfig ?? {}) as Record<string, number>,
    );
    const questions = await this.loadQuestionsByIds(questionIds);

    return {
      record: this.toExamRecordDetail(updated[0], questions, detailScoreConfig),
      questionScore,
    };
  }

  // ========= 7. 历史记录列表 =========
  async getRecords(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<ExamRecordListItem>> {
    const totalResult = await this.db
      .select({ count: count() })
      .from(examRecord);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select({
        id: examRecord.id,
        title: examRecord.title,
        totalScore: examRecord.totalScore,
        earnedScore: examRecord.earnedScore,
        totalQuestions: examRecord.totalQuestions,
        submittedAt: examRecord.submittedAt,
        status: examRecord.status,
      })
      .from(examRecord)
      .orderBy(desc(examRecord.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        totalScore: row.totalScore,
        earnedScore: Number(row.earnedScore) || 0,
        totalQuestions: row.totalQuestions,
        submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
        status: row.status as ExamRecord['status'],
      })),
      total,
      page,
      pageSize,
    };
  }

  // ========= 7. 试卷列表 =========
  async getPapers(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<ExamPaperListItem>> {
    const totalResult = await this.db
      .select({ count: count() })
      .from(examPaper);
    const total = totalResult[0]?.count ?? 0;

    const paperRows = await this.db
      .select()
      .from(examPaper)
      .orderBy(desc(examPaper.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (paperRows.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const paperIds = paperRows.map((p) => p.id);
    // 找每份试卷最新的考试记录
    const latestRecords = await this.db
      .select({
        paperId: examRecord.paperId,
        recordId: examRecord.id,
        status: examRecord.status,
        earnedScore: examRecord.earnedScore,
        createdAt: examRecord.createdAt,
      })
      .from(examRecord)
      .where(inArray(examRecord.paperId, paperIds))
      .orderBy(desc(examRecord.createdAt));

    const latestMap = new Map<string, typeof latestRecords[number]>();
    for (const r of latestRecords) {
      if (!latestMap.has(r.paperId)) {
        latestMap.set(r.paperId, r);
      }
    }

    const items: ExamPaperListItem[] = paperRows.map((p) => {
      const latest = latestMap.get(p.id);
      let status: ExamPaperStatus = 'not_started';
      if (latest) {
        status = latest.status === 'submitted' ? 'submitted' : 'in_progress';
      }
      return {
        id: p.id,
        title: p.title,
        mode: p.mode,
        totalScore: p.totalScore,
        totalQuestions: p.questionIds.length,
        estimatedMinutes: p.estimatedMinutes,
        status,
        earnedScore: latest ? Number(latest.earnedScore) : null,
        latestRecordId: latest ? latest.recordId : null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return { items, total, page, pageSize };
  }

  // ========= 7.5 试卷详情 =========
  async getPaperDetail(paperId: string): Promise<ExamPaperDetail> {
    const paperRows = await this.db
      .select()
      .from(examPaper)
      .where(eq(examPaper.id, paperId))
      .limit(1);
    if (paperRows.length === 0) {
      throw new NotFoundException('试卷不存在');
    }
    const paper = paperRows[0];
    const questions = await this.loadQuestionsByIds(paper.questionIds);
    const scoreConfig = resolveScoreConfig(
      paper.scoreConfig as Record<string, number> | null,
    );
    return {
      id: paper.id,
      title: paper.title,
      mode: paper.mode,
      totalScore: paper.totalScore,
      totalQuestions: paper.questionIds.length,
      estimatedMinutes: paper.estimatedMinutes,
      createdAt: paper.createdAt.toISOString(),
      questions,
      scoreConfig,
    };
  }

  // ========= 7.6 模板列表 =========
  async listTemplates(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<ExamPaperTemplate>> {
    const totalResult = await this.db
      .select({ count: count() })
      .from(examPaperTemplate);
    const total = totalResult[0]?.count ?? 0;

    const rows = await this.db
      .select()
      .from(examPaperTemplate)
      .orderBy(desc(examPaperTemplate.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: ExamPaperTemplate[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode as 'custom' | 'by_year',
      subjectIds: r.subjectIds,
      source: r.source ?? null,
      yearStart: r.yearStart ?? null,
      yearEnd: r.yearEnd ?? null,
      questionTypes: r.questionTypes as MockExamQuestionType[],
      questionCounts: r.questionCounts as MockExamScoreConfig,
      scoreConfig: r.scoreConfig as MockExamScoreConfig,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }

  // ========= 7.7 创建模板 =========
  async createTemplate(
    dto: CreateTemplateDto,
  ): Promise<ExamPaperTemplate> {
    const inserted = await this.db
      .insert(examPaperTemplate)
      .values({
        name: dto.name,
        mode: dto.mode,
        subjectIds: dto.subjectIds,
        source: dto.source ?? null,
        yearStart: dto.yearStart ?? null,
        yearEnd: dto.yearEnd ?? null,
        questionTypes: dto.questionTypes,
        questionCounts: dto.questionCounts as Record<string, number>,
        scoreConfig: dto.scoreConfig as Record<string, number>,
      })
      .returning();

    const row = inserted[0];
    return {
      id: row.id,
      name: row.name,
      mode: row.mode as 'custom' | 'by_year',
      subjectIds: row.subjectIds,
      source: row.source ?? null,
      yearStart: row.yearStart ?? null,
      yearEnd: row.yearEnd ?? null,
      questionTypes: row.questionTypes as MockExamQuestionType[],
      questionCounts: row.questionCounts as MockExamScoreConfig,
      scoreConfig: row.scoreConfig as MockExamScoreConfig,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ========= 7.8 更新模板 =========
  async updateTemplate(
    id: string,
    dto: UpdateTemplateDto,
  ): Promise<ExamPaperTemplate> {
    validateUuid(id, '模板ID');
    const existing = await this.db
      .select({ id: examPaperTemplate.id })
      .from(examPaperTemplate)
      .where(eq(examPaperTemplate.id, id));
    if (existing.length === 0) {
      throw new NotFoundException('模板不存在');
    }

    const patch: Partial<typeof examPaperTemplate.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.subjectIds !== undefined) patch.subjectIds = dto.subjectIds;
    if (dto.source !== undefined) patch.source = dto.source;
    if (dto.yearStart !== undefined) patch.yearStart = dto.yearStart;
    if (dto.yearEnd !== undefined) patch.yearEnd = dto.yearEnd;
    if (dto.questionTypes !== undefined)
      patch.questionTypes = dto.questionTypes;
    if (dto.questionCounts !== undefined)
      patch.questionCounts = dto.questionCounts as Record<string, number>;
    if (dto.scoreConfig !== undefined)
      patch.scoreConfig = dto.scoreConfig as Record<string, number>;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();

    const updated = await this.db
      .update(examPaperTemplate)
      .set(patch)
      .where(eq(examPaperTemplate.id, id))
      .returning();

    const row = updated[0];
    return {
      id: row.id,
      name: row.name,
      mode: row.mode as 'custom' | 'by_year',
      subjectIds: row.subjectIds,
      source: row.source ?? null,
      yearStart: row.yearStart ?? null,
      yearEnd: row.yearEnd ?? null,
      questionTypes: row.questionTypes as MockExamQuestionType[],
      questionCounts: row.questionCounts as MockExamScoreConfig,
      scoreConfig: row.scoreConfig as MockExamScoreConfig,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ========= 7.9 删除模板 =========
  async deleteTemplate(id: string): Promise<{ ok: boolean }> {
    validateUuid(id, '模板ID');
    const existing = await this.db
      .select({ id: examPaperTemplate.id })
      .from(examPaperTemplate)
      .where(eq(examPaperTemplate.id, id));
    if (existing.length === 0) {
      throw new NotFoundException('模板不存在');
    }
    await this.db.delete(examPaperTemplate).where(eq(examPaperTemplate.id, id));
    return { ok: true };
  }

  // ========= 7.5 删除试卷 =========
  async deletePaper(id: string): Promise<{ ok: boolean }> {
    validateUuid(id, '试卷ID');
    const existing = await this.db
      .select({ id: examPaper.id })
      .from(examPaper)
      .where(eq(examPaper.id, id));
    if (existing.length === 0) {
      throw new NotFoundException('试卷不存在');
    }
    await this.db.delete(examPaper).where(eq(examPaper.id, id));
    return { ok: true };
  }

  // ========= 8. 单条记录详情 =========
  async getRecordDetail(id: string): Promise<ExamRecordDetail> {
    validateUuid(id, '考试记录ID');
    const rows = await this.db
      .select()
      .from(examRecord)
      .where(eq(examRecord.id, id));
    if (rows.length === 0) {
      throw new NotFoundException('考试记录不存在');
    }
    const record = rows[0];

    const paperRows = await this.db
      .select({ questionIds: examPaper.questionIds, scoreConfig: examPaper.scoreConfig })
      .from(examPaper)
      .where(eq(examPaper.id, record.paperId));
    const questionIds = paperRows[0]?.questionIds ?? [];
    const scoreConfig = resolveScoreConfig(
      (paperRows[0]?.scoreConfig ?? {}) as Record<string, number>,
    );
    const questions = await this.loadQuestionsByIds(questionIds);

    return this.toExamRecordDetail(record, questions, scoreConfig);
  }

  // ========= 辅助方法 =========

  private async getQuestionPool(
    qType: MockExamQuestionType,
    dto: GeneratePaperDto,
  ): Promise<Array<{ id: string; lastReviewedAt: Date | null }>> {
    const conditions = [eq(examQuestion.questionType, qType)];
    if (dto.subjectIds.length > 0) {
      conditions.push(inArray(examQuestion.subjectId, dto.subjectIds));
    }
    if (dto.source) {
      conditions.push(eq(examQuestion.source, dto.source));
    }
    if (dto.yearStart !== undefined) {
      conditions.push(gte(examQuestion.year, dto.yearStart));
    }
    if (dto.yearEnd !== undefined) {
      conditions.push(lte(examQuestion.year, dto.yearEnd));
    }

    const rows = await this.db
      .select({
        id: examQuestion.id,
        lastReviewedAt: reviewRecord.reviewedAt,
      })
      .from(examQuestion)
      .leftJoin(
        reviewRecord,
        eq(reviewRecord.questionId, examQuestion.id),
      )
      .where(and(...conditions))
      .orderBy(desc(reviewRecord.reviewedAt));

    // 去重，保留最近一次 review
    const map = new Map<string, Date | null>();
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, row.lastReviewedAt ?? null);
      }
    }
    return Array.from(map.entries()).map(([id, lastReviewedAt]) => ({
      id,
      lastReviewedAt,
    }));
  }

  private pickByReviewRecency(
    pool: Array<{ id: string; lastReviewedAt: Date | null }>,
    count: number,
  ): string[] {
    if (pool.length <= count) return pool.map((p) => p.id);

    // 分两组：未做过的（lastReviewedAt = null）和做过的
    const never: string[] = [];
    const done: Array<{ id: string; lastReviewedAt: Date }> = [];
    for (const p of pool) {
      if (p.lastReviewedAt === null) {
        never.push(p.id);
      } else {
        done.push({ id: p.id, lastReviewedAt: p.lastReviewedAt });
      }
    }

    // 久未做的排前面（时间越早越先选）
    done.sort((a, b) => a.lastReviewedAt.getTime() - b.lastReviewedAt.getTime());

    const result: string[] = [];
    // 优先从未做过的随机抽
    const neverShuffled = this.shuffle(never);
    for (const id of neverShuffled) {
      if (result.length >= count) break;
      result.push(id);
    }
    // 不足的从久未做的里按顺序补
    for (const d of done) {
      if (result.length >= count) break;
      result.push(d.id);
    }
    return result;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private buildCustomTitle(dto: GeneratePaperDto): string {
    const typeLabels: Record<MockExamQuestionType, string> = {
      noun_explanation: '名解',
      short_answer: '简答',
      essay: '论述',
    };
    const parts: string[] = [];
    for (const t of dto.questionTypes) {
      const cnt = dto.questionCounts[t] ?? 0;
      if (cnt > 0) parts.push(`${typeLabels[t]}${cnt}道`);
    }
    const yearPart =
      dto.yearStart && dto.yearEnd
        ? `${dto.yearStart}-${dto.yearEnd}`
        : dto.yearStart
          ? `${dto.yearStart}起`
          : dto.yearEnd
            ? `至${dto.yearEnd}`
            : '';
    const sourcePart = dto.source ?? '';
    const prefix = [sourcePart, yearPart].filter(Boolean).join(' ');
    return prefix ? `${prefix} ${parts.join('+')}` : `自定义 ${parts.join('+')}`;
  }

  private async loadQuestionsByIds(ids: string[]): Promise<ExamQuestion[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(examQuestion)
      .where(inArray(examQuestion.id, ids));

    const rowMap = new Map<string, typeof rows[number]>();
    for (const r of rows) rowMap.set(r.id, r);

    // 加载知识点
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
      .where(inArray(questionKnowledgePoint.questionId, ids));

    const kpMap = new Map<string, KnowledgePointBrief[]>();
    for (const r of kpRows) {
      if (!r.questionId) continue;
      const list = kpMap.get(r.questionId) ?? [];
      list.push({
        id: r.id,
        title: r.title,
        isPrimary: r.isPrimary,
        subjectId: r.subjectId,
      });
      kpMap.set(r.questionId, list);
    }

    // 按原 id 顺序返回
    const result: ExamQuestion[] = [];
    for (const id of ids) {
      const row = rowMap.get(id);
      if (!row) continue;
      const q = this.rowToExamQuestion(row);
      q.knowledgePoints = kpMap.get(id) ?? [];
      result.push(q);
    }
    return result;
  }

  private rowToExamQuestion(
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
      cardData: (row.cardData ?? {}) as ExamQuestion['cardData'],
    };
  }

  private toExamRecordDetail(
    row: typeof examRecord.$inferSelect,
    questions: ExamQuestion[],
    scoreConfig: Record<MockExamQuestionType, number>,
  ): ExamRecordDetail {
    return {
      id: row.id,
      paperId: row.paperId,
      title: row.title,
      totalScore: row.totalScore,
      earnedScore: Number(row.earnedScore) || 0,
      totalQuestions: row.totalQuestions,
      startedAt: row.startedAt.toISOString(),
      submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
      totalDurationSeconds: row.totalDurationSeconds,
      status: row.status as ExamRecord['status'],
      answers: (row.answers ?? {}) as Record<string, string>,
      selfRatings: (row.selfRatings ?? {}) as Record<string, ExamSelfRating>,
      scores: (row.scores ?? {}) as Record<string, number>,
      addedToWrong: (row.addedToWrong ?? {}) as Record<string, boolean>,
      questions,
      scoreConfig,
    };
  }

  private async ensureWrongQuestion(
    questionId: string,
    knowledgePointIds?: string[],
  ): Promise<void> {
    // 取主知识点（isPrimary=true）或第一个知识点
    let kpId: string | null = null;
    if (knowledgePointIds && knowledgePointIds.length > 0) {
      kpId = knowledgePointIds[0];
    } else {
      const kpRows = await this.db
        .select({
          id: questionKnowledgePoint.knowledgePointId,
          isPrimary: questionKnowledgePoint.isPrimary,
        })
        .from(questionKnowledgePoint)
        .where(eq(questionKnowledgePoint.questionId, questionId))
        .orderBy(desc(questionKnowledgePoint.isPrimary), questionKnowledgePoint.relevance);
      if (kpRows.length > 0) {
        kpId = kpRows[0].id;
      }
    }

    const now = new Date();
    const nextRetryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const existing = await this.db
      .select()
      .from(wrongQuestion)
      .where(
        and(
          eq(wrongQuestion.questionId, questionId),
          kpId
            ? eq(wrongQuestion.knowledgePointId, kpId)
            : isNull(wrongQuestion.knowledgePointId),
        ),
      );

    if (existing.length > 0) {
      await this.db
        .update(wrongQuestion)
        .set({
          wrongCount: existing[0].wrongCount + 1,
          lastWrongAt: now,
          resolved: false,
          nextRetryAt,
        })
        .where(eq(wrongQuestion.id, existing[0].id));
      return;
    }

    await this.db.insert(wrongQuestion).values({
      questionId,
      knowledgePointId: kpId,
      wrongCount: 1,
      firstWrongAt: now,
      lastWrongAt: now,
      resolved: false,
      nextRetryAt,
    });
  }
}
