import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getDb, syncContentFromDir } from '../../database/local-db';

/**
 * 内容数据导出。
 *
 * 目的：把本地改过的题库/知识点/章节导出成 data-export 格式，
 * 覆盖回仓库后即成为下一版安装包的数据源（反向同步）。
 *
 * 只导出「内容」，不导出个人学习状态（掌握度、复习进度、做题记录等），
 * 避免把自己的学习数据当成公共内容发出去。
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  /** 导出目录：放在数据目录同级，方便用户找到（userData/export/） */
  private resolveExportDir(): string {
    const dbDir = process.env.DB_DIR;
    const base = dbDir ? path.dirname(dbDir) : process.cwd();
    return path.join(base, 'export');
  }

  async exportContent(): Promise<{
    dir: string;
    files: { name: string; size: number }[];
  }> {
    const db = await getDb();
    const dir = this.resolveExportDir();
    fs.mkdirSync(dir, { recursive: true });

    const files: { name: string; size: number }[] = [];
    const save = (name: string, data: unknown) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
      files.push({ name, size: fs.statSync(file).size });
      this.logger.log(`导出 ${name}（${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB）`);
    };

    // ---------- 1. 科目 ----------
    // total_knowledge_points 现场统计，避免存量库里的计数字段过期
    const subj = await db.query(
      `SELECT id, name, sort_order,
              (SELECT count(*)::int FROM knowledge_point kp WHERE kp.subject_id = subject.id) AS total_knowledge_points
       FROM subject ORDER BY sort_order, name`,
    );
    save(
      'subjects.json',
      subj.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        sortOrder: r.sort_order ?? 0,
        totalKnowledgePoints: r.total_knowledge_points ?? 0,
      })),
    );

    // ---------- 2. 章节树 ----------
    const chRows = await db.query(
      `SELECT id, subject_id, parent_chapter_id, title, sort_order, level, source
       FROM chapter ORDER BY level, sort_order, title`,
    );
    const nodeMap = new Map<string, any>();
    for (const r of chRows.rows as any[]) {
      nodeMap.set(r.id, {
        id: r.id,
        subjectId: r.subject_id,
        parentChapterId: r.parent_chapter_id ?? null,
        title: r.title,
        sortOrder: r.sort_order ?? 0,
        level: r.level ?? 1,
        source: r.source ?? 'exam_syllabus',
        children: [],
      });
    }
    const roots: any[] = [];
    for (const node of nodeMap.values()) {
      const parent = node.parentChapterId ? nodeMap.get(node.parentChapterId) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    // 按 "科目:来源" 分组，与 data-export 的 key 形式一致
    const trees: Record<string, any[]> = {};
    for (const root of roots) {
      const key = `${root.subjectId}:${root.source}`;
      (trees[key] ??= []).push(root);
    }
    save('chapter_trees.json', trees);

    // ---------- 3. 知识点（含所属大纲条目） ----------
    const kpRows = await db.query(
      `SELECT kp.*,
              si.id AS si_id, si.title AS si_title, si.original_text AS si_original_text,
              si.requirement_level AS si_requirement_level, si.source AS si_source,
              si.sort_order AS si_sort_order, si.subject_id AS si_subject_id,
              si.chapter_id AS si_chapter_id
       FROM knowledge_point kp
       LEFT JOIN syllabus_item si ON si.id = kp.syllabus_item_id
       ORDER BY kp.subject_id, kp.chapter_id, kp.title`,
    );
    // 教材章节关联 → 重建 chapterPaths.textbook
    // 导入时按 level===1 切分路径，所以这里对每条路径从根到叶依次追加
    const kptc = await db.query(
      'SELECT knowledge_point_id, chapter_id FROM knowledge_point_textbook_chapter',
    );
    const chAll = await db.query(
      'SELECT id, parent_chapter_id, title, level FROM chapter',
    );
    const chInfo = new Map<string, any>(
      (chAll.rows as any[]).map((r) => [r.id, r]),
    );
    const buildChapterPath = (chapterId: string): any[] => {
      const nodes: any[] = [];
      let cur = chInfo.get(chapterId);
      let guard = 0;
      while (cur && guard++ < 50) {
        nodes.unshift({ id: cur.id, level: cur.level ?? 1, title: cur.title });
        cur = cur.parent_chapter_id ? chInfo.get(cur.parent_chapter_id) : null;
      }
      return nodes;
    };
    const kpTextbookPath = new Map<string, any[]>();
    for (const r of kptc.rows as any[]) {
      const p = buildChapterPath(r.chapter_id);
      if (!p.length) continue;
      const list = kpTextbookPath.get(r.knowledge_point_id) ?? [];
      list.push(...p);
      kpTextbookPath.set(r.knowledge_point_id, list);
    }

    const kpDetails: Record<string, any> = {};
    for (const r of kpRows.rows as any[]) {
      kpDetails[r.id] = {
        id: r.id,
        subjectId: r.subject_id,
        chapterId: r.chapter_id,
        syllabusItemId: r.syllabus_item_id ?? null,
        title: r.title,
        content: r.content ?? null,
        summary: r.summary ?? null,
        keywords: r.keywords ?? [],
        requirementLevel: r.requirement_level ?? 'unmarked',
        importanceScore: r.importance_score ?? 0,
        examFrequency: r.exam_frequency ?? 0,
        cardData: r.card_data ?? {},
        chapterPaths: { textbook: kpTextbookPath.get(r.id) ?? [] },
        syllabusItem: r.si_id
          ? {
              id: r.si_id,
              subjectId: r.si_subject_id,
              chapterId: r.si_chapter_id,
              title: r.si_title,
              originalText: r.si_original_text ?? null,
              requirementLevel: r.si_requirement_level ?? 'unmarked',
              source: r.si_source ?? null,
              sortOrder: r.si_sort_order ?? 0,
            }
          : null,
      };
    }
    save('knowledge_point_details.json', kpDetails);

    // ---------- 4. 题目（含知识点关联） ----------
    const qRows = await db.query(
      `SELECT id, year, subject_id, question_type, question_text, answer, answer_keywords,
              source, notes, difficulty, card_data
       FROM exam_question ORDER BY year DESC, id`,
    );
    const qkp = await db.query(
      'SELECT question_id, knowledge_point_id, relevance, is_primary FROM question_knowledge_point',
    );
    const kpByQuestion = new Map<string, any[]>();
    for (const r of qkp.rows as any[]) {
      const list = kpByQuestion.get(r.question_id) ?? [];
      list.push({
        id: r.knowledge_point_id,
        relevance: r.relevance ?? 5,
        isPrimary: r.is_primary ?? false,
      });
      kpByQuestion.set(r.question_id, list);
    }
    const qDetails: Record<string, any> = {};
    for (const r of qRows.rows as any[]) {
      qDetails[r.id] = {
        id: r.id,
        year: r.year,
        subjectId: r.subject_id,
        questionType: r.question_type ?? 'other',
        questionText: r.question_text,
        answer: r.answer ?? null,
        answerKeywords: r.answer_keywords ?? [],
        source: r.source ?? null,
        notes: r.notes ?? null,
        difficulty: r.difficulty ?? 2,
        cardData: r.card_data ?? {},
        knowledgePoints: kpByQuestion.get(r.id) ?? [],
      };
    }
    save('exam_question_details.json', qDetails);

    // 汇总信息，供前端展示
    this.logger.log(`导出完成：${files.length} 个文件 → ${dir}`);
    return { dir, files };
  }

  // ==================================================
  // 学习数据：导出 / 导入（跨设备迁移与备份）
  // ==================================================

  /**
   * 汇总当前库里的全部学习数据（个人进度，不含题库内容本身）。
   * 同时供「导出学习数据」与「导入前自动备份」复用。
   */
  private async buildLearningData(): Promise<Record<string, any>> {
    const db = await getDb();
    const q = (sql: string) => db.query(sql);

    // 知识点进度字段（内容字段不导出，题库以内容数据为准）
    const kpRows = (await q(
      `SELECT id, mastery_score, status, first_learned_at, last_reviewed_at, next_review_at,
              review_stage, consecutive_correct, consecutive_wrong, total_review_count,
              total_question_count, correct_question_count, manually_pinned,
              is_weak_marked, weak_marked_at, weak_mark_reason,
              recall_mastery, question_mastery, answered_question_count
       FROM knowledge_point`,
    )).rows as any[];
    const knowledgePoints: Record<string, any> = {};
    for (const r of kpRows) {
      knowledgePoints[r.id] = {
        masteryScore: r.mastery_score ?? 0,
        status: r.status ?? 'not_started',
        firstLearnedAt: r.first_learned_at ?? null,
        lastReviewedAt: r.last_reviewed_at ?? null,
        nextReviewAt: r.next_review_at ?? null,
        reviewStage: r.review_stage ?? 0,
        consecutiveCorrect: r.consecutive_correct ?? 0,
        consecutiveWrong: r.consecutive_wrong ?? 0,
        totalReviewCount: r.total_review_count ?? 0,
        totalQuestionCount: r.total_question_count ?? 0,
        correctQuestionCount: r.correct_question_count ?? 0,
        manuallyPinned: r.manually_pinned ?? false,
        isWeakMarked: r.is_weak_marked ?? false,
        weakMarkedAt: r.weak_marked_at ?? null,
        weakMarkReason: r.weak_mark_reason ?? null,
        recallMastery: r.recall_mastery ?? 0,
        questionMastery: r.question_mastery ?? 0,
        answeredQuestionCount: r.answered_question_count ?? 0,
      };
    }

    // 题目作答进度
    const qRows = (await q(
      `SELECT id, mastery_score, answered, answer_count, last_answered_at FROM exam_question`,
    )).rows as any[];
    const questions: Record<string, any> = {};
    for (const r of qRows) {
      questions[r.id] = {
        masteryScore: r.mastery_score ?? 0,
        answered: r.answered ?? false,
        answerCount: r.answer_count ?? 0,
        lastAnsweredAt: r.last_answered_at ?? null,
      };
    }

    const wrongQuestions = (await q(
      `SELECT id, question_id, knowledge_point_id, first_wrong_at, last_wrong_at,
              wrong_count, resolved, next_retry_at, user_answer, mistake_reason, error_tags
       FROM wrong_question`,
    )).rows;

    const reviewRecords = (await q(
      `SELECT id, knowledge_point_id, question_id, reviewed_at, self_rating,
              recall_score, question_score, old_mastery_score, new_mastery_score,
              old_review_stage, new_review_stage, next_review_at, review_type, notes, user_answer
       FROM review_record`,
    )).rows;

    const studySessions = (await q(
      `SELECT id, knowledge_point_id, question_id, session_type, started_at,
              completed_at, duration_minutes, result, notes
       FROM study_session`,
    )).rows;

    const dailyPlans = (await q(
      `SELECT id, plan_date, generated_at, status, total_estimated_minutes,
              completed_minutes, total_items, completed_items
       FROM daily_plan`,
    )).rows;
    const dailyPlanItems = (await q(
      `SELECT id, daily_plan_id, item_type, knowledge_point_id, question_id,
              priority_score, estimated_minutes, completed, completed_at, sort_order, reason
       FROM daily_plan_item`,
    )).rows;

    const examPapers = (await q(
      `SELECT id, title, mode, subject_ids, source, year_start, year_end, question_types,
              question_counts, total_score, estimated_minutes, question_ids, score_config, _created_at
       FROM exam_paper`,
    )).rows;

    const examPaperTemplates = (await q(
      `SELECT id, name, subject_ids, source, year_start, year_end, question_types,
              question_counts, score_config, mode
       FROM exam_paper_template`,
    )).rows;

    const examRecords = (await q(
      `SELECT id, paper_id, title, total_score, earned_score, total_questions,
              started_at, submitted_at, total_duration_seconds, status,
              answers, self_ratings, scores, added_to_wrong
       FROM exam_record`,
    )).rows;

    const settings =
      ((await q(
        `SELECT id, exam_date, daily_minutes, exam_mode,
                weight_syllabus, weight_exam_freq, weight_mastery, weight_forgetting,
                weight_wrong, weight_overdue, daily_kp_config, daily_question_config,
                mock_exam_score_config, kp_weight_syllabus, kp_weight_exam_freq,
                kp_weight_mastery, kp_weight_forgetting, kp_weight_wrong, kp_weight_overdue,
                q_weight_exam_freq, q_weight_mastery, q_weight_wrong, q_weight_overdue,
                q_weight_difficulty
         FROM user_setting LIMIT 1`,
      )).rows as any[])[0] ?? null;

    const dv = (await q(
      `SELECT value FROM app_meta WHERE key='data_version'`,
    )).rows as any[];

    return {
      kind: 'quanzhi-learning-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      contentDataVersion: dv[0]?.value ?? null,
      knowledgePoints,
      questions,
      wrongQuestions,
      reviewRecords,
      studySessions,
      dailyPlans,
      dailyPlanItems,
      examPapers,
      examPaperTemplates,
      examRecords,
      settings,
    };
  }

  /** 导出学习数据：写入 export 目录，同时把内容返回给前端触发浏览器下载 */
  async exportLearning(): Promise<{
    fileName: string;
    path: string;
    size: number;
    counts: Record<string, number>;
    data: Record<string, any>;
  }> {
    const data = await this.buildLearningData();
    const dir = this.resolveExportDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14);
    const fileName = `learning-data-${stamp}.json`;
    const file = path.join(dir, fileName);
    fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
    const size = fs.statSync(file).size;
    this.logger.log(`学习数据已导出：${file}（${(size / 1024).toFixed(0)} KB）`);
    return {
      fileName,
      path: file,
      size,
      counts: this.learningCounts(data),
      data,
    };
  }

  private learningCounts(d: Record<string, any>): Record<string, number> {
    return {
      knowledgePoints: Object.keys(d.knowledgePoints ?? {}).length,
      questions: Object.keys(d.questions ?? {}).length,
      wrongQuestions: (d.wrongQuestions ?? []).length,
      reviewRecords: (d.reviewRecords ?? []).length,
      studySessions: (d.studySessions ?? []).length,
      dailyPlans: (d.dailyPlans ?? []).length,
      examPapers: (d.examPapers ?? []).length,
      examRecords: (d.examRecords ?? []).length,
    };
  }

  /**
   * 导入学习数据（合并模式：按 id 覆盖/补齐，不删除本机已有记录）。
   * 导入前自动把当前学习数据备份到 export 目录，防止误操作不可逆。
   */
  async importLearning(payload: Record<string, any>): Promise<{
    backupFile: string;
    applied: Record<string, number>;
    skipped: Record<string, number>;
  }> {
    if (!payload || payload.kind !== 'quanzhi-learning-data') {
      throw new BadRequestException('文件格式不正确：不是学习数据备份文件');
    }
    const db = await getDb();

    // 导入前自动备份当前学习数据
    const backup = await this.buildLearningData();
    const dir = this.resolveExportDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const backupFile = path.join(dir, `learning-data-backup-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup), 'utf-8');
    this.logger.log(`导入前备份已写入：${backupFile}`);

    const applied: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const iso = (v: any) => (v == null || v === '' ? null : String(v));

    // 1. 知识点进度（仅 UPDATE 已存在的知识点，id 对不上则跳过）
    let ok = 0, skip = 0;
    for (const [id, p] of Object.entries<any>(payload.knowledgePoints ?? {})) {
      const r: any = await db.query(
        `UPDATE knowledge_point SET
           mastery_score=$2, status=$3, first_learned_at=$4, last_reviewed_at=$5,
           next_review_at=$6, review_stage=$7, consecutive_correct=$8, consecutive_wrong=$9,
           total_review_count=$10, total_question_count=$11, correct_question_count=$12,
           manually_pinned=$13, is_weak_marked=$14, weak_marked_at=$15, weak_mark_reason=$16,
           recall_mastery=$17, question_mastery=$18, answered_question_count=$19
         WHERE id=$1 RETURNING id`,
        [
          id, p.masteryScore ?? 0, p.status ?? 'not_started', iso(p.firstLearnedAt),
          iso(p.lastReviewedAt), iso(p.nextReviewAt), p.reviewStage ?? 0,
          p.consecutiveCorrect ?? 0, p.consecutiveWrong ?? 0, p.totalReviewCount ?? 0,
          p.totalQuestionCount ?? 0, p.correctQuestionCount ?? 0, p.manuallyPinned ?? false,
          p.isWeakMarked ?? false, iso(p.weakMarkedAt), p.weakMarkReason ?? null,
          p.recallMastery ?? 0, p.questionMastery ?? 0, p.answeredQuestionCount ?? 0,
        ],
      );
      ((r as any[]).length ? ok++ : skip++);
    }
    applied.knowledgePoints = ok; skipped.knowledgePoints = skip;

    // 2. 题目作答进度
    ok = 0; skip = 0;
    for (const [id, p] of Object.entries<any>(payload.questions ?? {})) {
      const r: any = await db.query(
        `UPDATE exam_question SET mastery_score=$2, answered=$3, answer_count=$4, last_answered_at=$5
         WHERE id=$1 RETURNING id`,
        [id, p.masteryScore ?? 0, p.answered ?? false, p.answerCount ?? 0, iso(p.lastAnsweredAt)],
      );
      ((r as any[]).length ? ok++ : skip++);
    }
    applied.questions = ok; skipped.questions = skip;

    // 3. 记录类表：按 id 幂等补齐（已存在则不动）
    const insertRows = async (
      table: string, cols: string[], rows: any[], pick: (r: any) => any[],
    ) => {
      let a = 0, s = 0;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      for (const row of rows ?? []) {
        try {
          const r: any = await db.query(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})
             ON CONFLICT (id) DO NOTHING RETURNING id`,
            pick(row),
          );
          ((r as any[]).length ? a++ : s++);
        } catch {
          s++; // 例如 daily_plan.plan_date 唯一冲突，跳过
        }
      }
      applied[table] = a; skipped[table] = s;
    };

    await insertRows(
      'exam_paper',
      ['id', 'title', 'mode', 'subject_ids', 'source', 'year_start', 'year_end',
       'question_types', 'question_counts', 'total_score', 'estimated_minutes',
       'question_ids', 'score_config', '_created_at'],
      payload.examPapers,
      (r) => [r.id, r.title, r.mode ?? 'custom', r.subject_ids ?? [], r.source ?? null,
              r.year_start ?? null, r.year_end ?? null, r.question_types ?? [],
              r.question_counts ?? {}, r.total_score ?? 0, r.estimated_minutes ?? 0,
              r.question_ids ?? [], r.score_config ?? {}, iso(r._created_at) ?? new Date().toISOString()],
    );
    await insertRows(
      'exam_paper_template',
      ['id', 'name', 'subject_ids', 'source', 'year_start', 'year_end',
       'question_types', 'question_counts', 'score_config', 'mode'],
      payload.examPaperTemplates,
      (r) => [r.id, r.name, r.subject_ids ?? [], r.source ?? null, r.year_start ?? null,
              r.year_end ?? null, r.question_types ?? [], r.question_counts ?? {},
              r.score_config ?? {}, r.mode ?? 'custom'],
    );
    await insertRows(
      'exam_record',
      ['id', 'paper_id', 'title', 'total_score', 'earned_score', 'total_questions',
       'started_at', 'submitted_at', 'total_duration_seconds', 'status',
       'answers', 'self_ratings', 'scores', 'added_to_wrong'],
      payload.examRecords,
      (r) => [r.id, r.paper_id, r.title, r.total_score ?? 0, r.earned_score ?? 0,
              r.total_questions ?? 0, iso(r.started_at) ?? new Date().toISOString(),
              iso(r.submitted_at), r.total_duration_seconds ?? 0, r.status ?? 'in_progress',
              r.answers ?? {}, r.self_ratings ?? {}, r.scores ?? {}, r.added_to_wrong ?? {}],
    );
    await insertRows(
      'wrong_question',
      ['id', 'question_id', 'knowledge_point_id', 'first_wrong_at', 'last_wrong_at',
       'wrong_count', 'resolved', 'next_retry_at', 'user_answer', 'mistake_reason', 'error_tags'],
      payload.wrongQuestions,
      (r) => [r.id, r.question_id, r.knowledge_point_id ?? null,
              iso(r.first_wrong_at) ?? new Date().toISOString(),
              iso(r.last_wrong_at) ?? new Date().toISOString(), r.wrong_count ?? 1,
              r.resolved ?? false, iso(r.next_retry_at), r.user_answer ?? null,
              r.mistake_reason ?? null, r.error_tags ?? []],
    );
    await insertRows(
      'review_record',
      ['id', 'knowledge_point_id', 'question_id', 'reviewed_at', 'self_rating',
       'recall_score', 'question_score', 'old_mastery_score', 'new_mastery_score',
       'old_review_stage', 'new_review_stage', 'next_review_at', 'review_type', 'notes', 'user_answer'],
      payload.reviewRecords,
      (r) => [r.id, r.knowledge_point_id, r.question_id ?? null,
              iso(r.reviewed_at) ?? new Date().toISOString(), r.self_rating ?? 'again',
              r.recall_score ?? null, r.question_score ?? null, r.old_mastery_score ?? 0,
              r.new_mastery_score ?? 0, r.old_review_stage ?? 0, r.new_review_stage ?? 0,
              iso(r.next_review_at), r.review_type ?? 'review', r.notes ?? null, r.user_answer ?? null],
    );
    await insertRows(
      'study_session',
      ['id', 'knowledge_point_id', 'question_id', 'session_type', 'started_at',
       'completed_at', 'duration_minutes', 'result', 'notes'],
      payload.studySessions,
      (r) => [r.id, r.knowledge_point_id ?? null, r.question_id ?? null, r.session_type ?? 'review',
              iso(r.started_at) ?? new Date().toISOString(), iso(r.completed_at),
              r.duration_minutes ?? null, r.result ?? null, r.notes ?? null],
    );
    await insertRows(
      'daily_plan',
      ['id', 'plan_date', 'generated_at', 'status', 'total_estimated_minutes',
       'completed_minutes', 'total_items', 'completed_items'],
      payload.dailyPlans,
      (r) => [r.id, r.plan_date, iso(r.generated_at) ?? new Date().toISOString(),
              r.status ?? 'active', r.total_estimated_minutes ?? 0, r.completed_minutes ?? 0,
              r.total_items ?? 0, r.completed_items ?? 0],
    );
    await insertRows(
      'daily_plan_item',
      ['id', 'daily_plan_id', 'item_type', 'knowledge_point_id', 'question_id',
       'priority_score', 'estimated_minutes', 'completed', 'completed_at', 'sort_order', 'reason'],
      payload.dailyPlanItems,
      (r) => [r.id, r.daily_plan_id, r.item_type, r.knowledge_point_id ?? null,
              r.question_id ?? null, r.priority_score ?? 0, r.estimated_minutes ?? 15,
              r.completed ?? false, iso(r.completed_at), r.sort_order ?? 0, r.reason ?? null],
    );

    // 4. 设置（单行，按 id 覆盖，没有则插入）
    const st = payload.settings;
    if (st?.id) {
      await db.query(
        `INSERT INTO user_setting (id, exam_date, daily_minutes, exam_mode,
           weight_syllabus, weight_exam_freq, weight_mastery, weight_forgetting,
           weight_wrong, weight_overdue, daily_kp_config, daily_question_config,
           mock_exam_score_config, kp_weight_syllabus, kp_weight_exam_freq,
           kp_weight_mastery, kp_weight_forgetting, kp_weight_wrong, kp_weight_overdue,
           q_weight_exam_freq, q_weight_mastery, q_weight_wrong, q_weight_overdue,
           q_weight_difficulty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         ON CONFLICT (id) DO UPDATE SET
           exam_date=EXCLUDED.exam_date, daily_minutes=EXCLUDED.daily_minutes,
           exam_mode=EXCLUDED.exam_mode,
           weight_syllabus=EXCLUDED.weight_syllabus, weight_exam_freq=EXCLUDED.weight_exam_freq,
           weight_mastery=EXCLUDED.weight_mastery, weight_forgetting=EXCLUDED.weight_forgetting,
           weight_wrong=EXCLUDED.weight_wrong, weight_overdue=EXCLUDED.weight_overdue,
           daily_kp_config=EXCLUDED.daily_kp_config, daily_question_config=EXCLUDED.daily_question_config,
           mock_exam_score_config=EXCLUDED.mock_exam_score_config,
           kp_weight_syllabus=EXCLUDED.kp_weight_syllabus, kp_weight_exam_freq=EXCLUDED.kp_weight_exam_freq,
           kp_weight_mastery=EXCLUDED.kp_weight_mastery, kp_weight_forgetting=EXCLUDED.kp_weight_forgetting,
           kp_weight_wrong=EXCLUDED.kp_weight_wrong, kp_weight_overdue=EXCLUDED.kp_weight_overdue,
           q_weight_exam_freq=EXCLUDED.q_weight_exam_freq, q_weight_mastery=EXCLUDED.q_weight_mastery,
           q_weight_wrong=EXCLUDED.q_weight_wrong, q_weight_overdue=EXCLUDED.q_weight_overdue,
           q_weight_difficulty=EXCLUDED.q_weight_difficulty`,
        [st.id, iso(st.exam_date), st.daily_minutes ?? 300, st.exam_mode ?? false,
         st.weight_syllabus ?? 30, st.weight_exam_freq ?? 20, st.weight_mastery ?? 20,
         st.weight_forgetting ?? 15, st.weight_wrong ?? 10, st.weight_overdue ?? 5,
         st.daily_kp_config ?? {}, st.daily_question_config ?? {}, st.mock_exam_score_config ?? {},
         st.kp_weight_syllabus ?? 30, st.kp_weight_exam_freq ?? 20, st.kp_weight_mastery ?? 20,
         st.kp_weight_forgetting ?? 15, st.kp_weight_wrong ?? 10, st.kp_weight_overdue ?? 5,
         st.q_weight_exam_freq ?? 30, st.q_weight_mastery ?? 25, st.q_weight_wrong ?? 20,
         st.q_weight_overdue ?? 10, st.q_weight_difficulty ?? 15],
      );
      applied.settings = 1;
    }

    this.logger.log(`学习数据导入完成：${JSON.stringify(applied)}`);
    return { backupFile, applied, skipped };
  }

  // ==================================================
  // 内容数据：导入（与「导出内容数据」配对）
  // ==================================================

  /**
   * 导入内容数据：接收 4 个导出文件的内容，写入临时目录后复用启动时的增量同步逻辑。
   * 只更新/补充内容字段与关联，不触碰学习进度；同步完成后删除临时目录。
   */
  async importContent(files: Record<string, any>): Promise<{
    applied: Record<string, number>;
  }> {
    const required = [
      'subjects.json',
      'chapter_trees.json',
      'knowledge_point_details.json',
      'exam_question_details.json',
    ];
    for (const name of required) {
      if (!files?.[name]) throw new BadRequestException(`缺少文件：${name}`);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qzky-import-'));
    try {
      for (const name of required) {
        fs.writeFileSync(path.join(tmpDir, name), JSON.stringify(files[name]), 'utf-8');
      }
      // 同步逻辑还会读 settings.json（仅确保设置行存在），从内置快照复制一份。
      // 本文件编译后位于 dist/modules/data/，仓库快照在 server/data-export/，向上三级。
      const settingsSrc = path.join(__dirname, '..', '..', '..', 'data-export', 'settings.json');
      if (fs.existsSync(settingsSrc)) {
        fs.copyFileSync(settingsSrc, path.join(tmpDir, 'settings.json'));
      } else {
        fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{}', 'utf-8');
      }

      await syncContentFromDir(tmpDir);

      const kpCount = Object.keys(files['knowledge_point_details.json']).length;
      const qCount = Object.keys(files['exam_question_details.json']).length;
      this.logger.log(`内容数据导入完成：知识点 ${kpCount}，题目 ${qCount}`);
      return { applied: { knowledgePoints: kpCount, questions: qCount } };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
