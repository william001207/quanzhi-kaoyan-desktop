export const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30, 60, 90];

export const REQUIREMENT_LEVEL_WEIGHT: Record<string, number> = {
  master: 1.0,
  familiar: 0.7,
  understand: 0.4,
  unmarked: 0,
};

export const MAX_EXAM_FREQ = 50;

export interface ReviewInput {
  currentMastery: number;
  currentStage: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  selfRating: 'again' | 'hard' | 'good' | 'easy';
  examMode?: boolean;
  daysToExam?: number;
}

export interface ReviewResult {
  newMastery: number;
  newStage: number;
  nextReviewAt: Date;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  status: 'weak' | 'medium' | 'familiar' | 'mastered';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function statusFromMastery(mastery: number): ReviewResult['status'] {
  if (mastery >= 90) return 'mastered';
  if (mastery >= 70) return 'familiar';
  if (mastery >= 40) return 'medium';
  return 'weak';
}

export function calcKnowledgePointStatus(
  totalReviewCount: number,
  answeredQuestionCount: number,
  masteryScore: number,
  recallMastery: number,
  questionMastery: number,
): 'not_started' | 'weak' | 'medium' | 'familiar' | 'mastered' {
  if (
    totalReviewCount === 0 &&
    answeredQuestionCount === 0 &&
    recallMastery === 0 &&
    questionMastery === 0
  ) return 'not_started';
  if (masteryScore >= 90) return 'mastered';
  if (masteryScore >= 70) return 'familiar';
  if (masteryScore >= 40) return 'medium';
  return 'weak';
}

export function calculateReviewResult(input: ReviewInput): ReviewResult {
  const { currentMastery, currentStage, consecutiveCorrect, consecutiveWrong, selfRating } = input;

  let masteryDelta = 0;
  let stageDelta = 0;
  let daysToNext = 1;
  let newConsecutiveCorrect = consecutiveCorrect;
  let newConsecutiveWrong = consecutiveWrong;

  switch (selfRating) {
    case 'again':
      masteryDelta = -Math.max(10, currentMastery * 0.25);
      stageDelta = -Math.min(1, currentStage);
      daysToNext = 1;
      newConsecutiveCorrect = 0;
      newConsecutiveWrong = consecutiveWrong + 1;
      break;
    case 'hard':
      masteryDelta = currentMastery < 70 ? 4 : 0;
      stageDelta = 0;
      daysToNext = Math.max(2, Math.floor(REVIEW_INTERVALS[Math.max(0, currentStage)] * 0.6));
      newConsecutiveCorrect = 0;
      newConsecutiveWrong = consecutiveWrong + 1;
      break;
    case 'good':
      masteryDelta = 10 + consecutiveCorrect * 2;
      stageDelta = 1;
      daysToNext = REVIEW_INTERVALS[Math.min(REVIEW_INTERVALS.length - 1, currentStage + 1)] || 90;
      newConsecutiveCorrect = consecutiveCorrect + 1;
      newConsecutiveWrong = 0;
      break;
    case 'easy':
      masteryDelta = 15 + consecutiveCorrect * 3;
      stageDelta = 2;
      const nextStage = Math.min(REVIEW_INTERVALS.length - 1, currentStage + 2);
      daysToNext = Math.floor(REVIEW_INTERVALS[nextStage] * 1.3);
      newConsecutiveCorrect = consecutiveCorrect + 1;
      newConsecutiveWrong = 0;
      break;
  }

  const newMastery = clamp(Math.round(currentMastery + masteryDelta), 0, 100);
  const newStage = clamp(currentStage + stageDelta, 0, REVIEW_INTERVALS.length - 1);

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + daysToNext);
  nextReviewAt.setHours(6, 0, 0, 0);

  return {
    newMastery,
    newStage,
    nextReviewAt,
    consecutiveCorrect: newConsecutiveCorrect,
    consecutiveWrong: newConsecutiveWrong,
    status: statusFromMastery(newMastery),
  };
}

export interface QuestionResultInput {
  currentMastery: number;
  currentStage: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  questionScore: number;
  totalReviewCount: number;
}

export function calculateQuestionResult(input: QuestionResultInput): ReviewResult {
  const { currentMastery, currentStage, consecutiveCorrect, consecutiveWrong, questionScore } = input;

  let selfRating: ReviewInput['selfRating'];
  if (questionScore >= 80) {
    selfRating = 'easy';
  } else if (questionScore >= 60) {
    selfRating = 'good';
  } else if (questionScore >= 30) {
    selfRating = 'hard';
  } else {
    selfRating = 'again';
  }

  const baseResult = calculateReviewResult({
    currentMastery,
    currentStage,
    consecutiveCorrect,
    consecutiveWrong,
    selfRating,
  });

  if (questionScore < 60) {
    baseResult.newMastery = clamp(baseResult.newMastery - 5, 0, 100);
  }

  return baseResult;
}

export function calculateQuestionMastery(score: number): number {
  return clamp(Math.round(score), 0, 100);
}

export function calcOverallMastery(
  recallMastery: number,
  questionMastery: number,
  answeredQuestionCount: number,
): number {
  const hasRecall = recallMastery > 0;
  const hasQuestion = answeredQuestionCount > 0;

  if (hasRecall && hasQuestion) {
    return Math.round(recallMastery * 0.5 + questionMastery * 0.5);
  }
  if (hasQuestion) {
    return questionMastery;
  }
  return recallMastery;
}

export interface PriorityInput {
  requirementLevel: string;
  examFrequency: number;
  masteryScore: number;
  lastReviewedAt: Date | null;
  reviewStage: number;
  wrongCount: number;
  nextReviewAt: Date | null;
  settings?: {
    kpWeightSyllabus: number;
    kpWeightExamFreq: number;
    kpWeightMastery: number;
    kpWeightForgetting: number;
    kpWeightWrong: number;
    kpWeightOverdue: number;
  };
  examMode?: boolean;
  daysToExam?: number;
}

export interface QuestionPriorityInput {
  examFrequency: number;
  masteryScore: number;
  wrongCount: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
  difficulty: number;
  settings?: {
    qWeightExamFreq: number;
    qWeightMastery: number;
    qWeightWrong: number;
    qWeightOverdue: number;
    qWeightDifficulty: number;
  };
}

export function calculatePriorityScore(input: PriorityInput): number {
  const {
    requirementLevel,
    examFrequency,
    masteryScore,
    lastReviewedAt,
    reviewStage,
    wrongCount,
    nextReviewAt,
    settings = {
      kpWeightSyllabus: 30,
      kpWeightExamFreq: 20,
      kpWeightMastery: 20,
      kpWeightForgetting: 15,
      kpWeightWrong: 10,
      kpWeightOverdue: 5,
    },
    examMode,
    daysToExam = 999,
  } = input;

  const syllabusScore = (REQUIREMENT_LEVEL_WEIGHT[requirementLevel] ?? 0) * 100;

  const freqNormalized = Math.min(100, (examFrequency / MAX_EXAM_FREQ) * 100);

  const masteryScoreInv = 100 - masteryScore;

  let forgettingScore = 0;
  if (lastReviewedAt) {
    const daysSince = Math.floor((Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24));
    const stageInterval = REVIEW_INTERVALS[reviewStage] || 7;
    const ratio = Math.min(2, daysSince / Math.max(1, stageInterval));
    forgettingScore = ratio * 50;
  } else {
    forgettingScore = 100;
  }

  const wrongScore = Math.min(100, wrongCount * 25);

  let overdueScore = 0;
  if (nextReviewAt) {
    const now = new Date();
    const daysOverdue = Math.floor((now.getTime() - nextReviewAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > 0) {
      overdueScore = Math.min(100, daysOverdue * 20);
    }
  }

  let totalWeight =
    settings.kpWeightSyllabus +
    settings.kpWeightExamFreq +
    settings.kpWeightMastery +
    settings.kpWeightForgetting +
    settings.kpWeightWrong +
    settings.kpWeightOverdue;

  let weightedScore =
    (syllabusScore * settings.kpWeightSyllabus) / totalWeight +
    (freqNormalized * settings.kpWeightExamFreq) / totalWeight +
    (masteryScoreInv * settings.kpWeightMastery) / totalWeight +
    (forgettingScore * settings.kpWeightForgetting) / totalWeight +
    (wrongScore * settings.kpWeightWrong) / totalWeight +
    (overdueScore * settings.kpWeightOverdue) / totalWeight;

  if (examMode && daysToExam <= 30) {
    const examBoost = (1 - daysToExam / 30) * 20;
    weightedScore += examBoost;
    weightedScore += (freqNormalized * examBoost) / 100;
  }

  return Math.round(clamp(weightedScore, 0, 100));
}

export function calculateQuestionPriorityScore(
  input: QuestionPriorityInput,
): number {
  const {
    examFrequency,
    masteryScore,
    wrongCount,
    nextReviewAt,
    difficulty,
    settings = {
      qWeightExamFreq: 30,
      qWeightMastery: 25,
      qWeightWrong: 20,
      qWeightOverdue: 10,
      qWeightDifficulty: 15,
    },
  } = input;

  const freqNormalized = Math.min(100, (examFrequency / MAX_EXAM_FREQ) * 100);
  const masteryScoreInv = 100 - masteryScore;
  const wrongScore = Math.min(100, wrongCount * 25);
  const difficultyScore = Math.min(100, difficulty * 20);

  let overdueScore = 0;
  if (nextReviewAt) {
    const now = new Date();
    const daysOverdue = Math.floor(
      (now.getTime() - nextReviewAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOverdue > 0) {
      overdueScore = Math.min(100, daysOverdue * 20);
    }
  }

  const totalWeight =
    settings.qWeightExamFreq +
    settings.qWeightMastery +
    settings.qWeightWrong +
    settings.qWeightOverdue +
    settings.qWeightDifficulty;

  if (totalWeight === 0) return 0;

  const weightedScore =
    (freqNormalized * settings.qWeightExamFreq) / totalWeight +
    (masteryScoreInv * settings.qWeightMastery) / totalWeight +
    (wrongScore * settings.qWeightWrong) / totalWeight +
    (overdueScore * settings.qWeightOverdue) / totalWeight +
    (difficultyScore * settings.qWeightDifficulty) / totalWeight;

  return Math.round(clamp(weightedScore, 0, 100));
}
