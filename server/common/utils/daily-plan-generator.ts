import { calculatePriorityScore, calculateQuestionPriorityScore } from './review-algorithm';
import type { KnowledgePoint, ExamQuestion, WrongQuestion, UserSetting, QuestionType } from '../../shared/api.interface';

const SUBJECTIVE_TYPES: QuestionType[] = ['noun_explanation', 'short_answer', 'essay'];

const QUESTION_ESTIMATED_MINUTES: Record<QuestionType, number> = {
  noun_explanation: 8,
  short_answer: 15,
  essay: 20,
  multiple_choice: 3,
  fill_blank: 3,
  other: 5,
};

const DEFAULT_KP_PER_SUBJECT = 10;
const DEFAULT_QUESTIONS_PER_SUBJECT = 3;

export interface PlanItem {
  itemType: 'new_learning' | 'scheduled_review' | 'question_test' | 'wrong_question' | 'manual';
  knowledgePointId?: string;
  questionId?: string;
  priorityScore: number;
  estimatedMinutes: number;
  reason: string;
}

export interface GeneratePlanInput {
  knowledgePoints: KnowledgePoint[];
  questions: ExamQuestion[];
  wrongQuestions: WrongQuestion[];
  questionKpMap: Map<string, string[]>;
  kpWrongCountMap: Map<string, number>;
  questionLastReviewedMap: Map<string, string | null>;
  settings: UserSetting;
  existingCompletedItemKpIds: Set<string>;
  existingCompletedItemQIds: Set<string>;
  recentSeenKpIds: Set<string>;
  recentSeenQIds: Set<string>;
}

function getKpQuotaPerSubject(settings: UserSetting, subjectId: string): number {
  const cfg = settings.dailyKpConfig ?? {};
  const val = cfg[subjectId];
  if (typeof val === 'number' && val >= 0) return val;
  return DEFAULT_KP_PER_SUBJECT;
}

function getQuestionsPerSubject(settings: UserSetting, subjectId: string): number {
  const cfg = settings.dailyQuestionConfig ?? {};
  const val = cfg[subjectId];
  if (typeof val === 'number' && val >= 0) return val;
  return DEFAULT_QUESTIONS_PER_SUBJECT;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateDailyPlanItems(input: GeneratePlanInput): PlanItem[] {
  const {
    knowledgePoints,
    questions,
    wrongQuestions,
    questionKpMap,
    kpWrongCountMap,
    questionLastReviewedMap,
    settings,
    existingCompletedItemKpIds,
    existingCompletedItemQIds,
    recentSeenKpIds,
    recentSeenQIds,
  } = input;

  const now = new Date();
  const items: PlanItem[] = [];

  const isOverdue = (kp: KnowledgePoint): boolean => {
    if (!kp.nextReviewAt) return false;
    return new Date(kp.nextReviewAt).getTime() < now.getTime();
  };

  const isDueToday = (kp: KnowledgePoint): boolean => {
    if (!kp.nextReviewAt) return false;
    const d = new Date(kp.nextReviewAt);
    return d.toDateString() === now.toDateString();
  };

  const reviewDueKps = knowledgePoints.filter(
    (kp) =>
      (isDueToday(kp) || isOverdue(kp)) &&
      !existingCompletedItemKpIds.has(kp.id)
  );

  const pickWithCooldown = <T>(
    all: T[],
    getId: (t: T) => string,
    recentlySeen: Set<string>,
    quota: number
  ): T[] => {
    const fresh: T[] = [];
    const cooled: T[] = [];
    for (const t of all) {
      if (recentlySeen.has(getId(t))) cooled.push(t);
      else fresh.push(t);
    }
    if (fresh.length >= quota) return fresh.slice(0, quota);
    return [...fresh, ...cooled.slice(0, quota - fresh.length)];
  };

  const kpSettings = {
    kpWeightSyllabus: settings.kpWeightSyllabus,
    kpWeightExamFreq: settings.kpWeightExamFreq,
    kpWeightMastery: settings.kpWeightMastery,
    kpWeightForgetting: settings.kpWeightForgetting,
    kpWeightWrong: settings.kpWeightWrong,
    kpWeightOverdue: settings.kpWeightOverdue,
  };

  const newLearningCandidates = knowledgePoints
    .filter((kp) => kp.status === 'not_started' && !existingCompletedItemKpIds.has(kp.id))
    .sort((a, b) => {
      const pa = calculatePriorityScore({
        requirementLevel: a.requirementLevel,
        examFrequency: a.examFrequency,
        masteryScore: a.masteryScore,
        lastReviewedAt: a.lastReviewedAt ? new Date(a.lastReviewedAt) : null,
        reviewStage: a.reviewStage,
        wrongCount: kpWrongCountMap.get(a.id) || 0,
        nextReviewAt: a.nextReviewAt ? new Date(a.nextReviewAt) : null,
        settings: kpSettings,
      });
      const pb = calculatePriorityScore({
        requirementLevel: b.requirementLevel,
        examFrequency: b.examFrequency,
        masteryScore: b.masteryScore,
        lastReviewedAt: b.lastReviewedAt ? new Date(b.lastReviewedAt) : null,
        reviewStage: b.reviewStage,
        wrongCount: kpWrongCountMap.get(b.id) || 0,
        nextReviewAt: b.nextReviewAt ? new Date(b.nextReviewAt) : null,
        settings: kpSettings,
      });
      const aBoost = a.isWeakMarked ? 10 : 0;
      const bBoost = b.isWeakMarked ? 10 : 0;
      return (pb + bBoost) - (pa + aBoost);
    });

  const newLearningBySubject = new Map<string, KnowledgePoint[]>();
  for (const kp of newLearningCandidates) {
    const arr = newLearningBySubject.get(kp.subjectId) ?? [];
    arr.push(kp);
    newLearningBySubject.set(kp.subjectId, arr);
  }

  const reviewBySubject = new Map<string, KnowledgePoint[]>();
  for (const kp of reviewDueKps) {
    const arr = reviewBySubject.get(kp.subjectId) ?? [];
    arr.push(kp);
    reviewBySubject.set(kp.subjectId, arr);
  }

  const allSubjectIds = new Set([
    ...newLearningBySubject.keys(),
    ...reviewBySubject.keys(),
  ]);

  const kpItems: PlanItem[] = [];

    for (const subjectId of allSubjectIds) {
    const quota = getKpQuotaPerSubject(settings, subjectId);
    if (quota <= 0) continue;

    const reviews = reviewBySubject.get(subjectId) ?? [];
    const newLearnsRaw = newLearningBySubject.get(subjectId) ?? [];
    const newLearns = pickWithCooldown(newLearnsRaw, k => k.id, recentSeenKpIds, quota * 2);

    const subjectKpItems: PlanItem[] = [];

    for (const kp of reviews) {
      const wrongCount = kpWrongCountMap.get(kp.id) || 0;
      const priority = calculatePriorityScore({
        requirementLevel: kp.requirementLevel,
        examFrequency: kp.examFrequency,
        masteryScore: kp.masteryScore,
        lastReviewedAt: kp.lastReviewedAt ? new Date(kp.lastReviewedAt) : null,
        reviewStage: kp.reviewStage,
        wrongCount,
        nextReviewAt: kp.nextReviewAt ? new Date(kp.nextReviewAt) : null,
        settings: {
          kpWeightSyllabus: settings.kpWeightSyllabus,
          kpWeightExamFreq: settings.kpWeightExamFreq,
          kpWeightMastery: settings.kpWeightMastery,
          kpWeightForgetting: settings.kpWeightForgetting,
          kpWeightWrong: settings.kpWeightWrong,
          kpWeightOverdue: settings.kpWeightOverdue,
        },
        examMode: settings.examMode,
        daysToExam: settings.examDate
          ? Math.ceil((new Date(settings.examDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 365,
      });
      const boost = kp.isWeakMarked ? 10 : 0;
      subjectKpItems.push({
        itemType: 'scheduled_review',
        knowledgePointId: kp.id,
        priorityScore: priority + boost,
        estimatedMinutes: 10,
        reason: isOverdue(kp) ? '逾期复习' : '今日到期复习',
      });
    }

    for (const kp of newLearns) {
      const priority = calculatePriorityScore({
        requirementLevel: kp.requirementLevel,
        examFrequency: kp.examFrequency,
        masteryScore: kp.masteryScore,
        lastReviewedAt: kp.lastReviewedAt ? new Date(kp.lastReviewedAt) : null,
        reviewStage: kp.reviewStage,
        wrongCount: kpWrongCountMap.get(kp.id) || 0,
        nextReviewAt: kp.nextReviewAt ? new Date(kp.nextReviewAt) : null,
        settings: kpSettings,
        examMode: settings.examMode,
        daysToExam: settings.examDate
          ? Math.ceil((new Date(settings.examDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 365,
      });
      subjectKpItems.push({
        itemType: 'new_learning',
        knowledgePointId: kp.id,
        priorityScore: kp.isWeakMarked ? Math.min(100, priority + 10) : priority,
        estimatedMinutes: 20,
        reason: `大纲要求"${kp.requirementLevel === 'unmarked' ? '未标注' : kp.requirementLevel}" · ${kp.examFrequency}次真题`,
      });
    }

    subjectKpItems.sort((a, b) => b.priorityScore - a.priorityScore);
    kpItems.push(...subjectKpItems.slice(0, quota));
  }

  items.push(...kpItems);

  const subjectiveQuestions = questions.filter((q) =>
    SUBJECTIVE_TYPES.includes(q.questionType)
  );

  const questionsBySubject = new Map<string, ExamQuestion[]>();
  for (const q of subjectiveQuestions) {
    const arr = questionsBySubject.get(q.subjectId) ?? [];
    arr.push(q);
    questionsBySubject.set(q.subjectId, arr);
  }

  const nowMs = now.getTime();
  const daysSinceReview = (q: ExamQuestion): number => {
    const last = questionLastReviewedMap.get(q.id);
    if (!last) return Infinity;
    const diff = nowMs - new Date(last).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const kpFreqMap = new Map<string, number>();
  for (const kp of knowledgePoints) {
    kpFreqMap.set(kp.id, kp.examFrequency ?? 0);
  }
  const questionMaxFreq = (q: ExamQuestion): number => {
    const kpIds = questionKpMap.get(q.id) ?? [];
    let max = 0;
    for (const kpId of kpIds) {
      const f = kpFreqMap.get(kpId) ?? 0;
      if (f > max) max = f;
    }
    return max;
  };

  for (const [subjectId, subjectQuestions] of questionsBySubject) {
    const quota = getQuestionsPerSubject(settings, subjectId);
    if (quota <= 0) continue;

    const available = subjectQuestions.filter(
      (q) => !existingCompletedItemQIds.has(q.id) && (q.masteryScore ?? 0) < 90
    );

    const freshQuestions = available.filter(q => !recentSeenQIds.has(q.id));
    const cooledQuestions = available.filter(q => recentSeenQIds.has(q.id));

    const qSettings = {
      qWeightExamFreq: settings.qWeightExamFreq,
      qWeightMastery: settings.qWeightMastery,
      qWeightWrong: settings.qWeightWrong,
      qWeightOverdue: settings.qWeightOverdue,
      qWeightDifficulty: settings.qWeightDifficulty,
    };

    const qWrongMap = new Map<string, number>();
    for (const w of wrongQuestions) {
      if (!w.questionId) continue;
      qWrongMap.set(w.questionId, (qWrongMap.get(w.questionId) ?? 0) + w.wrongCount);
    }

    const sortedFresh = [...freshQuestions].sort((a, b) => {
      const freqA = questionMaxFreq(a);
      const freqB = questionMaxFreq(b);
      const pa = calculateQuestionPriorityScore({
        examFrequency: freqA,
        masteryScore: a.masteryScore ?? 0,
        wrongCount: qWrongMap.get(a.id) ?? 0,
        nextReviewAt: null,
        lastReviewedAt: questionLastReviewedMap.get(a.id)
          ? new Date(questionLastReviewedMap.get(a.id) as string)
          : null,
        difficulty: a.difficulty ?? 0,
        settings: qSettings,
      });
      const pb = calculateQuestionPriorityScore({
        examFrequency: freqB,
        masteryScore: b.masteryScore ?? 0,
        wrongCount: qWrongMap.get(b.id) ?? 0,
        nextReviewAt: null,
        lastReviewedAt: questionLastReviewedMap.get(b.id)
          ? new Date(questionLastReviewedMap.get(b.id) as string)
          : null,
        difficulty: b.difficulty ?? 0,
        settings: qSettings,
      });
      return pb - pa;
    });

    let picked: ExamQuestion[] = [];
    if (sortedFresh.length >= quota) {
      picked = sortedFresh.slice(0, quota);
    } else {
      const sortedCooled = [...cooledQuestions].sort((a, b) => {
        const freqA = questionMaxFreq(a);
        const freqB = questionMaxFreq(b);
        const pa = calculateQuestionPriorityScore({
          examFrequency: freqA,
          masteryScore: a.masteryScore ?? 0,
          wrongCount: qWrongMap.get(a.id) ?? 0,
          nextReviewAt: null,
          lastReviewedAt: questionLastReviewedMap.get(a.id)
            ? new Date(questionLastReviewedMap.get(a.id) as string)
            : null,
          difficulty: a.difficulty ?? 0,
          settings: qSettings,
        });
        const pb = calculateQuestionPriorityScore({
          examFrequency: freqB,
          masteryScore: b.masteryScore ?? 0,
          wrongCount: qWrongMap.get(b.id) ?? 0,
          nextReviewAt: null,
          lastReviewedAt: questionLastReviewedMap.get(b.id)
            ? new Date(questionLastReviewedMap.get(b.id) as string)
            : null,
          difficulty: b.difficulty ?? 0,
          settings: qSettings,
        });
        return pb - pa;
      });
      picked = [...sortedFresh, ...sortedCooled.slice(0, quota - sortedFresh.length)];
    }

    for (const q of picked) {
      const kpIds = questionKpMap.get(q.id);
      const primaryKpId = kpIds && kpIds.length > 0 ? kpIds[0] : undefined;
      const est = QUESTION_ESTIMATED_MINUTES[q.questionType] ?? 10;
      const freq = questionMaxFreq(q);
      const wrongCnt = qWrongMap.get(q.id) ?? 0;
      const score = calculateQuestionPriorityScore({
        examFrequency: freq,
        masteryScore: q.masteryScore ?? 0,
        wrongCount: wrongCnt,
        nextReviewAt: null,
        lastReviewedAt: questionLastReviewedMap.get(q.id)
          ? new Date(questionLastReviewedMap.get(q.id) as string)
          : null,
        difficulty: q.difficulty ?? 0,
        settings: qSettings,
      });
      const reason = `高频题 · ${freq}次考频 · 难度${q.difficulty ?? 0}`;
      items.push({
        itemType: 'question_test',
        questionId: q.id,
        knowledgePointId: primaryKpId,
        priorityScore: score,
        estimatedMinutes: est,
        reason,
      });
    }
  }

  items.sort((a, b) => b.priorityScore - a.priorityScore);

  return items.map((item, index) => ({
    ...item,
    sortOrder: index,
  })) as (PlanItem & { sortOrder: number })[];
}
