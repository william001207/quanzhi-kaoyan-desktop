import { Inject, Injectable, Logger } from '@nestjs/common';
import { ilike, or, inArray, eq, sql } from 'drizzle-orm';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '../../platform';
import type {
  SearchResult,
  KnowledgePointBrief,
  ChapterPathNode,
  KnowledgePointChapterPaths,
  SearchQuestion,
  Chapter,
} from '../../shared/api.interface';
import {
  knowledgePoint,
  chapter,
  syllabusItem,
  examQuestion,
  wrongQuestion,
  knowledgePointTextbookChapter,
} from '../../database/schema';

const KP_LIMIT = 8;
const CHAPTER_LIMIT = 6;
const SYLLABUS_LIMIT = 5;
const QUESTION_LIMIT = 6;
const WRONG_QUESTION_LIMIT = 5;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async search(q: string): Promise<SearchResult> {
    const trimmed = q?.trim();
    if (!trimmed || trimmed.length < 2) {
      return {
        knowledgePoints: [],
        examChapters: [],
        textbookChapters: [],
        syllabus: [],
        questions: [],
      };
    }
    const keyword = `%${trimmed}%`;
    const lowerKw = trimmed.toLowerCase();

    try {
      const [kpRows, examChapterRows, textbookChapterRows, syllabusRows, questionRows, wrongQuestionRows] =
        await Promise.all([
          this.db
            .select({
              id: knowledgePoint.id,
              title: knowledgePoint.title,
              masteryScore: knowledgePoint.masteryScore,
              chapterId: knowledgePoint.chapterId,
            })
            .from(knowledgePoint)
            .where(
              or(
                ilike(knowledgePoint.title, keyword),
                ilike(knowledgePoint.summary, keyword),
              ),
            )
            .limit(KP_LIMIT),
          this.db
            .select({
              id: chapter.id,
              subjectId: chapter.subjectId,
              parentChapterId: chapter.parentChapterId,
              title: chapter.title,
              sortOrder: chapter.sortOrder,
              level: chapter.level,
              source: chapter.source,
            })
            .from(chapter)
            .where(
              and2(
                eq(chapter.source, 'exam_syllabus'),
                ilike(chapter.title, keyword),
              ),
            )
            .limit(CHAPTER_LIMIT),
          this.db
            .select({
              id: chapter.id,
              subjectId: chapter.subjectId,
              parentChapterId: chapter.parentChapterId,
              title: chapter.title,
              sortOrder: chapter.sortOrder,
              level: chapter.level,
              source: chapter.source,
            })
            .from(chapter)
            .where(
              and2(
                eq(chapter.source, 'textbook'),
                ilike(chapter.title, keyword),
              ),
            )
            .limit(CHAPTER_LIMIT),
          this.db
            .select({
              id: syllabusItem.id,
              subjectId: syllabusItem.subjectId,
              chapterId: syllabusItem.chapterId,
              title: syllabusItem.title,
              requirementLevel: syllabusItem.requirementLevel,
              source: syllabusItem.source,
            })
            .from(syllabusItem)
            .where(ilike(syllabusItem.title, keyword))
            .limit(SYLLABUS_LIMIT),
          this.db
            .select({
              id: examQuestion.id,
              year: examQuestion.year,
              questionType: examQuestion.questionType,
              questionText: examQuestion.questionText,
              source: examQuestion.source,
            })
            .from(examQuestion)
            .where(
              or(
                ilike(examQuestion.questionText, keyword),
                ilike(examQuestion.answer, keyword),
              ),
            )
            .limit(QUESTION_LIMIT),
          this.db
            .select({
              id: wrongQuestion.id,
              questionId: wrongQuestion.questionId,
              questionText: examQuestion.questionText,
              year: examQuestion.year,
              wrongCount: wrongQuestion.wrongCount,
              resolved: wrongQuestion.resolved,
            })
            .from(wrongQuestion)
            .innerJoin(examQuestion, eq(wrongQuestion.questionId, examQuestion.id))
            .where(ilike(examQuestion.questionText, keyword))
            .limit(WRONG_QUESTION_LIMIT),
        ]);

      const kpIds = kpRows.map((r) => r.id);
      const chapterPathsMap = kpIds.length > 0
        ? await this.buildChapterPathsMap(kpRows)
        : new Map<string, KnowledgePointChapterPaths>();

      const examChapters: Chapter[] = examChapterRows.map((row) => ({
        id: row.id,
        subjectId: row.subjectId,
        parentChapterId: row.parentChapterId,
        title: row.title,
        sortOrder: row.sortOrder,
        level: row.level,
        source: 'exam_syllabus',
      }));

      const textbookChapters: Chapter[] = textbookChapterRows.map((row) => ({
        id: row.id,
        subjectId: row.subjectId,
        parentChapterId: row.parentChapterId,
        title: row.title,
        sortOrder: row.sortOrder,
        level: row.level,
        source: 'textbook',
      }));

      const uniqueQuestions = dedupeById(
        [...questionRows, ...wrongQuestionRows.map((wq) => ({
          id: wq.questionId,
          year: wq.year,
          questionType: 'short_answer' as const,
          questionText: wq.questionText,
          source: null as string | null,
        }))],
      );

      return {
        knowledgePoints: kpRows.map(
          (row): KnowledgePointBrief => ({
            id: row.id,
            title: row.title,
            masteryScore: row.masteryScore,
            chapterPaths: chapterPathsMap.get(row.id),
          }),
        ),
        examChapters,
        textbookChapters,
        syllabus: syllabusRows.map((row) => ({
          id: row.id,
          subjectId: row.subjectId,
          chapterId: row.chapterId,
          title: row.title,
          originalText: null,
          requirementLevel: row.requirementLevel as any,
          source: row.source,
          sortOrder: 0,
        })),
        questions: uniqueQuestions.slice(0, QUESTION_LIMIT).map((row) => ({
          id: row.id,
          year: row.year,
          questionType: row.questionType as any,
          questionText: row.questionText,
          source: row.source,
        })),
      };
    } catch (err) {
      this.logger.error(`搜索失败 q=${trimmed}`, err instanceof Error ? err.stack : String(err));
      throw err;
    }
  }

  private async buildChapterPathsMap(
    kpRows: Array<{ id: string; chapterId: string }>,
  ): Promise<Map<string, KnowledgePointChapterPaths>> {
    const result = new Map<string, KnowledgePointChapterPaths>();
    for (const r of kpRows) {
      result.set(r.id, { examSyllabus: [], textbook: [] });
    }

    const kpIds = kpRows.map((r) => r.id);
    const examChapterIds = kpRows.map((r) => r.chapterId);

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

    const tbChapterIds = [...kpTbMap.values()];
    const allChapterIds = [...new Set([...examChapterIds, ...tbChapterIds])];
    const pathMap = await this.buildChapterPathMap(allChapterIds);

    for (const r of kpRows) {
      const existing = result.get(r.id);
      if (existing) {
        existing.examSyllabus = pathMap.get(r.chapterId) ?? [];
      }
    }
    for (const [kpId, tbChId] of kpTbMap) {
      const existing = result.get(kpId);
      if (existing) {
        existing.textbook = pathMap.get(tbChId) ?? [];
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
    const nodeMap = new Map<
      string,
      { id: string; title: string; level: number; parentChapterId: string | null }
    >();
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

function and2(a: any, b: any) {
  return sql`${a} AND ${b}`;
}

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of arr) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
