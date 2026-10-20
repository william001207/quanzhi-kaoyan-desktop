/* 前后端共享的类型写在这里 */

export interface Subject {
  id: string;
  name: string;
  sortOrder: number;
  totalKnowledgePoints: number;
}

export type SyllabusMode = 'exam_syllabus' | 'textbook';

export interface Chapter {
  id: string;
  subjectId: string;
  parentChapterId: string | null;
  title: string;
  sortOrder: number;
  level: number;
  source: SyllabusMode;
}

export interface ChapterPathNode {
  id: string;
  title: string;
  level: number;
}

export interface KnowledgePointChapterPaths {
  examSyllabus: ChapterPathNode[];
  textbook: ChapterPathNode[];
}

export interface SyllabusItem {
  id: string;
  subjectId: string;
  chapterId: string;
  title: string;
  originalText: string | null;
  requirementLevel: RequirementLevel;
  source: string | null;
  sortOrder: number;
}

export type RequirementLevel = 'master' | 'familiar' | 'understand' | 'unmarked';

export const REQUIREMENT_LEVEL_LABEL: Record<RequirementLevel, string> = {
  master: '掌握',
  familiar: '熟悉',
  understand: '了解',
  unmarked: '未标注',
};

export type KnowledgePointStatus = 'not_started' | 'weak' | 'medium' | 'familiar' | 'mastered';

export type WeakMarkReason =
  | 'unfamiliar'
  | 'hard_to_remember'
  | 'confusing'
  | 'important';

export const WEAK_MARK_REASON_LABEL: Record<WeakMarkReason, string> = {
  unfamiliar: '不熟悉',
  hard_to_remember: '记不住',
  confusing: '易混淆',
  important: '重点',
};

export const KP_STATUS_LABEL: Record<KnowledgePointStatus, string> = {
  not_started: '未开始',
  weak: '薄弱',
  medium: '巩固中',
  familiar: '熟悉',
  mastered: '掌握',
};

export type QuestionStatus = 'not_started' | 'weak' | 'medium' | 'familiar' | 'mastered';

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  not_started: '未开始',
  weak: '薄弱',
  medium: '巩固中',
  familiar: '熟悉',
  mastered: '掌握',
};

export function getQuestionStatus(answered: boolean, masteryScore: number): QuestionStatus {
  if (!answered) return 'not_started';
  if (masteryScore < 40) return 'weak';
  if (masteryScore < 70) return 'medium';
  if (masteryScore < 90) return 'familiar';
  return 'mastered';
}

export function questionStatusBadgeVariant(status: QuestionStatus): string {
  switch (status) {
    case 'mastered':
      return 'default';
    case 'familiar':
      return 'secondary';
    case 'medium':
      return 'outline';
    case 'weak':
      return 'destructive';
    case 'not_started':
      return 'outline';
    default:
      return 'secondary';
  }
}

export interface KnowledgePoint {
  id: string;
  subjectId: string;
  chapterId: string;
  syllabusItemId: string | null;
  title: string;
  content: string | null;
  summary: string | null;
  keywords: string[];
  requirementLevel: RequirementLevel;
  importanceScore: number;
  examFrequency: number;
  masteryScore: number;
  recallMastery: number;
  questionMastery: number;
  answeredQuestionCount: number;
  status: KnowledgePointStatus;
  firstLearnedAt: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  reviewStage: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  totalReviewCount: number;
  totalQuestionCount: number;
  correctQuestionCount: number;
  manuallyPinned: boolean;
  isWeakMarked: boolean;
  weakMarkedAt: string | null;
  weakMarkReason: WeakMarkReason | null;
  cardData: KnowledgePointCardData;
  subjectName?: string;
  chapterPath?: string[];
  chapterPaths?: KnowledgePointChapterPaths;
  syllabusTitle?: string | null;
  latestExamYear?: number | null;
  examSources?: string[];
}

export interface KnowledgePointCardData {
  flowSteps?: string[];
  blocks?: Array<{
    title: string;
    subtitleEn?: string;
    content: string;
  }>;
  summary?: string;
}

export type QuestionType =
  | 'noun_explanation'
  | 'short_answer'
  | 'essay'
  | 'multiple_choice'
  | 'fill_blank'
  | 'other';

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  noun_explanation: '名词解释',
  short_answer: '简答题',
  essay: '论述题',
  multiple_choice: '选择题',
  fill_blank: '填空题',
  other: '其他',
};

export interface CreateExamQuestionPayload {
  year: number;
  subjectId: string;
  questionType: QuestionType;
  questionText: string;
  answer?: string;
  answerKeywords: string[];
  source?: string;
  difficulty: number;
  knowledgePointIds: string[];
}

export interface ExamQuestion {
  id: string;
  year: number;
  subjectId: string;
  subjectName?: string;
  questionType: QuestionType;
  questionText: string;
  answer: string | null;
  answerKeywords: string[];
  source: string | null;
  notes: string | null;
  difficulty: number;
  masteryScore: number;
  answered: boolean;
  answerCount: number;
  lastAnsweredAt: string | null;
  cardData?: KnowledgePointCardData;
  knowledgePoints?: KnowledgePointBrief[];
  knowledgePointCount?: number;
  examFrequency?: number;
}

export interface ExamQuestionBrief {
  id: string;
  year: number;
  subjectId: string;
  subjectName: string;
  questionType: QuestionType;
  questionText: string;
  source: string | null;
  difficulty: number;
  masteryScore: number;
  answered: boolean;
  answerCount: number;
  knowledgePointCount: number;
  examFrequency?: number;
}

export interface SearchQuestion {
  id: string;
  year: number;
  questionType: QuestionType;
  questionText: string;
  source?: string | null;
}

export interface KnowledgePointBrief {
  id: string;
  title: string;
  masteryScore?: number;
  isPrimary?: boolean;
  chapterPaths?: KnowledgePointChapterPaths;
  subjectId?: string;
}

export interface QuestionKnowledgePoint {
  questionId: string;
  knowledgePointId: string;
  relevance: number;
  isPrimary: boolean;
}

export type ReviewType = 'new_learning' | 'scheduled_review' | 'question_test' | 'wrong_question' | 'manual';
export type SelfRating = 'again' | 'hard' | 'good' | 'easy';

export const SELF_RATING_LABEL: Record<SelfRating, string> = {
  again: '不会',
  hard: '模糊',
  good: '基本掌握',
  easy: '熟练',
};

export interface ReviewRecord {
  id: string;
  knowledgePointId: string;
  reviewedAt: string;
  selfRating: SelfRating;
  recallScore: number | null;
  questionScore: number | null;
  oldMasteryScore: number;
  newMasteryScore: number;
  oldReviewStage: number;
  newReviewStage: number;
  nextReviewAt: string | null;
  reviewType: string;
  notes: string | null;
  userAnswer: string | null;
}

export type DailyPlanItemType = 'new_learning' | 'scheduled_review' | 'question_test' | 'wrong_question' | 'manual';

export interface WrongQuestionInfo {
  id: string;
  wrongCount: number;
  lastWrongAt: string | null;
  userAnswer: string | null;
  mistakeReason: string | null;
  resolved: boolean;
}

export interface QuestionReviewDetail {
  question: ExamQuestion;
  latestReview: ReviewRecord | null;
  wrongQuestion: WrongQuestionInfo | null;
}

export const DAILY_ITEM_TYPE_LABEL: Record<DailyPlanItemType, string> = {
  new_learning: '新学',
  scheduled_review: '复习',
  question_test: '真题',
  wrong_question: '错题',
  manual: '手动',
};

export interface DailyPlan {
  id: string;
  planDate: string;
  generatedAt: string;
  status: string;
  totalEstimatedMinutes: number;
  completedMinutes: number;
  totalItems: number;
  completedItems: number;
}

export interface DailyPlanItem {
   id: string;
   dailyPlanId: string;
   itemType: DailyPlanItemType;
   knowledgePointId: string | null;
   knowledgePointTitle?: string;
   questionId: string | null;
   questionText?: string;
   questionType?: QuestionType;
   questionSource?: string | null;
    questionDifficulty?: number;
    questionAnswerCount?: number;
    priorityScore: number;
   estimatedMinutes: number;
   completed: boolean;
   completedAt: string | null;
   sortOrder: number;
   reason: string | null;
   subjectName?: string;
   chapterPath?: string[];
   chapterPaths?: KnowledgePointChapterPaths;
   syllabusTitle?: string;
   requirementLevel?: RequirementLevel;
   examFrequency?: number;
   examYears?: number[];
   latestExamYear?: number;
    lastReviewRating?: SelfRating;
    lastReviewedAt?: string | null;
    masteryScore?: number;
    pendingQuestionCount?: number;
    pendingWrongCount?: number;
    isWeakMarked?: boolean;
 }

export interface WrongQuestion {
  id: string;
  questionId: string;
  knowledgePointId: string | null;
  firstWrongAt: string;
  lastWrongAt: string;
  wrongCount: number;
  resolved: boolean;
  nextRetryAt: string | null;
  userAnswer: string | null;
  mistakeReason: string | null;
  errorTags: ErrorTag[];
}

export interface WrongQuestionWithDetail extends WrongQuestion {
   questionText: string;
   questionYear: number;
   questionType: string;
   questionSource: string | null;
   difficulty: number;
   answerCount: number;
   knowledgePointTitle: string | null;
   subjectName: string | null;
   knowledgePoints: KnowledgePointBrief[];
   chapterPaths?: KnowledgePointChapterPaths;
   examFrequency?: number;
}

export interface TopWrongItem {
    rank: number;
    questionId: string;
    questionText: string;
    wrongCount: number;
    difficulty: number;
    answerCount: number;
    knowledgePointId: string | null;
    knowledgePointTitle: string | null;
    subjectName: string;
    chapterPaths?: KnowledgePointChapterPaths;
  }

export interface WeakMarkKnowledgePoint {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName?: string;
  masteryScore: number;
  status: KnowledgePointStatus;
  weakMarkedAt: string | null;
  weakMarkReason: WeakMarkReason | null;
}

export interface WrongQuestionStatsOverview {
  unresolvedCount: number;
  resolvedCount: number;
  totalCount: number;
  masteryRate: number;
}

export interface WrongSubjectDistributionItem {
  subjectId: string;
  subjectName: string;
  unresolvedCount: number;
  totalCount: number;
}

export interface WrongReasonDistributionItem {
  mistakeReason: string | null;
  count: number;
}

export interface WrongQuestionStats {
  overview: WrongQuestionStatsOverview;
  bySubject: WrongSubjectDistributionItem[];
  byReason: WrongReasonDistributionItem[];
  topWrong: TopWrongItem[];
  byErrorTags: ErrorTagDistributionItem[];
}

export type ErrorTag =
  | 'concept_confusion'
  | 'knowledge_forgotten'
  | 'reading_error'
  | 'incomplete_answer'
  | 'understanding_bias'
  | 'other';

export const ERROR_TAG_LABEL: Record<ErrorTag, string> = {
  concept_confusion: '概念混淆',
  knowledge_forgotten: '知识点遗忘',
  reading_error: '审题失误',
  incomplete_answer: '表述不全',
  understanding_bias: '理解偏差',
  other: '其他',
};

export const ERROR_TAG_VALUES: ErrorTag[] = [
  'concept_confusion',
  'knowledge_forgotten',
  'reading_error',
  'incomplete_answer',
  'understanding_bias',
  'other',
];

export interface ErrorTagDistributionItem {
  tag: ErrorTag | 'unmarked';
  count: number;
}

export type MistakeReason =
  | 'knowledge_gap'
  | 'memory_blur'
  | 'reading_error'
  | 'expression_incomplete'
  | 'concept_confusion'
  | 'other';

export const MISTAKE_REASON_LABEL: Record<MistakeReason, string> = {
  knowledge_gap: '知识点不会',
  memory_blur: '记忆模糊',
  reading_error: '审题错误',
  expression_incomplete: '表达不完整',
  concept_confusion: '混淆概念',
  other: '其他',
};

export interface UserSetting {
  id: string;
  examDate: string | null;
  dailyMinutes: number;
  dailyKpConfig: Record<string, number>;
  dailyQuestionConfig: Record<string, number>;
  examMode: boolean;
  kpWeightSyllabus: number;
  kpWeightExamFreq: number;
  kpWeightMastery: number;
  kpWeightForgetting: number;
  kpWeightWrong: number;
  kpWeightOverdue: number;
  qWeightExamFreq: number;
  qWeightMastery: number;
  qWeightWrong: number;
  qWeightOverdue: number;
  qWeightDifficulty: number;
  mockExamScoreConfig: MockExamScoreConfig;
}

export type ClearDataType = 'recall' | 'question' | 'all';
export type ClearDataRange = 'today' | 'all';

export interface ClearDataResult {
  reviewRecordsDeleted: number;
  wrongQuestionsDeleted: number;
  knowledgePointsReset: number;
  questionsReset: number;
  dailyPlanItemsReset: number;
}

export interface StatsOverview {
  syllabusCoverage: number;
  masteryRate: number;
  questionCompletionRate: number;
  questionAccuracy: number;
  totalKnowledgePoints: number;
  startedKnowledgePoints: number;
  masteredKnowledgePoints: number;
  totalQuestions: number;
  doneQuestions: number;
  correctQuestions: number;
}

export interface SubjectStats {
  subjectId: string;
  subjectName: string;
  totalPoints: number;
  startedPoints: number;
  masteredPoints: number;
  avgMasteryScore: number;
  questionAccuracy: number;
  weakPointCount: number;
}

export interface MasteryDistribution {
  notStarted: number;
  weak: number;
  medium: number;
  familiar: number;
  mastered: number;
}

export interface ReviewLoadDay {
  date: string;
  count: number;
  overdue: number;
}

export interface FreqMasteryPoint {
  knowledgePointId: string;
  title: string;
  examFrequency: number;
  masteryScore: number;
  subjectName: string;
}

export interface HighFreqItem {
  rank: number;
  knowledgePointId: string;
  title: string;
  count: number;
  latestYear: number;
  subjectName: string;
  sourceSchools: string[];
  chapterPaths?: KnowledgePointChapterPaths;
}

export interface HighFreqQuestion {
  rank: number;
  id: string;
  year: number;
  subjectId: string;
  subjectName: string;
  questionType: QuestionType;
  questionText: string;
  source: string | null;
  difficulty: number;
  answered: boolean;
  masteryScore: number;
  answerCount: number;
  frequency: number;
  knowledgePoints: KnowledgePointBrief[];
}

export interface YearQuestionGroup {
  year: number;
  questionCount: number;
  questions: ExamQuestion[];
}

export interface SchoolQuestionGroup {
  school: string;
  questionCount: number;
  questions: ExamQuestion[];
}

export interface YearQuestionOverview {
  year: number;
  questionCount: number;
  subjectCount: number;
  typeDistribution: Record<QuestionType, number>;
}

export interface SchoolQuestionOverview {
  school: string;
  questionCount: number;
  earliestYear: number;
  latestYear: number;
  subjectCount: number;
}

export interface SubjectQuestionOverview {
  subjectId: string;
  subjectName: string;
  questionCount: number;
  yearCount: number;
  schoolCount: number;
  typeDistribution: Record<QuestionType, number>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- 数据导入相关 ---

export interface SyllabusPreview {
  subjectCount: number;
  chapterCount: number;
  itemCount: number;
  duplicateCount: number;
  preview: Array<{
    subject: string;
    chapter: string;
    title: string;
    requirementLevel: string;
  }>;
}

export interface UnmatchedKnowledgePointItem {
  questionText: string;
  unmatchedKeywords: string[];
}

export interface QuestionPreview {
  yearCount: number;
  subjectCount: number;
  questionCount: number;
  duplicateCount: number;
  preview: Array<{
    year: number;
    questionType: string;
    questionText: string;
    knowledgePoints: string[];
  }>;
  unmatchedKnowledgePoints: UnmatchedKnowledgePointItem[];
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  message?: string;
  unmatchedKnowledgePoints?: UnmatchedKnowledgePointItem[];
  errors?: string[];
}

export interface SearchResult {
  knowledgePoints: KnowledgePointBrief[];
  examChapters: Chapter[];
  textbookChapters: Chapter[];
  syllabus: SyllabusItem[];
  questions: SearchQuestion[];
}

// === Mock Exam (模拟考试) ===

export type MockExamQuestionType = 'noun_explanation' | 'short_answer' | 'essay';

export interface MockExamScoreConfig {
  noun_explanation?: number;
  short_answer?: number;
  essay?: number;
}

export const DEFAULT_MOCK_EXAM_SCORE_CONFIG: Required<MockExamScoreConfig> = {
  noun_explanation: 5,
  short_answer: 10,
  essay: 20,
};

export interface GeneratePaperDto {
  subjectIds: string[];
  source?: string;
  yearStart?: number;
  yearEnd?: number;
  questionTypes: MockExamQuestionType[];
  questionCounts: Partial<Record<MockExamQuestionType, number>>;
  scoreConfig?: MockExamScoreConfig;
  title?: string;
}

export interface GenerateByYearDto {
  source: string;
  year: number;
  scoreConfig?: MockExamScoreConfig;
  title?: string;
}

export type TemplateMode = 'custom' | 'by_year';

export interface ExamPaperTemplate {
  id: string;
  name: string;
  mode: TemplateMode;
  subjectIds: string[];
  source: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  questionTypes: MockExamQuestionType[];
  questionCounts: Partial<Record<MockExamQuestionType, number>>;
  scoreConfig: MockExamScoreConfig;
  createdAt: string;
}

export interface CreateTemplateDto {
  name: string;
  mode: TemplateMode;
  subjectIds: string[];
  source?: string;
  yearStart?: number;
  yearEnd?: number;
  questionTypes: MockExamQuestionType[];
  questionCounts: Partial<Record<MockExamQuestionType, number>>;
  scoreConfig: MockExamScoreConfig;
}

export interface UpdateTemplateDto {
  name?: string;
  subjectIds?: string[];
  source?: string;
  yearStart?: number;
  yearEnd?: number;
  year?: number;
  questionTypes?: MockExamQuestionType[];
  questionCounts?: Partial<Record<MockExamQuestionType, number>>;
  scoreConfig?: MockExamScoreConfig;
}

export interface TypeAvailability {
  requested: number;
  available: number;
}

export interface GeneratePaperResult {
  paperId: string;
  title: string;
  questions: ExamQuestion[];
  totalScore: number;
  estimatedMinutes: number;
  availability: Partial<Record<MockExamQuestionType, TypeAvailability>>;
  scoreConfig: MockExamScoreConfig;
}

export interface ExamPaper {
  id: string;
  title: string;
  mode: string;
  subjectIds: string[];
  source: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  questionTypes: string[];
  questionCounts: Record<string, number>;
  totalScore: number;
  estimatedMinutes: number;
  questionIds: string[];
  scoreConfig: MockExamScoreConfig;
}

export type ExamRecordStatus = 'in_progress' | 'submitted';

export type ExamSelfRating = 'again' | 'partial' | 'basic' | 'full';

export interface ExamRecord {
  id: string;
  paperId: string;
  title: string;
  totalScore: number;
  earnedScore: number;
  totalQuestions: number;
  startedAt: string;
  submittedAt: string | null;
  totalDurationSeconds: number;
  status: ExamRecordStatus;
  answers: Record<string, string>;
  selfRatings: Record<string, ExamSelfRating>;
  scores: Record<string, number>;
  addedToWrong: Record<string, boolean>;
}

export type ExamPaperStatus = 'not_started' | 'in_progress' | 'submitted';

export interface ExamPaperListItem {
  id: string;
  title: string;
  mode: string;
  totalScore: number;
  totalQuestions: number;
  estimatedMinutes: number;
  status: ExamPaperStatus;
  earnedScore: number | null;
  latestRecordId: string | null;
  createdAt: string;
}

export interface ExamPaperDetail {
  id: string;
  title: string;
  mode: string;
  totalScore: number;
  totalQuestions: number;
  estimatedMinutes: number;
  createdAt: string;
  questions: ExamQuestion[];
  scoreConfig: MockExamScoreConfig;
}

export interface ExamRecordListItem {
  id: string;
  title: string;
  totalScore: number;
  earnedScore: number;
  totalQuestions: number;
  submittedAt: string | null;
  status: ExamRecordStatus;
}

export interface ExamRecordDetail extends ExamRecord {
  questions: ExamQuestion[];
  scoreConfig: MockExamScoreConfig;
}

export interface StartExamResult {
  recordId: string;
  paper: GeneratePaperResult;
}

export interface SelfRateResult {
  record: ExamRecordDetail;
  questionScore: number;
}
