import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '../../platform';
import {
  subject,
  chapter,
  syllabusItem,
  knowledgePoint,
  examQuestion,
  questionKnowledgePoint,
} from '../../database/schema';
import type {
  SyllabusPreview,
  QuestionPreview,
  ImportResult,
  RequirementLevel,
  QuestionType,
  UnmatchedKnowledgePointItem,
} from '../../shared/api.interface';
import {
  REQUIREMENT_LEVEL_LABEL,
  QUESTION_TYPE_LABEL,
} from '../../shared/api.interface';

interface SyllabusSubjectInput {
  subject: string;
  source?: string;
  chapters: SyllabusChapterInput[];
}

interface SyllabusChapterInput {
  title: string;
  items: SyllabusItemInput[];
}

interface SyllabusItemInput {
  title: string;
  requirementLevel?: string;
  originalText?: string;
}

interface QuestionYearInput {
  year: number;
  source?: string;
  questions: ExamQuestionInput[];
}

interface ExamQuestionInput {
  type: string;
  subject: string;
  question: string;
  answer?: string;
  answerKeywords?: string[];
  notes?: string;
  difficulty?: number | string;
  knowledgePoints?: string[];
}

interface KpCandidate {
  id: string;
  title: string;
}

function requireLevelFromLabel(label: string | undefined): RequirementLevel {
  if (!label) return 'unmarked';
  const entry = (
    Object.entries(REQUIREMENT_LEVEL_LABEL) as [RequirementLevel, string][]
  ).find(([, v]) => v === label);
  return entry ? entry[0] : 'unmarked';
}

function questionTypeFromLabel(label: string | undefined): QuestionType {
  if (!label) return 'other';
  const entry = (
    Object.entries(QUESTION_TYPE_LABEL) as [QuestionType, string][]
  ).find(([, v]) => v === label);
  return entry ? entry[0] : 'other';
}

// --- 知识点匹配辅助函数 ---

const BLACKLIST_KEYWORDS: ReadonlySet<string> = new Set([
  '治疗原则',
  '临床表现',
  '病理变化',
  '诊断',
  '治疗',
  '原因及处理',
  '原因',
  '处理',
  '功能',
  '适应证',
  '并发症',
  '神经支配',
  '特点',
  '分类',
  '鉴别诊断',
]);

const SUFFIX_PATTERNS: string[] = ['及其', '及', '和', '的'];

/**
 * 归一化字符串用于比较：
 * 1. 去除所有空格
 * 2. 去除所有中英文标点
 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/[。，、；：！？"''（）【】《》.,;:!?\"'()\[\]{}\-——…\/\\、]/g, '');
}

/**
 * 去除首尾常见连接助词后缀（及其、及、和、的）
 */
function stripSuffixes(text: string): string {
  let result = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIX_PATTERNS) {
      if (result.endsWith(suf)) {
        result = result.slice(0, -suf.length);
        changed = true;
        break;
      }
      if (result.startsWith(suf)) {
        result = result.slice(suf.length);
        changed = true;
        break;
      }
    }
  }
  return result;
}

/**
 * 统计有效汉字数量
 */
function countHanzi(text: string): number {
  const matches = text.match(/[\u4e00-\u9fa5]/g);
  return matches ? matches.length : 0;
}

/**
 * 判断关键词是否应被跳过（黑名单或过短）
 */
function shouldSkipKeyword(rawKeyword: string): boolean {
  const normalized = normalizeText(rawKeyword);
  if (!normalized) return true;
  if (BLACKLIST_KEYWORDS.has(normalized)) return true;
  if (countHanzi(normalized) < 3) return true;
  return false;
}

/**
 * 生成字符串的 trigram（三字组）集合
 */
function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  if (text.length < 3) {
    if (text.length > 0) trigrams.add(text);
    return trigrams;
  }
  for (let i = 0; i <= text.length - 3; i += 1) {
    trigrams.add(text.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * 计算 trigram 相似度（Jaccard 系数）
 */
function trigramSimilarity(a: string, b: string): number {
  const setA = getTrigrams(a);
  const setB = getTrigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 难度归一化：支持 1-5 数字或中文标签，返回数字 1-5
 */
function normalizeDifficulty(raw: number | string | undefined): number {
  if (raw === undefined || raw === null) return 2;
  if (typeof raw === 'number') {
    const n = Math.round(raw);
    if (n >= 1 && n <= 5) return n;
    return 2;
  }
  const label = raw.trim();
  if (label === '易') return 1;
  if (label === '较易' || label === '偏易') return 2;
  if (label === '中' || label === '中等') return 3;
  if (label === '较难' || label === '偏难') return 4;
  if (label === '难' || label === '困难') return 5;
  const num = Number(label);
  if (Number.isInteger(num) && num >= 1 && num <= 5) return num;
  return 2;
}

@Injectable()
export class ImportService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  // --- 大纲预览 ---
  async previewSyllabus(data: unknown): Promise<SyllabusPreview> {
    const subjects = this.parseSyllabusInput(data);

    let subjectCount = 0;
    let chapterCount = 0;
    let itemCount = 0;
    const preview: SyllabusPreview['preview'] = [];
    const seenKeys = new Set<string>();
    let duplicateCount = 0;

    for (const subj of subjects) {
      subjectCount += 1;
      for (const ch of subj.chapters) {
        chapterCount += 1;
        for (const item of ch.items) {
          itemCount += 1;
          const key = `${subj.subject}||${ch.title}||${item.title}`;
          if (seenKeys.has(key)) {
            duplicateCount += 1;
          } else {
            seenKeys.add(key);
          }
          if (preview.length < 20) {
            preview.push({
              subject: subj.subject,
              chapter: ch.title,
              title: item.title,
              requirementLevel: item.requirementLevel ?? '未标注',
            });
          }
        }
      }
    }

    const dbDuplicateCount = await this.countSyllabusDbDuplicates(subjects);
    duplicateCount += dbDuplicateCount;

    return {
      subjectCount,
      chapterCount,
      itemCount,
      duplicateCount,
      preview,
    };
  }

  // --- 大纲导入 ---
  async importSyllabus(data: unknown): Promise<ImportResult> {
    const subjects = this.parseSyllabusInput(data);

    let inserted = 0;
    let skipped = 0;

    await this.db.transaction(async (tx) => {
      const subjectMap = await this.buildSubjectNameIdMap(
        subjects.map((s) => s.subject),
        tx,
      );

      for (const subj of subjects) {
        let subjectId = subjectMap.get(subj.subject);
        if (!subjectId) {
          const insertedSubjects = await tx
            .insert(subject)
            .values({ name: subj.subject })
            .returning({ id: subject.id });
          subjectId = insertedSubjects[0].id;
          subjectMap.set(subj.subject, subjectId);
        }

        const chapterMap = await this.buildChapterTitleIdMap(
          subjectId,
          subj.chapters.map((c) => c.title),
          1,
          tx,
        );

        for (const ch of subj.chapters) {
          let chapterId = chapterMap.get(ch.title);
          if (!chapterId) {
            const insertedChapters = await tx
              .insert(chapter)
              .values({
                subjectId,
                title: ch.title,
                level: 1,
              })
              .returning({ id: chapter.id });
            chapterId = insertedChapters[0].id;
            chapterMap.set(ch.title, chapterId);
          }

          const existingItemSet = await this.buildSyllabusItemTitleSet(
            chapterId,
            tx,
          );

          for (const item of ch.items) {
            if (existingItemSet.has(item.title)) {
              skipped += 1;
              continue;
            }

            const reqLevel = requireLevelFromLabel(item.requirementLevel);

            const insertedItems = await tx
              .insert(syllabusItem)
              .values({
                subjectId,
                chapterId,
                title: item.title,
                originalText: item.originalText ?? null,
                requirementLevel: reqLevel,
                source: subj.source ?? null,
              })
              .returning({ id: syllabusItem.id });
            const syllabusItemId = insertedItems[0].id;

            await tx.insert(knowledgePoint).values({
              subjectId,
              chapterId,
              syllabusItemId,
              title: item.title,
              requirementLevel: reqLevel,
            });

            inserted += 1;
          }
        }
      }
    });

    return {
      success: true,
      inserted,
      skipped,
      message:
        skipped > 0
          ? `成功导入 ${inserted} 条，跳过 ${skipped} 条已存在数据`
          : `成功导入 ${inserted} 条数据`,
    };
  }

  // --- 真题预览 ---
  async previewQuestions(data: unknown): Promise<QuestionPreview> {
    const yearGroups = this.parseQuestionsInput(data);

    const years = new Set<number>();
    const subjectNames = new Set<string>();
    let questionCount = 0;
    let duplicateCount = 0;
    const seenKeys = new Set<string>();
    const preview: QuestionPreview['preview'] = [];
    const errors: string[] = [];
    const unmatchedMap = new Map<string, string[]>();

    for (const group of yearGroups) {
      years.add(group.year);
      for (const q of group.questions) {
        questionCount += 1;
        subjectNames.add(q.subject);
      }
    }

    const subjectMap = await this.buildSubjectNameIdMap(
      [...subjectNames],
      this.db,
    );
    const kpCandidateMap = await this.buildKpCandidateMapBySubjectNames(
      [...subjectNames],
      subjectMap,
      this.db,
    );

    for (const group of yearGroups) {
      for (let qi = 0; qi < group.questions.length; qi += 1) {
        const q = group.questions[qi];
        try {
          const key = `${group.year}||${q.subject}||${q.question}`;
          if (seenKeys.has(key)) {
            duplicateCount += 1;
          } else {
            seenKeys.add(key);
          }
          if (preview.length < 20) {
            preview.push({
              year: group.year,
              questionType: q.type,
              questionText: q.question,
              knowledgePoints: q.knowledgePoints ?? [],
            });
          }

          const kpKeywords = q.knowledgePoints ?? [];
          const subjectId = subjectMap.get(q.subject);
          if (subjectId && kpKeywords.length > 0) {
            const kpCandidates = kpCandidateMap.get(subjectId) ?? [];
            const matchResult = this.matchKnowledgePointsInMemory(
              kpCandidates,
              kpKeywords,
            );
            if (matchResult.unmatched.length > 0) {
              unmatchedMap.set(q.question, matchResult.unmatched);
            }
          } else if (kpKeywords.length > 0) {
            unmatchedMap.set(
              q.question,
              kpKeywords.filter((k) => !shouldSkipKeyword(k)),
            );
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : String(err);
          errors.push(
            `第 ${group.year} 年第 ${qi + 1} 道题预览失败：${msg}`,
          );
        }
      }
    }

    const dbDuplicateCount = await this.countQuestionDbDuplicates(yearGroups);
    duplicateCount += dbDuplicateCount;

    const unmatchedKnowledgePoints: UnmatchedKnowledgePointItem[] = [];
    for (const [questionText, unmatchedKeywords] of unmatchedMap) {
      unmatchedKnowledgePoints.push({ questionText, unmatchedKeywords });
    }

    return {
      yearCount: years.size,
      subjectCount: subjectNames.size,
      questionCount,
      duplicateCount,
      preview,
      unmatchedKnowledgePoints,
      errors,
    };
  }

  // --- 真题导入 ---
  async importQuestions(data: unknown): Promise<ImportResult> {
    const yearGroups = this.parseQuestionsInput(data);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unmatchedMap = new Map<string, string[]>();

    await this.db.transaction(async (tx) => {
      const subjectNames = new Set<string>();
      for (const group of yearGroups) {
        for (const q of group.questions) {
          subjectNames.add(q.subject);
        }
      }

      const subjectMap = await this.buildSubjectNameIdMap(
        [...subjectNames],
        tx,
      );
      const kpCandidateMap = await this.buildKpCandidateMapBySubjectNames(
        [...subjectNames],
        subjectMap,
        tx,
      );

      const existingQuestionMap =
        await this.buildExistingQuestionSetByGroups(
          yearGroups,
          subjectMap,
          tx,
        );

      for (const group of yearGroups) {
        for (let qi = 0; qi < group.questions.length; qi += 1) {
          const q = group.questions[qi];
          try {
            const subjectId = subjectMap.get(q.subject);
            if (!subjectId) {
              const insertedSubjects = await tx
                .insert(subject)
                .values({ name: q.subject })
                .returning({ id: subject.id });
              const newId = insertedSubjects[0].id;
              subjectMap.set(q.subject, newId);
              continue;
            }

            const dedupeKey = `${group.year}||${q.question}`;
            const existingSet = existingQuestionMap.get(subjectId);
            if (existingSet && existingSet.has(dedupeKey)) {
              skipped += 1;
              continue;
            }

            const qType = questionTypeFromLabel(q.type);
            const difficulty = normalizeDifficulty(q.difficulty);

            const insertedQuestions = await tx
              .insert(examQuestion)
              .values({
                year: group.year,
                subjectId,
                questionType: qType,
                questionText: q.question,
                answer: q.answer ?? null,
                answerKeywords: q.answerKeywords ?? [],
                notes: q.notes ?? null,
                difficulty,
                source: group.source ?? null,
              })
              .returning({ id: examQuestion.id });
            const questionId = insertedQuestions[0].id;

            const kpKeywords = q.knowledgePoints ?? [];
            if (kpKeywords.length > 0) {
              const kpCandidates = kpCandidateMap.get(subjectId) ?? [];
              const matchResult = this.matchKnowledgePointsInMemory(
                kpCandidates,
                kpKeywords,
              );

              if (matchResult.unmatched.length > 0) {
                unmatchedMap.set(q.question, matchResult.unmatched);
              }

              const topMatches = matchResult.matched
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

              if (topMatches.length > 0) {
                await tx.insert(questionKnowledgePoint).values(
                  topMatches.map((kp, i) => ({
                    questionId,
                    knowledgePointId: kp.id,
                    isPrimary: i === 0,
                    relevance: 2,
                  })),
                );
              }
            }

            inserted += 1;
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : String(err);
            errors.push(
              `第 ${group.year} 年第 ${qi + 1} 道题导入失败：${msg}`,
            );
          }
        }
      }
    });

    const unmatchedKnowledgePoints: UnmatchedKnowledgePointItem[] = [];
    for (const [questionText, unmatchedKeywords] of unmatchedMap) {
      unmatchedKnowledgePoints.push({ questionText, unmatchedKeywords });
    }

    return {
      success: errors.length === 0,
      inserted,
      skipped,
      message:
        skipped > 0
          ? `成功导入 ${inserted} 道真题，跳过 ${skipped} 道已存在题目`
          : `成功导入 ${inserted} 道真题`,
      unmatchedKnowledgePoints,
      errors,
    };
  }

  // --- 旧通用方法保留 ---
  async preview(dto: { type?: string; data: unknown[] }): Promise<{
    subjectsCount: number;
    chaptersCount: number;
    itemsCount: number;
    questionsCount: number;
    duplicates: string[];
  }> {
    if (dto.type === 'questions') {
      const result = await this.previewQuestions(dto.data);
      return {
        subjectsCount: result.subjectCount,
        chaptersCount: 0,
        itemsCount: 0,
        questionsCount: result.questionCount,
        duplicates: result.duplicateCount > 0 ? [`预计重复 ${result.duplicateCount} 条`] : [],
      };
    }
    const result = await this.previewSyllabus(dto.data);
    return {
      subjectsCount: result.subjectCount,
      chaptersCount: result.chapterCount,
      itemsCount: result.itemCount,
      questionsCount: 0,
      duplicates: result.duplicateCount > 0 ? [`预计重复 ${result.duplicateCount} 条`] : [],
    };
  }

  async execute(dto: { type?: string; data: unknown[] }): Promise<{
    success: boolean;
    inserted: number;
  }> {
    if (dto.type === 'questions') {
      const result = await this.importQuestions(dto.data);
      return { success: result.success, inserted: result.inserted };
    }
    const result = await this.importSyllabus(dto.data);
    return { success: result.success, inserted: result.inserted };
  }

  // --- 私有方法 ---
  private parseSyllabusInput(data: unknown): SyllabusSubjectInput[] {
    if (!Array.isArray(data)) {
      throw new BadRequestException('大纲数据格式错误：应为数组');
    }
    return data.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`第 ${index + 1} 条科目数据格式错误`);
      }
      const obj = item as Record<string, unknown>;
      if (typeof obj.subject !== 'string' || !obj.subject.trim()) {
        throw new BadRequestException(`第 ${index + 1} 条科目缺少 subject 字段`);
      }
      if (!Array.isArray(obj.chapters)) {
        throw new BadRequestException(`科目「${obj.subject}」缺少 chapters 数组`);
      }
      return {
        subject: obj.subject,
        source: typeof obj.source === 'string' ? obj.source : undefined,
        chapters: obj.chapters.map((ch: unknown, ci: number) => {
          if (!ch || typeof ch !== 'object') {
            throw new BadRequestException(
              `科目「${obj.subject}」第 ${ci + 1} 章数据格式错误`,
            );
          }
          const chObj = ch as Record<string, unknown>;
          if (typeof chObj.title !== 'string' || !chObj.title.trim()) {
            throw new BadRequestException(
              `科目「${obj.subject}」第 ${ci + 1} 章缺少 title 字段`,
            );
          }
          if (!Array.isArray(chObj.items)) {
            throw new BadRequestException(
              `章节「${chObj.title}」缺少 items 数组`,
            );
          }
          return {
            title: chObj.title,
            items: chObj.items.map((it: unknown, ii: number) => {
              if (!it || typeof it !== 'object') {
                throw new BadRequestException(
                  `章节「${chObj.title}」第 ${ii + 1} 条格式错误`,
                );
              }
              const itObj = it as Record<string, unknown>;
              if (typeof itObj.title !== 'string' || !itObj.title.trim()) {
                throw new BadRequestException(
                  `章节「${chObj.title}」第 ${ii + 1} 条缺少 title 字段`,
                );
              }
              return {
                title: itObj.title,
                requirementLevel:
                  typeof itObj.requirementLevel === 'string'
                    ? itObj.requirementLevel
                    : undefined,
                originalText:
                  typeof itObj.originalText === 'string'
                    ? itObj.originalText
                    : undefined,
              };
            }),
          };
        }),
      };
    });
  }

  private parseQuestionsInput(data: unknown): QuestionYearInput[] {
    if (!Array.isArray(data)) {
      throw new BadRequestException('真题数据格式错误：应为数组');
    }
    return data.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`第 ${index + 1} 组真题数据格式错误`);
      }
      const obj = item as Record<string, unknown>;
      const year = Number(obj.year);
      if (!Number.isInteger(year) || year <= 0) {
        throw new BadRequestException(`第 ${index + 1} 组真题缺少有效的 year 字段`);
      }
      if (!Array.isArray(obj.questions)) {
        throw new BadRequestException(`第 ${year} 年真题缺少 questions 数组`);
      }
      return {
        year,
        source: typeof obj.source === 'string' ? obj.source : undefined,
        questions: obj.questions.map((q: unknown, qi: number) => {
          if (!q || typeof q !== 'object') {
            throw new BadRequestException(
              `第 ${year} 年第 ${qi + 1} 道题格式错误`,
            );
          }
          const qObj = q as Record<string, unknown>;
          if (typeof qObj.question !== 'string' || !qObj.question.trim()) {
            throw new BadRequestException(
              `第 ${year} 年第 ${qi + 1} 道题缺少 question 字段`,
            );
          }
          if (typeof qObj.subject !== 'string' || !qObj.subject.trim()) {
            throw new BadRequestException(
              `第 ${year} 年第 ${qi + 1} 道题缺少 subject 字段`,
            );
          }
          return {
            type: typeof qObj.type === 'string' ? qObj.type : '其他',
            subject: qObj.subject,
            question: qObj.question,
            answer: typeof qObj.answer === 'string' ? qObj.answer : undefined,
            answerKeywords: Array.isArray(qObj.answerKeywords)
              ? qObj.answerKeywords.filter(
                  (kw: unknown) => typeof kw === 'string',
                )
              : undefined,
            notes: typeof qObj.notes === 'string' ? qObj.notes : undefined,
            difficulty:
              qObj.difficulty !== undefined &&
              qObj.difficulty !== null
                ? (typeof qObj.difficulty === 'string' ||
                    typeof qObj.difficulty === 'number'
                    ? qObj.difficulty
                    : undefined)
                : undefined,
            knowledgePoints: Array.isArray(qObj.knowledgePoints)
              ? qObj.knowledgePoints.filter(
                  (kp: unknown) => typeof kp === 'string',
                )
              : [],
          };
        }),
      };
    });
  }

  private async buildSubjectNameIdMap(
    names: string[],
    db: PostgresJsDatabase = this.db,
  ): Promise<Map<string, string>> {
    const uniqueNames = [...new Set(names.filter((n) => n && n.trim()))];
    const result = new Map<string, string>();
    if (uniqueNames.length === 0) return result;

    const rows = await db
      .select({ id: subject.id, name: subject.name })
      .from(subject)
      .where(inArray(subject.name, uniqueNames));

    for (const row of rows) {
      result.set(row.name, row.id);
    }
    return result;
  }

  private async buildChapterTitleIdMap(
    subjectId: string,
    titles: string[],
    level: number,
    db: PostgresJsDatabase = this.db,
  ): Promise<Map<string, string>> {
    const uniqueTitles = [...new Set(titles.filter((t) => t && t.trim()))];
    const result = new Map<string, string>();
    if (uniqueTitles.length === 0) return result;

    const rows = await db
      .select({ id: chapter.id, title: chapter.title })
      .from(chapter)
      .where(
        and(
          eq(chapter.subjectId, subjectId),
          eq(chapter.level, level),
          inArray(chapter.title, uniqueTitles),
        ),
      );

    for (const row of rows) {
      result.set(row.title, row.id);
    }
    return result;
  }

  private async buildSyllabusItemTitleSet(
    chapterId: string,
    db: PostgresJsDatabase = this.db,
  ): Promise<Set<string>> {
    const rows = await db
      .select({ title: syllabusItem.title })
      .from(syllabusItem)
      .where(eq(syllabusItem.chapterId, chapterId));

    const result = new Set<string>();
    for (const row of rows) {
      result.add(row.title);
    }
    return result;
  }

  private async buildKpCandidateMapBySubjectNames(
    subjectNames: string[],
    subjectMap: Map<string, string>,
    db: PostgresJsDatabase = this.db,
  ): Promise<Map<string, KpCandidate[]>> {
    const result = new Map<string, KpCandidate[]>();
    const subjectIds = subjectNames
      .map((name) => subjectMap.get(name))
      .filter((id): id is string => !!id);

    if (subjectIds.length === 0) return result;
    for (const sid of subjectIds) {
      result.set(sid, []);
    }

    const rows = await db
      .select({
        id: knowledgePoint.id,
        title: knowledgePoint.title,
        subjectId: knowledgePoint.subjectId,
      })
      .from(knowledgePoint)
      .where(inArray(knowledgePoint.subjectId, subjectIds));

    for (const row of rows) {
      const arr = result.get(row.subjectId);
      if (arr) {
        arr.push({ id: row.id, title: row.title });
      }
    }
    return result;
  }

  private async buildExistingQuestionSetByGroups(
    yearGroups: QuestionYearInput[],
    subjectMap: Map<string, string>,
    db: PostgresJsDatabase = this.db,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    const subjectIds = [...subjectMap.values()];
    if (subjectIds.length === 0) return result;

    const yearSubjectPairs = new Set<string>();
    for (const group of yearGroups) {
      for (const q of group.questions) {
        const sid = subjectMap.get(q.subject);
        if (sid) {
          yearSubjectPairs.add(`${group.year}||${sid}`);
          if (!result.has(sid)) result.set(sid, new Set());
        }
      }
    }

    if (yearSubjectPairs.size === 0) return result;

    for (const pair of yearSubjectPairs) {
      const [yearStr, sid] = pair.split('||');
      const year = Number(yearStr);
      const rows = await db
        .select({ questionText: examQuestion.questionText })
        .from(examQuestion)
        .where(
          and(
            eq(examQuestion.year, year),
            eq(examQuestion.subjectId, sid),
          ),
        );
      const set = result.get(sid) ?? new Set<string>();
      for (const row of rows) {
        set.add(`${year}||${row.questionText}`);
      }
      result.set(sid, set);
    }

    return result;
  }

  private async countSyllabusDbDuplicates(
    subjects: SyllabusSubjectInput[],
  ): Promise<number> {
    const subjectNames = subjects.map((s) => s.subject);
    const subjectMap = await this.buildSubjectNameIdMap(subjectNames);

    let count = 0;

    for (const subj of subjects) {
      const subjectId = subjectMap.get(subj.subject);
      if (!subjectId) continue;

      const chapterTitles = subj.chapters.map((c) => c.title);
      const chapterMap = await this.buildChapterTitleIdMap(
        subjectId,
        chapterTitles,
        1,
      );

      for (const ch of subj.chapters) {
        const chapterId = chapterMap.get(ch.title);
        if (!chapterId) continue;

        const existingItemSet =
          await this.buildSyllabusItemTitleSet(chapterId);

        for (const item of ch.items) {
          if (existingItemSet.has(item.title)) {
            count += 1;
          }
        }
      }
    }
    return count;
  }

  private async countQuestionDbDuplicates(
    yearGroups: QuestionYearInput[],
  ): Promise<number> {
    const subjectNames = new Set<string>();
    for (const group of yearGroups) {
      for (const q of group.questions) {
        subjectNames.add(q.subject);
      }
    }

    const subjectMap = await this.buildSubjectNameIdMap([...subjectNames]);
    const existingQuestionMap =
      await this.buildExistingQuestionSetByGroups(
        yearGroups,
        subjectMap,
      );

    let count = 0;
    for (const group of yearGroups) {
      for (const q of group.questions) {
        const subjectId = subjectMap.get(q.subject);
        if (!subjectId) continue;
        const dedupeKey = `${group.year}||${q.question}`;
        const existingSet = existingQuestionMap.get(subjectId);
        if (existingSet && existingSet.has(dedupeKey)) {
          count += 1;
        }
      }
    }
    return count;
  }

  /**
   * 知识点匹配核心算法（纯内存版）
   *
   * 对每个关键词做三级匹配（同科目内）：
   * Level 1 - 完全相等：去标点+去首尾助词后完全相同，得分 1.0
   * Level 2 - 短语包含：关键词作为完整短语出现在标题中，且长度占比 >= 40%，得分 0.8
   * Level 3 - 高度相似：trigram 相似度 >= 0.70，得分 = 相似度
   * 都不满足 → 不匹配，记入 unmatched。
   *
   * 先做黑名单/过短过滤，被跳过的关键词不计入 unmatched。
   * 同一知识点被多个关键词命中时，取最高得分。
   */
  private matchKnowledgePointsInMemory(
    kpCandidates: KpCandidate[],
    kpKeywords: string[],
  ): {
    matched: Array<{ id: string; score: number }>;
    unmatched: string[];
  } {
    const unmatched: string[] = [];
    const scoreMap = new Map<string, number>();

    for (const keyword of kpKeywords) {
      if (shouldSkipKeyword(keyword)) {
        continue;
      }

      const kwNormalized = normalizeText(keyword);
      const kwStripped = stripSuffixes(kwNormalized);

      let bestScore = 0;
      let bestId: string | null = null;

      for (const kp of kpCandidates) {
        const titleNormalized = normalizeText(kp.title);
        const titleStripped = stripSuffixes(titleNormalized);
        if (!titleNormalized) continue;

        let score = 0;

        if (kwStripped === titleStripped) {
          score = 1.0;
        } else if (
          titleNormalized.includes(kwNormalized) &&
          kwNormalized.length / titleNormalized.length >= 0.4
        ) {
          score = 0.8;
        } else {
          const sim = trigramSimilarity(kwNormalized, titleNormalized);
          if (sim >= 0.7) {
            score = sim;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestId = kp.id;
        }
      }

      if (bestId && bestScore > 0) {
        const existing = scoreMap.get(bestId) ?? 0;
        if (bestScore > existing) {
          scoreMap.set(bestId, bestScore);
        }
      } else {
        unmatched.push(keyword);
      }
    }

    const matched: Array<{ id: string; score: number }> = [];
    for (const [id, score] of scoreMap) {
      matched.push({ id, score });
    }

    return { matched, unmatched };
  }
}
