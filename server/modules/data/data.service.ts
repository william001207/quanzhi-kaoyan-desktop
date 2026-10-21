import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../../database/local-db';

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
}
