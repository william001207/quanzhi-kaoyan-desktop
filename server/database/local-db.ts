/* eslint-disable */
/**
 * 本地嵌入式数据库（PGlite / WASM PostgreSQL）单例
 * - 数据目录：env.DB_DIR（Electron userData 下），未设置时用内存库（开发/测试）
 * - 首次启动：执行 schema.sql 建表 + 从 data-export/ JSON 导入全量数据
 * - 结果归一化：包装 PGlite instance.query，把 {rows,rowCount,command} 归一化为
 *   「rows 数组 + 挂载不可枚举 rows/rowCount/command/fields 属性」，兼容 postgres-js
 *   风格的服务层消费（for-of / rows.map / rows[0] / result.rowCount）
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

import * as schema from './schema';

let instance: PGlite | null = null;
let drizzleDb: PgliteDatabase<typeof schema> | null = null;

function normalizeQuery(rawQuery: any) {
  return async (query: any, params?: any, options?: any) => {
    const res = await rawQuery(query, params, options);
    if (res && Array.isArray(res.rows)) {
      const rows: any[] = res.rows;
      Object.defineProperties(rows, {
        rows: { value: rows, enumerable: false },
        rowCount: { value: res.rowCount ?? rows.length, enumerable: false },
        command: { value: res.command ?? '', enumerable: false },
        fields: { value: res.fields ?? [], enumerable: false },
      });
      return rows;
    }
    return res;
  };
}

export async function getDb(): Promise<PGlite> {
  if (instance) return instance;
  const dataDir = process.env.DB_DIR
    ? path.join(process.env.DB_DIR, 'pglite')
    : undefined;
  instance = dataDir ? new PGlite(dataDir) : new PGlite();
  const rawQuery = (instance as any).query.bind(instance);
  (instance as any).query = normalizeQuery(rawQuery);
  await instance.waitReady;
  await ensureSchemaAndData(instance);
  return instance;
}

export function getDrizzle(): PgliteDatabase<typeof schema> {
  if (!drizzleDb) {
    if (!instance) throw new Error('PGlite 未初始化，请先调用 getDb()');
    drizzleDb = drizzle(instance, { schema });
  }
  return drizzleDb;
}

let initPromise: Promise<void> | null = null;
export function initializeDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await getDb();
      getDrizzle();
    })();
  }
  return initPromise;
}

// 数据内容版本：线上题库内容（知识点卡片/题目等）有更新时递增。
// 客户端检测到版本变化后执行增量内容同步（只更新内容字段，保留用户学习进度）。
const DATA_VERSION = '2026-10-22.2'; // 知识点界面编辑 + 6 处「𬌗」损坏修复 + 用户 16 处真题勘误 + 删除错误知识点「牙眼瘤」(f2547815) + 批量「牙眼→牙龈」「眼炎→牙龈炎」「间晾→间隙」「翼下领→翼下颌」错字修正

async function ensureSchemaAndData(db: PGlite): Promise<void> {
  const schemaSql = await fs.readFile(
    path.join(__dirname, '..', '..', 'database', 'schema.sql'),
    'utf-8',
  );
  await db.exec(schemaSql);

  // 修补历史建表脚本漏掉的列。
  // exam_paper 早期版本缺少 _created_by，而代码里定义了这个字段，
  // 查询时会报 column "_created_by" does not exist（表现为试卷相关接口全部 500）。
  // 用 IF NOT EXISTS 保证幂等，老库新库都能安全执行。
  try {
    await db.exec(
      'ALTER TABLE exam_paper ADD COLUMN IF NOT EXISTS _created_by user_profile;',
    );
  } catch (e) {
    console.warn('[local-db] 补列失败（可忽略）：', (e as Error).message);
  }

  // 已导入过则跳过（幂等）
  const res: any = await db.query('SELECT count(*)::int AS n FROM subject');
  const n = Number(res.rows?.[0]?.n ?? res[0]?.n ?? 0);
  if (n === 0) {
    await importData(db);
    await setDataVersion(db);
    return;
  }

  // 已有数据：比较数据版本，不一致时执行增量内容同步
  const vr: any = await db.query(
    `SELECT value FROM app_meta WHERE key = 'data_version'`,
  );
  const version = vr.rows?.[0]?.value ?? null;
  if (version !== DATA_VERSION) {
    console.log(`[local-db] 检测到数据版本变化（${version ?? '旧版'} → ${DATA_VERSION}），执行增量内容同步…`);
    await syncBusinessContent(db);
    await setDataVersion(db);
    console.log('[local-db] 增量内容同步完成');
  }
}

/**
 * 从指定目录执行一次内容同步（供设置页「导入内容数据」使用）。
 * 复用启动时的增量同步逻辑：只更新/补充内容字段，不触碰用户学习进度。
 * 通过临时切换 DATA_DIR 让 readJson 指向导入目录，结束后还原。
 */
export async function syncContentFromDir(dir: string): Promise<void> {
  const db = await getDb();
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    await syncBusinessContent(db);
  } finally {
    if (prev === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prev;
  }
}

async function setDataVersion(db: PGlite): Promise<void> {
  await db.query(
    `INSERT INTO app_meta (key, value) VALUES ('data_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [DATA_VERSION],
  );
}

// ---------------- 数据导入 ----------------

const json = (name: string) =>
  path.join(
    process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data-export'),
    name,
  );

const readJson = async (name: string) => {
  const raw = await fs.readFile(json(name), 'utf-8');
  return JSON.parse(raw);
};

const iso = (v: any): string | null =>
  v == null || v === '' ? null : v instanceof Date ? v.toISOString() : String(v);

async function importData(db: PGlite) {
  // 1. subjects
  const subjects = await readJson('subjects.json');
  for (const s of subjects) {
    await db.query(
      `INSERT INTO subject (id, name, sort_order, total_knowledge_points) VALUES ($1,$2,$3,$4)`,
      [s.id, s.name, s.sortOrder ?? 0, s.totalKnowledgePoints ?? 0],
    );
  }

  // 2. chapters（展平树，保留父子链）
  const chapterTrees = await readJson('chapter_trees.json');
  const chapterSeen = new Set<string>();
  const chapterRows: any[] = [];
  const walk = (node: any, parent: string | null) => {
    if (chapterSeen.has(node.id)) return;
    chapterSeen.add(node.id);
    chapterRows.push({
      id: node.id,
      subjectId: node.subjectId,
      parentChapterId: parent ?? node.parentChapterId ?? null,
      title: node.title,
      sortOrder: node.sortOrder ?? 0,
      level: node.level ?? 1,
      source: node.source ?? 'exam_syllabus',
    });
    for (const c of node.children ?? []) walk(c, node.id);
  };
  for (const [key, tree] of Object.entries(chapterTrees)) {
    const arr = Array.isArray(tree) ? tree : [tree];
    for (const root of arr) walk(root, root.parentChapterId ?? null);
  }
  for (const c of chapterRows) {
    await db.query(
      `INSERT INTO chapter (id, subject_id, parent_chapter_id, title, sort_order, level, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, c.subjectId, c.parentChapterId, c.title, c.sortOrder, c.level, c.source],
    );
  }

  // 3. knowledge points + syllabus items
  const kpList = await buildKpList();
  const syllabusSeen = new Set<string>();
  for (const kp of kpList) {
    const si = kp.syllabusItem;
    if (si && si.id && !syllabusSeen.has(si.id)) {
      syllabusSeen.add(si.id);
      await db.query(
        `INSERT INTO syllabus_item (id, subject_id, chapter_id, title, original_text, requirement_level, source, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [si.id, si.subjectId, si.chapterId, si.title, si.originalText ?? null, si.requirementLevel ?? 'unmarked', si.source ?? null, si.sortOrder ?? 0],
      );
    }
    await db.query(
      `INSERT INTO knowledge_point (
         id, subject_id, chapter_id, syllabus_item_id, title, content, summary, keywords,
         requirement_level, importance_score, exam_frequency, mastery_score, status,
         first_learned_at, last_reviewed_at, next_review_at, review_stage,
         consecutive_correct, consecutive_wrong, total_review_count, total_question_count,
         correct_question_count, manually_pinned, card_data, is_weak_marked, weak_marked_at,
         weak_mark_reason, recall_mastery, question_mastery, answered_question_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       ON CONFLICT (id) DO NOTHING`,
      [
        kp.id, kp.subjectId, kp.chapterId, kp.syllabusItemId ?? null, kp.title,
        kp.content ?? null, kp.summary ?? null, kp.keywords ?? [],
        kp.requirementLevel ?? 'unmarked', kp.importanceScore ?? 0, kp.examFrequency ?? 0,
        kp.masteryScore ?? 0, kp.status ?? 'not_started',
        iso(kp.firstLearnedAt), iso(kp.lastReviewedAt), iso(kp.nextReviewAt),
        kp.reviewStage ?? 0, kp.consecutiveCorrect ?? 0, kp.consecutiveWrong ?? 0,
        kp.totalReviewCount ?? 0, kp.totalQuestionCount ?? 0, kp.correctQuestionCount ?? 0,
        kp.manuallyPinned ?? false, kp.cardData ?? {}, kp.isWeakMarked ?? false,
        iso(kp.weakMarkedAt), kp.weakMarkReason ?? null, kp.recallMastery ?? 0,
        kp.questionMastery ?? 0, kp.answeredQuestionCount ?? 0,
      ],
    );

    // knowledge_point_textbook_chapter：从 chapterPaths.textbook 取每条路径的最深节点
    const tb = kp.chapterPaths?.textbook;
    if (Array.isArray(tb) && tb.length) {
      // 按 level==1 切分路径
      let curPath: any[] = [];
      const paths: any[][] = [];
      for (const node of tb) {
        if (node.level === 1) {
          if (curPath.length) paths.push(curPath);
          curPath = [node];
        } else {
          curPath.push(node);
        }
      }
      if (curPath.length) paths.push(curPath);
      for (const p of paths) {
        const leaf = p[p.length - 1];
        if (!leaf?.id) continue;
        await db.query(
          `INSERT INTO knowledge_point_textbook_chapter (knowledge_point_id, chapter_id, is_primary)
           VALUES ($1,$2,true) ON CONFLICT DO NOTHING`,
          [kp.id, leaf.id],
        );
      }
    }
  }

  // 4. exam questions + question_knowledge_point
  const eqDetails = await readJson('exam_question_details.json');
  const eqList = Object.values(eqDetails) as any[];
  for (const q of eqList) {
    await db.query(
      `INSERT INTO exam_question (
         id, year, subject_id, question_type, question_text, answer, answer_keywords,
         source, notes, difficulty, card_data, mastery_score, answered, answer_count, last_answered_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO NOTHING`,
      [
        q.id, q.year, q.subjectId, q.questionType ?? 'other', q.questionText,
        q.answer ?? null, q.answerKeywords ?? [], q.source ?? null, q.notes ?? null,
        q.difficulty ?? 2, q.cardData ?? {}, q.masteryScore ?? 0, q.answered ?? false,
        q.answerCount ?? 0, iso(q.lastAnsweredAt),
      ],
    );
    for (const kp of q.knowledgePoints ?? []) {
      if (!kp?.id) continue;
      await db.query(
        `INSERT INTO question_knowledge_point (question_id, knowledge_point_id, relevance, is_primary)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [q.id, kp.id, kp.relevance ?? 5, kp.isPrimary ?? false],
      );
    }
  }

  // 5. settings
  const settings = await readJson('settings.json');
  if (settings && settings.id) {
    await db.query(
      `INSERT INTO user_setting (id, exam_date, daily_minutes, exam_mode,
         weight_syllabus, weight_exam_freq, weight_mastery, weight_forgetting, weight_wrong, weight_overdue,
         daily_kp_config, daily_question_config, mock_exam_score_config,
         kp_weight_syllabus, kp_weight_exam_freq, kp_weight_mastery, kp_weight_forgetting, kp_weight_wrong, kp_weight_overdue,
         q_weight_exam_freq, q_weight_mastery, q_weight_wrong, q_weight_overdue, q_weight_difficulty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO NOTHING`,
      [
        settings.id, settings.examDate ?? null, settings.dailyMinutes ?? 300,
        settings.examMode ?? false,
        settings.weightSyllabus ?? 30, settings.weightExamFreq ?? 20, settings.weightMastery ?? 20,
        settings.weightForgetting ?? 15, settings.weightWrong ?? 10, settings.weightOverdue ?? 5,
        settings.dailyKpConfig ?? {}, settings.dailyQuestionConfig ?? {}, settings.mockExamScoreConfig ?? {},
        settings.kpWeightSyllabus ?? 30, settings.kpWeightExamFreq ?? 20, settings.kpWeightMastery ?? 20,
        settings.kpWeightForgetting ?? 15, settings.kpWeightWrong ?? 10, settings.kpWeightOverdue ?? 5,
        settings.qWeightExamFreq ?? 30, settings.qWeightMastery ?? 25, settings.qWeightWrong ?? 20,
        settings.qWeightOverdue ?? 10, settings.qWeightDifficulty ?? 15,
      ],
    );
  }

  // 6. daily plan
  const plan = await readJson('daily_plan_today.json');
  if (plan && plan.id) {
    await db.query(
      `INSERT INTO daily_plan (id, plan_date, generated_at, status, total_estimated_minutes,
         completed_minutes, total_items, completed_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [plan.id, plan.planDate, iso(plan.generatedAt) ?? new Date().toISOString(),
       plan.status ?? 'active', plan.totalEstimatedMinutes ?? 0, plan.completedMinutes ?? 0,
       plan.totalItems ?? 0, plan.completedItems ?? 0],
    );
    for (const it of plan.items ?? []) {
      await db.query(
        `INSERT INTO daily_plan_item (id, daily_plan_id, item_type, knowledge_point_id, question_id,
           priority_score, estimated_minutes, completed, completed_at, sort_order, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [it.id, plan.id, it.itemType, it.knowledgePointId ?? null, it.questionId ?? null,
         it.priorityScore ?? 0, it.estimatedMinutes ?? 15, it.completed ?? false,
         iso(it.completedAt), it.sortOrder ?? 0, it.reason ?? null],
      );
    }
  }

  // 7. mock exam template
  const mt = await readJson('mock_templates.json');
  const templates = Array.isArray(mt) ? mt : mt.items ?? [];
  for (const t of templates) {
    await db.query(
      `INSERT INTO exam_paper_template (id, name, subject_ids, source, year_start, year_end,
         question_types, question_counts, score_config, mode, _created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.name, t.subjectIds ?? [], t.source ?? null, t.yearStart ?? null, t.yearEnd ?? null,
       t.questionTypes ?? [], t.questionCounts ?? {}, t.scoreConfig ?? {}, t.mode ?? 'custom',
       iso(t.createdAt) ?? new Date().toISOString()],
    );
  }

  console.log(
    `[local-db] 数据导入完成: subjects=${subjects.length}, chapters=${chapterRows.length}, ` +
      `knowledge_points=${kpList.length}, questions=${eqList.length}, syllabus_items=${syllabusSeen.size}`,
  );
}

// 构建知识点全量列表：详情 + 真题引用补录（保证“题目-知识点”关联与外键完整）
async function buildKpList(): Promise<any[]> {
  const kpDetails = await readJson('knowledge_point_details.json');
  const kpList = Object.values(kpDetails) as any[];
  const knownIds = new Set<string>(kpList.map((k: any) => k.id));
  const questionDetails = await readJson('exam_question_details.json');
  for (const q of Object.values(questionDetails) as any[]) {
    for (const k of (q.knowledgePoints ?? []) as any[]) {
      const kid = k.knowledgePointId ?? k.id;
      if (kid && !knownIds.has(kid)) {
        knownIds.add(kid);
        kpList.push({
          id: kid,
          title: k.title ?? '未命名知识点',
          subjectId: k.subjectId ?? null,
          chapterId: k.chapterPaths?.examSyllabus?.[0]?.id ?? null,
          syllabusItemId: null,
          content: null,
          summary: null,
          keywords: [],
          requirementLevel: 'unmarked',
          importanceScore: 0,
          examFrequency: 0,
          masteryScore: k.masteryScore ?? 0,
          status: 'not_started',
          chapterPaths: k.chapterPaths ?? { examSyllabus: [], textbook: [] },
          isWeakMarked: false,
          recallMastery: 0,
          questionMastery: 0,
          answeredQuestionCount: 0,
        });
      }
    }
  }
  return kpList;
}

// ---------------- 增量内容同步（保留用户进度字段） ----------------
// 线上题库内容更新（如知识点卡片补齐）时：只 UPDATE 内容字段，不触碰
// mastery_score / status / review_* / wrong_question / review_record 等用户进度数据。
async function syncBusinessContent(db: PGlite) {
  // 1. subjects（名称/排序同步）
  const subjects = await readJson('subjects.json');
  for (const s of subjects) {
    await db.query(
      `UPDATE subject SET name=$2, sort_order=$3, total_knowledge_points=$4 WHERE id=$1`,
      [s.id, s.name, s.sortOrder ?? 0, s.totalKnowledgePoints ?? 0],
    );
  }

  // 2. chapters（仅补新章节，不动存量结构与用户数据）
  const chapterTrees = await readJson('chapter_trees.json');
  const chapterSeen = new Set<string>();
  const chapterRows: any[] = [];
  const walk = (node: any, parent: string | null) => {
    if (chapterSeen.has(node.id)) return;
    chapterSeen.add(node.id);
    chapterRows.push({
      id: node.id,
      subjectId: node.subjectId,
      parentChapterId: parent ?? node.parentChapterId ?? null,
      title: node.title,
      sortOrder: node.sortOrder ?? 0,
      level: node.level ?? 1,
      source: node.source ?? 'exam_syllabus',
    });
    for (const c of node.children ?? []) walk(c, node.id);
  };
  for (const [key, tree] of Object.entries(chapterTrees)) {
    const arr = Array.isArray(tree) ? tree : [tree];
    for (const root of arr) walk(root, root.parentChapterId ?? null);
  }
  for (const c of chapterRows) {
    await db.query(
      `INSERT INTO chapter (id, subject_id, parent_chapter_id, title, sort_order, level, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.subjectId, c.parentChapterId, c.title, c.sortOrder, c.level, c.source],
    );
  }

  // 3. syllabus_item + knowledge_point（内容字段同步，进度字段保留）
  const kpList = await buildKpList();
  const syllabusSeen = new Set<string>();
  for (const kp of kpList) {
    const si = kp.syllabusItem;
    if (si && si.id && !syllabusSeen.has(si.id)) {
      syllabusSeen.add(si.id);
      await db.query(
        `INSERT INTO syllabus_item (id, subject_id, chapter_id, title, original_text, requirement_level, source, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [si.id, si.subjectId, si.chapterId, si.title, si.originalText ?? null, si.requirementLevel ?? 'unmarked', si.source ?? null, si.sortOrder ?? 0],
      );
    }
    await db.query(
      `INSERT INTO knowledge_point (
         id, subject_id, chapter_id, syllabus_item_id, title, content, summary, keywords,
         requirement_level, importance_score, exam_frequency, mastery_score, status,
         first_learned_at, last_reviewed_at, next_review_at, review_stage,
         consecutive_correct, consecutive_wrong, total_review_count, total_question_count,
         correct_question_count, manually_pinned, card_data, is_weak_marked, weak_marked_at,
         weak_mark_reason, recall_mastery, question_mastery, answered_question_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       ON CONFLICT (id) DO UPDATE SET
         subject_id = EXCLUDED.subject_id, chapter_id = EXCLUDED.chapter_id,
         syllabus_item_id = EXCLUDED.syllabus_item_id, title = EXCLUDED.title,
         content = EXCLUDED.content, summary = EXCLUDED.summary, keywords = EXCLUDED.keywords,
         requirement_level = EXCLUDED.requirement_level,
         importance_score = EXCLUDED.importance_score, exam_frequency = EXCLUDED.exam_frequency,
         card_data = EXCLUDED.card_data
       -- 用户进度字段（mastery_score/status/review_*/manually_pinned/is_weak_marked 等）保留不动
       `,
      [
        kp.id, kp.subjectId, kp.chapterId, kp.syllabusItemId ?? null, kp.title,
        kp.content ?? null, kp.summary ?? null, kp.keywords ?? [],
        kp.requirementLevel ?? 'unmarked', kp.importanceScore ?? 0, kp.examFrequency ?? 0,
        kp.masteryScore ?? 0, kp.status ?? 'not_started',
        iso(kp.firstLearnedAt), iso(kp.lastReviewedAt), iso(kp.nextReviewAt),
        kp.reviewStage ?? 0, kp.consecutiveCorrect ?? 0, kp.consecutiveWrong ?? 0,
        kp.totalReviewCount ?? 0, kp.totalQuestionCount ?? 0, kp.correctQuestionCount ?? 0,
        kp.manuallyPinned ?? false, kp.cardData ?? {}, kp.isWeakMarked ?? false,
        iso(kp.weakMarkedAt), kp.weakMarkReason ?? null, kp.recallMastery ?? 0,
        kp.questionMastery ?? 0, kp.answeredQuestionCount ?? 0,
      ],
    );

    // knowledge_point_textbook_chapter：重建（纯内容关联，无用户状态）
    await db.query(
      `DELETE FROM knowledge_point_textbook_chapter WHERE knowledge_point_id = $1`,
      [kp.id],
    );
    const tb = kp.chapterPaths?.textbook;
    if (Array.isArray(tb) && tb.length) {
      let curPath: any[] = [];
      const paths: any[][] = [];
      for (const node of tb) {
        if (node.level === 1) {
          if (curPath.length) paths.push(curPath);
          curPath = [node];
        } else {
          curPath.push(node);
        }
      }
      if (curPath.length) paths.push(curPath);
      for (const p of paths) {
        const leaf = p[p.length - 1];
        if (!leaf?.id) continue;
        await db.query(
          `INSERT INTO knowledge_point_textbook_chapter (knowledge_point_id, chapter_id, is_primary)
           VALUES ($1,$2,true) ON CONFLICT DO NOTHING`,
          [kp.id, leaf.id],
        );
      }
    }
  }

  // 4. exam questions（内容字段同步，进度字段保留）+ question_knowledge_point 重建
  const eqDetails = await readJson('exam_question_details.json');
  const eqList = Object.values(eqDetails) as any[];
  for (const q of eqList) {
    await db.query(
      `INSERT INTO exam_question (
         id, year, subject_id, question_type, question_text, answer, answer_keywords,
         source, notes, difficulty, card_data, mastery_score, answered, answer_count, last_answered_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         year = EXCLUDED.year, subject_id = EXCLUDED.subject_id,
         question_type = EXCLUDED.question_type, question_text = EXCLUDED.question_text,
         answer = EXCLUDED.answer, answer_keywords = EXCLUDED.answer_keywords,
         source = EXCLUDED.source, notes = EXCLUDED.notes, difficulty = EXCLUDED.difficulty,
         card_data = EXCLUDED.card_data
       -- 用户刷题进度字段（mastery_score/answered/answer_count/last_answered_at）保留不动
       `,
      [
        q.id, q.year, q.subjectId, q.questionType ?? 'other', q.questionText,
        q.answer ?? null, q.answerKeywords ?? [], q.source ?? null, q.notes ?? null,
        q.difficulty ?? 2, q.cardData ?? {}, q.masteryScore ?? 0, q.answered ?? false,
        q.answerCount ?? 0, iso(q.lastAnsweredAt),
      ],
    );
    // question_knowledge_point：重建（纯关联，无用户状态）
    await db.query(`DELETE FROM question_knowledge_point WHERE question_id = $1`, [q.id]);
    for (const kp of q.knowledgePoints ?? []) {
      if (!kp?.id) continue;
      await db.query(
        `INSERT INTO question_knowledge_point (question_id, knowledge_point_id, relevance, is_primary)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [q.id, kp.id, kp.relevance ?? 5, kp.isPrimary ?? false],
      );
    }
  }

  // settings / daily plan / mock templates：用户数据或低频配置，保持不覆盖
  const settings = await readJson('settings.json');
  if (settings && settings.id) {
    await db.query(
      `INSERT INTO user_setting (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [settings.id],
    );
  }

  console.log(
    `[local-db] 内容同步完成: subjects=${subjects.length}, chapters=${chapterRows.length}, ` +
      `knowledge_points=${kpList.length}, questions=${eqList.length}`,
  );
}

/**
 * 关闭数据库连接。
 * 必须在进程退出前调用：PGlite 是跑在 WASM 里的 PostgreSQL，有自己的缓冲区和 WAL，
 * 直接杀进程不保证数据已落盘，可能丢掉最后几次写入。
 */
export async function closeDb(): Promise<void> {
  if (!instance) return;
  try {
    await instance.close();
    console.log('[local-db] 数据库已安全关闭');
  } catch (e) {
    console.error('[local-db] 关闭数据库时出错：', e);
  } finally {
    instance = null;
    drizzleDb = null;
    initPromise = null;
  }
}

// 兜底：供 Electron 主进程查询导入进度用
export async function getImportSummary() {
  const db = await getDb();
  const q = async (sql: string) => {
    const r: any = await db.query(sql);
    return Number(r.rows?.[0]?.n ?? r[0]?.n ?? 0);
  };
  return {
    subjects: await q('SELECT count(*)::int AS n FROM subject'),
    chapters: await q('SELECT count(*)::int AS n FROM chapter'),
    knowledgePoints: await q('SELECT count(*)::int AS n FROM knowledge_point'),
    questions: await q('SELECT count(*)::int AS n FROM exam_question'),
    syllabusItems: await q('SELECT count(*)::int AS n FROM syllabus_item'),
    wrongQuestions: await q('SELECT count(*)::int AS n FROM wrong_question'),
  };
}
