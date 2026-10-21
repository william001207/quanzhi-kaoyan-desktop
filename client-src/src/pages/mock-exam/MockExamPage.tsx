import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import type {
  ExamRecordDetail,
  ExamSelfRating,
  Subject,
  MockExamScoreConfig,
} from '@shared/api.interface';
import {
  QUESTION_TYPE_LABEL,
  DEFAULT_MOCK_EXAM_SCORE_CONFIG,
} from '@shared/api.interface';

function getQuestionScore(
  scoreConfig: MockExamScoreConfig | undefined,
  questionType: string,
): number {
  if (scoreConfig && scoreConfig[questionType as keyof MockExamScoreConfig] !== undefined) {
    return scoreConfig[questionType as keyof MockExamScoreConfig]!;
  }
  return (
    DEFAULT_MOCK_EXAM_SCORE_CONFIG[questionType as keyof MockExamScoreConfig] || 0
  );
}

const SELF_RATING_OPTIONS: Array<{
  key: ExamSelfRating;
  label: string;
  scorePct: number;
  className: string;
}> = [
  {
    key: 'again',
    label: '完全不会',
    scorePct: 0,
    className:
      'border-red-300 text-red-600 hover:bg-red-50 hover:text-red-600 data-[active=true]:bg-red-100 data-[active=true]:border-red-400 data-[active=true]:text-red-700',
  },
  {
    key: 'partial',
    label: '部分正确',
    scorePct: 40,
    className:
      'border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-600 data-[active=true]:bg-amber-100 data-[active=true]:border-amber-400 data-[active=true]:text-amber-700',
  },
  {
    key: 'basic',
    label: '基本正确',
    scorePct: 70,
    className:
      'border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-600 data-[active=true]:bg-blue-100 data-[active=true]:border-blue-400 data-[active=true]:text-blue-700',
  },
  {
    key: 'full',
    label: '完全正确',
    scorePct: 100,
    className:
      'border-green-500 text-green-700 hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-500 data-[active=true]:text-white',
  },
];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}分${s}秒`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}小时${mm}分`;
}

const MockExamPage: React.FC = () => {
  const { recordId } = useParams<{ recordId: string }>();
  const [record, setRecord] = useState<ExamRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAnswerMap, setShowAnswerMap] = useState<Record<string, boolean>>(
    {},
  );
  const [timeLeft, setTimeLeft] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchParams] = useSearchParams();
  const isReadOnlyReview = searchParams.get('review') === '1';
  const [ratingLoading, setRatingLoading] = useState<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载记录
  useEffect(() => {
    if (!recordId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [recordData, subjectsData] = await Promise.all([
          api.mockExam.getRecord(recordId),
          api.subjects.getAll().catch(() => []),
        ]);
        setRecord(recordData);
        setSubjects(subjectsData);
        setAnswers(recordData.answers || {});
        if (recordData.status === 'in_progress') {
          const totalMin = recordData.totalDurationSeconds
            ? recordData.totalDurationSeconds
            : (recordData.questions?.length || 0) * 15;
          const elapsed = recordData.startedAt
            ? Math.floor((Date.now() - new Date(recordData.startedAt).getTime()) / 1000)
            : 0;
          const estSeconds =
            recordData.totalDurationSeconds > 0
              ? recordData.totalDurationSeconds
              : totalMin;
          setElapsedSeconds(Math.min(elapsed, estSeconds));
          setTimeLeft(Math.max(0, estSeconds - elapsed));
          startTimeRef.current = Date.now() - elapsed * 1000;
        }
      } catch (err) {
        logger.error('加载考试记录失败', err);
        toast.error('加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [recordId]);

  // 倒计时
  useEffect(() => {
    if (!record || record.status !== 'in_progress') return;
    const timer = setInterval(() => {
      const elapsed = Math.floor(
        (Date.now() - startTimeRef.current) / 1000,
      );
      setElapsedSeconds(elapsed);
      const total = record.totalDurationSeconds || 0;
      if (total > 0) {
        setTimeLeft(Math.max(0, total - elapsed));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [record]);

  const questions = record?.questions || [];
  const currentQuestion = questions[currentIndex];
  const isSubmitted = record?.status === 'submitted';
  const isReviewMode = isSubmitted && isReadOnlyReview;

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((a) => a && a.trim().length > 0)
      .length;
  }, [answers]);

  const unansweredCount = questions.length - answeredCount;

  const getSubjectName = useCallback(
    (subjectId: string) => {
      return subjects.find((s) => s.id === subjectId)?.name || subjectId;
    },
    [subjects],
  );

  const handleAnswerChange = (value: string) => {
    if (!currentQuestion || !recordId || isSubmitted) return;
    const qid = currentQuestion.id;
    setAnswers((prev) => ({ ...prev, [qid]: value }));

    // 防抖暂存
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await api.mockExam.saveAnswer(recordId, qid, value);
      } catch (err) {
        logger.error('暂存答案失败', err);
      }
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleShowAnswer = (qid: string) => {
    setShowAnswerMap((prev) => ({ ...prev, [qid]: !prev[qid] }));
  };

  const goPrev = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
  };

  const handleSubmit = async () => {
    if (!recordId) return;
    setSubmitting(true);
    try {
      const duration =
        record?.totalDurationSeconds && record.totalDurationSeconds > 0
          ? Math.min(elapsedSeconds, record.totalDurationSeconds)
          : elapsedSeconds;
      const result = await api.mockExam.submitExam(
        recordId,
        answers,
        Math.max(duration, 1),
      );
      setRecord(result);
      setAnswers(result.answers || {});
      setSubmitDialogOpen(false);
      toast.success('交卷成功！');
      // 跳转到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      logger.error('交卷失败', err);
      toast.error('交卷失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelfRate = async (questionId: string, rating: ExamSelfRating) => {
    if (!recordId || isReviewMode) return;
    setRatingLoading(questionId);
    try {
      const question = questions.find((q) => q.id === questionId);
      const kpIds = question?.knowledgePoints?.map((kp) => kp.id);
      const addToWrong = rating === 'again' || rating === 'partial';
      const result = await api.mockExam.selfRate(recordId, {
        questionId,
        rating,
        addToWrong,
        knowledgePointIds: kpIds,
      });
      setRecord(result.record);
      toast.success('自评已保存');
    } catch (err) {
      logger.error('自评失败', err);
      toast.error('自评失败，请重试');
    } finally {
      setRatingLoading(null);
    }
  };

  // 成绩报告统计
  const bySubjectStats = useMemo(() => {
    if (!record) return [];
    const map = new Map<
      string,
      { subjectId: string; subjectName: string; total: number; earned: number }
    >();
    for (const q of record.questions) {
      const sid = q.subjectId;
      const full = getQuestionScore(record.scoreConfig, q.questionType);
      const earned = record.scores[q.id] || 0;
      const existing = map.get(sid);
      if (existing) {
        existing.total += full;
        existing.earned += earned;
      } else {
        map.set(sid, {
          subjectId: sid,
          subjectName: getSubjectName(sid),
          total: full,
          earned: earned,
        });
      }
    }
    return Array.from(map.values());
  }, [record, getSubjectName]);

  const byTypeStats = useMemo(() => {
    if (!record) return [];
    const map = new Map<
      string,
      { type: string; total: number; earned: number; count: number }
    >();
    for (const q of record.questions) {
      const t = q.questionType;
      const full = getQuestionScore(record.scoreConfig, q.questionType);
      const earned = record.scores[q.id] || 0;
      const existing = map.get(t);
      if (existing) {
        existing.total += full;
        existing.earned += earned;
        existing.count += 1;
      } else {
        map.set(t, { type: t, total: full, earned, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [record]);

  const weakQuestions = useMemo(() => {
    if (!record) return [];
    return record.questions.filter((q) => {
      const full = getQuestionScore(record.scoreConfig, q.questionType) || 1;
      const earned = record.scores[q.id] || 0;
      return earned / full < 0.6;
    });
  }, [record]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!record || questions.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        未找到考试记录
      </div>
    );
  }

  // === 成绩报告模式 ===
  if (isSubmitted) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* 成绩概览卡片 */}
        <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
          <CardContent className="pt-6">
            <div className="text-center py-4">
              <div className="text-sm text-muted-foreground mb-1">
                {record.title}
              </div>
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-bold text-indigo-600">
                  {record.earnedScore}
                </span>
                <span className="text-xl text-muted-foreground">
                  / {record.totalScore}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                得分率{' '}
                {Math.round(
                  (record.earnedScore / record.totalScore) * 100,
                ) || 0}
                %
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-sm text-muted-foreground">
                <span>共 {record.totalQuestions} 题</span>
                <span>
                  用时{' '}
                  {formatDuration(record.totalDurationSeconds || 0)}
                </span>
              </div>
            </div>
            <Progress
              value={(record.earnedScore / record.totalScore) * 100 || 0}
              className="h-2"
            />
          </CardContent>
        </Card>

        {/* 按科目 & 按题型 */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">按科目得分</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bySubjectStats.map((s) => (
                <div key={s.subjectId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="truncate mr-2">{s.subjectName}</span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {s.earned} / {s.total}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{
                        width: s.total > 0 ? `${(s.earned / s.total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">按题型得分</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byTypeStats.map((t) => (
                <div key={t.type}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>
                      {QUESTION_TYPE_LABEL[t.type as keyof typeof QUESTION_TYPE_LABEL] || t.type}
                      <span className="text-muted-foreground ml-1">
                        ({t.count}题)
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {t.earned} / {t.total}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: t.total > 0 ? `${(t.earned / t.total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* 未掌握题清单 */}
        {weakQuestions.length > 0 && (
          <Card className="border-red-100 bg-red-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                未掌握题（{weakQuestions.length} 道）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {weakQuestions.map((q) => {
                const idx = questions.findIndex((qq) => qq.id === q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowAnswerMap((prev) => ({ ...prev, [q.id]: true }));
                      document
                        .getElementById(`question-${q.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full text-left text-sm p-2 rounded hover:bg-red-100/50 transition-colors"
                  >
                    <span className="text-red-600 font-medium mr-2">
                      第{idx + 1}题
                    </span>
                    <span className="truncate">{q.questionText.slice(0, 50)}...</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* 逐题对照 */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">逐题对照</h2>
           {questions.map((q, idx) => {
             const full = getQuestionScore(record.scoreConfig, q.questionType);
             const earned = record.scores[q.id] || 0;
            const pct = full > 0 ? (earned / full) * 100 : 0;
            const rating = record.selfRatings[q.id];
            const added = record.addedToWrong[q.id];
            const showAnswer = !!showAnswerMap[q.id];

            return (
              <Card key={q.id} id={`question-${q.id}`} className="scroll-mt-4">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        第 {idx + 1} 题
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {QUESTION_TYPE_LABEL[q.questionType as keyof typeof QUESTION_TYPE_LABEL] ||
                          q.questionType}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {full} 分
                      </span>
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        pct >= 60 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {earned} / {full}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                    <span>{q.year} 年</span>
                    {q.source && <span>{q.source}</span>}
                    <span>{getSubjectName(q.subjectId)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-base leading-relaxed whitespace-pre-wrap font-medium">
                    {q.questionText}
                  </div>

                  {/* 我的作答 */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      我的作答
                    </h4>
                    <div className="p-3 rounded-md border bg-background text-sm whitespace-pre-wrap leading-relaxed">
                      {answers[q.id] || '（未作答）'}
                    </div>
                  </div>

                  {/* 参考答案 - 可折叠 */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleShowAnswer(q.id)}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {showAnswer ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          收起参考答案
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          展开参考答案
                        </>
                      )}
                    </button>
                    {showAnswer && (
                      <div className="mt-2 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm whitespace-pre-wrap leading-relaxed">
                        {q.answer || '暂无参考答案'}
                      </div>
                    )}
                  </div>

                  {/* 自评 */}
                  {!isReviewMode || rating ? (
                    <div className="space-y-3 pt-2 border-t">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        自我评价
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SELF_RATING_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            disabled={
                              isReviewMode || ratingLoading === q.id
                            }
                            data-active={rating === opt.key}
                            onClick={() => handleSelfRate(q.id, opt.key)}
                            className={`px-2 py-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${opt.className}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={`wrong-${q.id}`}
                          checked={!!added}
                          disabled={true}
                        />
                        <label
                          htmlFor={`wrong-${q.id}`}
                          className="text-muted-foreground"
                        >
                          {added ? '已加入错题本' : '未加入错题本'}
                        </label>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // === 考试进行中模式 ===
  return (
    <div className="h-full flex flex-col bg-background min-h-0">
      {/* 顶部栏 */}
      <header className="border-b bg-background px-4 md:px-6 h-14 flex items-center shrink-0">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{record.title}</div>
        </div>
        <div
          className={`mx-4 font-mono font-semibold text-lg ${
            timeLeft <= 0 && record.totalDurationSeconds > 0
              ? 'text-red-600'
              : timeLeft <= 300
                ? 'text-amber-600'
                : 'text-foreground'
          }`}
        >
          <Clock className="h-4 w-4 inline mr-1 -mt-0.5" />
          {record.totalDurationSeconds > 0 ? (
            timeLeft <= 0 ? (
              <span className="text-red-600">时间已到</span>
            ) : (
              formatTime(timeLeft)
            )
          ) : (
            formatTime(elapsedSeconds)
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            已作答 {answeredCount}/{questions.length}
          </span>
          <Button
            size="sm"
            onClick={() => setSubmitDialogOpen(true)}
            disabled={submitting}
          >
            交卷
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧题号导航 - 桌面端 */}
        <aside className="hidden md:flex w-48 lg:w-56 border-r bg-muted/20 flex-col shrink-0">
          <div className="p-3 text-xs text-muted-foreground font-medium border-b">
            题目导航
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 grid grid-cols-5 gap-1.5">
              {questions.map((q, idx) => {
                const answered =
                  answers[q.id] && answers[q.id].trim().length > 0;
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`aspect-square rounded text-xs font-medium flex items-center justify-center transition-colors ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : answered
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
                          : 'bg-background border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {answered ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="p-3 text-xs text-muted-foreground border-t space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
              已作答
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-background border" />
              未作答
            </div>
          </div>
        </aside>

        {/* 移动端题号横排 */}
        <div className="md:hidden border-b bg-muted/20 px-3 py-2 overflow-x-auto shrink-0">
          <div className="flex gap-1.5">
            {questions.map((q, idx) => {
              const answered =
                answers[q.id] && answers[q.id].trim().length > 0;
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-8 h-8 rounded text-xs font-medium flex-shrink-0 flex items-center justify-center ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : answered
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-background border text-muted-foreground'
                  }`}
                >
                  {answered ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    idx + 1
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
            {currentQuestion && (
              <>
                {/* 题型 + 分值 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {QUESTION_TYPE_LABEL[
                      currentQuestion.questionType as keyof typeof QUESTION_TYPE_LABEL
                    ] || currentQuestion.questionType}
                  </Badge>
                   <span className="text-sm text-muted-foreground">
                     {getQuestionScore(record.scoreConfig, currentQuestion.questionType)} 分
                   </span>
                  <span className="text-sm text-muted-foreground">
                    第 {currentIndex + 1} / {questions.length} 题
                  </span>
                </div>

                {/* 年份/院校/科目 */}
                <div className="text-sm text-muted-foreground flex gap-3 flex-wrap">
                  <span>{currentQuestion.year} 年</span>
                  {currentQuestion.source && (
                    <span>{currentQuestion.source}</span>
                  )}
                  <span>{getSubjectName(currentQuestion.subjectId)}</span>
                </div>

                {/* 题干 */}
                <div className="text-lg md:text-xl font-semibold leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.questionText}
                </div>

                {/* 作答区 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    我的答案
                  </label>
                  <Textarea
                    placeholder="在这里写下你的答案..."
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="min-h-[200px] text-base leading-relaxed resize-y"
                  />
                  <div className="text-xs text-muted-foreground">
                    答案将自动保存
                  </div>
                </div>

                {/* 显示参考答案 */}
                {!showAnswerMap[currentQuestion.id] ? (
                  <Button
                    variant="outline"
                    onClick={() => toggleShowAnswer(currentQuestion.id)}
                    className="w-full"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    显示参考答案
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-emerald-700">
                      参考答案
                    </div>
                    <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-sm whitespace-pre-wrap leading-relaxed">
                      {currentQuestion.answer || '暂无参考答案'}
                    </div>
                  </div>
                )}

                {/* 上一题/下一题 */}
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={goPrev}
                    disabled={currentIndex === 0}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    上一题
                  </Button>
                  <Button onClick={goNext} disabled={currentIndex === questions.length - 1}>
                    下一题
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* 交卷确认弹窗 */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认交卷？</DialogTitle>
            <DialogDescription>
              {unansweredCount > 0 ? (
                <div className="flex items-start gap-2 text-amber-600 mt-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    还有 <strong>{unansweredCount}</strong> 题未作答，确认交卷后无法修改。
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-emerald-600 mt-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>所有题目均已作答，确认交卷？</span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              disabled={submitting}
            >
              继续答题
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '交卷中...' : '确认交卷'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MockExamPage;
