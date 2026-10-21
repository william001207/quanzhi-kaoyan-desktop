import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Eye, EyeOff, Pencil, Plus, ExternalLink, Layers, BookX, CheckCircle2, X, Search, ChevronDown, ChevronUp, Check, Trash2 } from 'lucide-react';
import * as api from '@/api';
import type { ExamQuestion, KnowledgePointCardData, WrongQuestionWithDetail, MistakeReason, Subject } from '@shared/api.interface';
import {
  QUESTION_TYPE_LABEL,
  MISTAKE_REASON_LABEL,
  QUESTION_STATUS_LABEL,
  getQuestionStatus,
} from '@shared/api.interface';
import KnowledgeCardView from '@/components/knowledge-card/KnowledgeCardView';
import QuestionCardEditor from '@/components/knowledge-card/QuestionCardEditor';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { QuestionDifficultyStars } from '@/components/question-difficulty';
import { statusBadgeClass } from '@/utils/mastery';
import { showConfirm } from '@lark-apaas/client-toolkit';

interface QuestionAnswerDialogProps {
  questionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
  mode?: 'normal' | 'redo';
  wrongQuestionId?: string | null;
  wrongQuestionData?: WrongQuestionWithDetail | null;
}

type SelfRatingKey = 'again' | 'partial' | 'basic' | 'perfect';

const SELF_RATING_OPTIONS: Array<{
  key: SelfRatingKey;
  label: string;
  score: number;
  variant: 'destructive' | 'outline' | 'secondary' | 'default';
  className: string;
}> = [
  {
    key: 'again',
    label: '完全不会',
    score: 0,
    variant: 'outline',
    className:
      'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-600 data-[active=true]:bg-red-100 data-[active=true]:border-red-300',
  },
  {
    key: 'partial',
    label: '部分正确',
    score: 40,
    variant: 'outline',
    className:
      'border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-600 data-[active=true]:bg-amber-100 data-[active=true]:border-amber-300',
  },
  {
    key: 'basic',
    label: '基本正确',
    score: 70,
    variant: 'outline',
    className:
      'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600 data-[active=true]:bg-emerald-100 data-[active=true]:border-emerald-300',
  },
  {
    key: 'perfect',
    label: '完全正确',
    score: 100,
    variant: 'outline',
    className:
      'border-green-600 text-green-700 hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-600 data-[active=true]:text-white',
  },
];

const QuestionAnswerDialog: React.FC<QuestionAnswerDialogProps> = ({
  questionId,
  open,
  onOpenChange,
  onSubmitted,
}) => {
  const [question, setQuestion] = useState<ExamQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [checkedKeywords, setCheckedKeywords] = useState<Set<number>>(
    new Set(),
  );
  const [editingCard, setEditingCard] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [editingQuestionText, setEditingQuestionText] = useState(false);
  const [questionTextDraft, setQuestionTextDraft] = useState('');
  const [savingQuestionText, setSavingQuestionText] = useState(false);

  const [showKeywords, setShowKeywords] = useState(true);
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [savingKeywords, setSavingKeywords] = useState(false);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newKeywordDraft, setNewKeywordDraft] = useState('');

  const [wrongQuestion, setWrongQuestion] = useState<WrongQuestionWithDetail | null>(null);
  const [wrongLoading, setWrongLoading] = useState(false);
  const [editingMistakeReason, setEditingMistakeReason] = useState(false);
  const [savingMistakeReason, setSavingMistakeReason] = useState(false);
  const [mistakeReasonDraft, setMistakeReasonDraft] = useState<string>('');
  const [showMasteredConfirm, setShowMasteredConfirm] = useState(false);
  const [masteredScore, setMasteredScore] = useState(0);

  const [kpDialogOpen, setKpDialogOpen] = useState(false);
  const [kpSearchKeyword, setKpSearchKeyword] = useState('');
  const [kpSearchSubjectId, setKpSearchSubjectId] = useState<string>('');
  const [kpSearchResults, setKpSearchResults] = useState<Array<{ id: string; title: string; subjectId: string; subjectName?: string; examFrequency: number }>>([]);
  const [kpSearching, setKpSearching] = useState(false);
  const [kpRemovingId, setKpRemovingId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    if (!open || !questionId) {
      return;
    }
    const load = async () => {
      setLoading(true);
      setQuestion(null);
      setUserAnswer('');
      setShowAnswer(false);
      setShowCard(false);
      setCheckedKeywords(new Set());
      setEditingCard(false);
      setEditingAnswer(false);
      setAnswerDraft('');
      setEditingQuestionText(false);
      setQuestionTextDraft('');
      setShowKeywords(true);
      setEditingKeywordIndex(null);
      setKeywordDraft('');
      setAddingKeyword(false);
      setNewKeywordDraft('');
      setWrongQuestion(null);
      setEditingMistakeReason(false);
      setMistakeReasonDraft('');
      setShowMasteredConfirm(false);
      try {
        const [data, wq, subjList] = await Promise.all([
          api.examQuestions.getById(questionId),
          api.wrongQuestions.getByQuestionId(questionId),
          api.subjects.getAll(),
        ]);
        setQuestion(data);
        setWrongQuestion(wq);
        setSubjects(subjList);
      } catch (err) {
        logger.error('加载题目详情失败', err);
        toast.error('加载题目详情失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, questionId]);

  useEffect(() => {
    if (!kpDialogOpen) {
      setKpSearchKeyword('');
      setKpSearchResults([]);
      return;
    }
    if (question) {
      setKpSearchSubjectId(question.subjectId);
    }
  }, [kpDialogOpen, question]);

  useEffect(() => {
    if (!kpDialogOpen) return;
    const timer = setTimeout(async () => {
      setKpSearching(true);
      try {
        const data = await api.knowledgePoints.list({
          keyword: kpSearchKeyword || undefined,
          subjectId: kpSearchSubjectId || undefined,
          page: 1,
          pageSize: 20,
        });
        const subjectMap = new Map<string, string>();
        for (const s of subjects) subjectMap.set(s.id, s.name);
        setKpSearchResults(
          data.items.map((kp) => ({
            id: kp.id,
            title: kp.title,
            subjectId: kp.subjectId,
            subjectName: subjectMap.get(kp.subjectId),
            examFrequency: kp.examFrequency ?? 0,
          })),
        );
      } catch (err) {
        logger.error('搜索知识点失败', err);
        toast.error('搜索失败');
      } finally {
        setKpSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [kpSearchKeyword, kpSearchSubjectId, kpDialogOpen, subjects]);

  const handleAddKnowledgePoint = async (kpId: string) => {
    if (!question) return;
    try {
      const updated = await api.examQuestions.addKnowledgePoint(question.id, kpId);
      setQuestion(updated);
      toast.success('已添加关联知识点');
      setKpDialogOpen(false);
    } catch (err) {
      logger.error('添加知识点关联失败', err);
      const msg =
        (err as any)?.response?.data?.error?.message ?? '添加失败，请重试';
      toast.error(msg);
    }
  };

  const handleRemoveKnowledgePoint = async (kpId: string) => {
    if (!question) return;
    setKpRemovingId(kpId);
    try {
      const updated = await api.examQuestions.removeKnowledgePoint(question.id, kpId);
      setQuestion(updated);
      toast.success('已移除关联');
    } catch (err) {
      logger.error('移除知识点关联失败', err);
      toast.error('移除失败，请重试');
    } finally {
      setKpRemovingId(null);
    }
  };

  const handleSubmit = async (rating: SelfRatingKey) => {
    if (!question) return;
    const option = SELF_RATING_OPTIONS.find((o) => o.key === rating);
    if (!option) return;

    const selfRating: 'again' | 'hard' | 'good' | 'easy' =
      rating === 'again'
        ? 'again'
        : rating === 'partial'
          ? 'hard'
          : rating === 'basic'
            ? 'good'
            : 'easy';

    setSubmitting(true);
    try {
      await api.review.submitQuestionResult(question.id, {
        score: option.score,
        selfRating,
        userAnswer: userAnswer || undefined,
        knowledgePointIds: question.knowledgePoints?.map((kp) => kp.id),
      });
      toast.success('答题已记录');
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      logger.error('提交答题结果失败', err);
      toast.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleKeyword = (index: number) => {
    setCheckedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddToWrong = async (reason?: MistakeReason) => {
    if (!question) return;
    setWrongLoading(true);
    try {
      const result = await api.wrongQuestions.add({
        questionId: question.id,
        mistakeReason: reason,
        userAnswer: userAnswer || undefined,
      });
      setWrongQuestion(result);
      toast.success('已加入错题本');
    } catch (err) {
      logger.error('加入错题本失败', err);
      toast.error('加入失败，请重试');
    } finally {
      setWrongLoading(false);
    }
  };

  const handleRemoveFromWrong = async () => {
    if (!wrongQuestion) return;
    setWrongLoading(true);
    try {
      await api.wrongQuestions.remove(wrongQuestion.id);
      setWrongQuestion(null);
      toast.success('已从错题本移除');
    } catch (err) {
      logger.error('移除错题失败', err);
      toast.error('移除失败，请重试');
    } finally {
      setWrongLoading(false);
    }
  };

  const handleRedoSubmit = async (rating: SelfRatingKey, mastered: boolean) => {
    if (!question || !wrongQuestion) return;
    const option = SELF_RATING_OPTIONS.find((o) => o.key === rating);
    if (!option) return;

    setSubmitting(true);
    try {
      const result = await api.wrongQuestions.submitRedo(wrongQuestion.id, {
        score: option.score,
        mastered,
        userAnswer: userAnswer || undefined,
      });
      setWrongQuestion(result);
      if (mastered || option.score >= 60) {
        setMasteredScore(option.score);
        setShowMasteredConfirm(true);
      } else {
        toast.success('已记录，下次继续努力');
        onOpenChange(false);
        onSubmitted?.();
      }
    } catch (err) {
      logger.error('提交重做结果失败', err);
      toast.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkResolvedAndClose = async () => {
    if (!wrongQuestion) return;
    try {
      await api.wrongQuestions.update(wrongQuestion.id, { resolved: true });
      toast.success('已标记为掌握，继续加油！');
      setShowMasteredConfirm(false);
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      logger.error('标记掌握失败', err);
      toast.error('操作失败，请重试');
    }
  };

  const handleSkipMarkResolved = () => {
    setShowMasteredConfirm(false);
    onOpenChange(false);
    onSubmitted?.();
  };

  const handleSaveMistakeReason = async () => {
    if (!wrongQuestion) return;
    setSavingMistakeReason(true);
    try {
      const result = await api.wrongQuestions.update(wrongQuestion.id, {
        mistakeReason: mistakeReasonDraft || undefined,
      });
      setWrongQuestion(result);
      setEditingMistakeReason(false);
      toast.success('错因已更新');
    } catch (err) {
      logger.error('更新错因失败', err);
      toast.error('更新失败，请重试');
    } finally {
      setSavingMistakeReason(false);
    }
  };

  const handleSaveKeyword = async (index: number) => {
    if (!question) return;
    const trimmed = keywordDraft.trim();
    if (!trimmed) {
      setEditingKeywordIndex(null);
      setKeywordDraft('');
      return;
    }
    const current = question.answerKeywords ?? [];
    if (current[index] === trimmed) {
      setEditingKeywordIndex(null);
      setKeywordDraft('');
      return;
    }
    const next = [...current];
    next[index] = trimmed;
    setSavingKeywords(true);
    try {
      const updated = await api.examQuestions.updateAnswerKeywords(
        question.id,
        next,
      );
      setQuestion(updated);
      setEditingKeywordIndex(null);
      setKeywordDraft('');
      toast.success('得分点已更新');
    } catch (err) {
      logger.error('更新得分点失败', err);
      toast.error('保存失败，请重试');
    } finally {
      setSavingKeywords(false);
    }
  };

  const handleDeleteKeyword = async (index: number) => {
    if (!question) return;
    if (!(await showConfirm('确定删除该得分点？'))) return;
    const current = question.answerKeywords ?? [];
    const next = current.filter((_, i) => i !== index);
    setSavingKeywords(true);
    try {
      const updated = await api.examQuestions.updateAnswerKeywords(
        question.id,
        next,
      );
      setQuestion(updated);
      setCheckedKeywords((prev) => {
        const nextSet = new Set<number>();
        prev.forEach((idx) => {
          if (idx < index) nextSet.add(idx);
          else if (idx > index) nextSet.add(idx - 1);
        });
        return nextSet;
      });
      toast.success('已删除得分点');
    } catch (err) {
      logger.error('删除得分点失败', err);
      toast.error('删除失败，请重试');
    } finally {
      setSavingKeywords(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!question) return;
    const trimmed = newKeywordDraft.trim();
    if (!trimmed) {
      setAddingKeyword(false);
      setNewKeywordDraft('');
      return;
    }
    const current = question.answerKeywords ?? [];
    const next = [...current, trimmed];
    setSavingKeywords(true);
    try {
      const updated = await api.examQuestions.updateAnswerKeywords(
        question.id,
        next,
      );
      setQuestion(updated);
      setAddingKeyword(false);
      setNewKeywordDraft('');
      toast.success('已添加得分点');
    } catch (err) {
      logger.error('添加得分点失败', err);
      toast.error('添加失败，请重试');
    } finally {
      setSavingKeywords(false);
    }
  };

  const isRedoMode = wrongQuestion && wrongQuestion.resolved === false;

  // 错题模式下默认展开参考答案
  useEffect(() => {
    if (isRedoMode) {
      setShowAnswer(true);
    }
  }, [isRedoMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-none sm:max-w-2xl m-0 sm:m-4 h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {loading ? (
              <Skeleton className="h-6 w-48" />
            ) : question ? (
              <div className="flex items-center gap-2 flex-wrap w-full">
                <span className="text-sm font-normal text-muted-foreground">
                  {question.year} 年
                </span>
                {question.source && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {question.source}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {QUESTION_TYPE_LABEL[question.questionType]}
                </Badge>
                {question.examFrequency !== undefined && question.examFrequency >= 3 && (
                  <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                    高频
                  </span>
                )}
                {question.subjectName && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {question.subjectName}
                  </Badge>
                )}
                 <Badge
                   variant="outline"
                   className={statusBadgeClass(getQuestionStatus(question.answered, question.masteryScore)) + ' text-xs'}
                 >
                  {QUESTION_STATUS_LABEL[
                    getQuestionStatus(question.answered, question.masteryScore)
                  ]}
                </Badge>
                <QuestionDifficultyStars
                  difficulty={question.difficulty}
                  editable
                  questionId={question.id}
                  size="md"
                  onUpdate={(val: number) =>
                    setQuestion((prev) => (prev ? { ...prev, difficulty: val } : prev))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  已答 {question.answerCount || 0} 次
                </span>
              </div>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : question ? (
          <div className="space-y-5">
            {/* 题干 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  题目
                </h3>
                {!editingQuestionText && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuestionTextDraft(question.questionText);
                      setEditingQuestionText(true);
                    }}
                    className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    编辑
                  </Button>
                )}
              </div>
              {editingQuestionText ? (
                <div className="space-y-2">
                  <Textarea
                    value={questionTextDraft}
                    onChange={(e) => setQuestionTextDraft(e.target.value)}
                    placeholder="输入题目内容..."
                    className="min-h-[120px] text-base leading-relaxed resize-y"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingQuestionText(false);
                        setQuestionTextDraft('');
                      }}
                      className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                      disabled={savingQuestionText}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        if (!question) return;
                        setSavingQuestionText(true);
                        try {
                          const updated =
                            await api.examQuestions.updateQuestionText(
                              question.id,
                              questionTextDraft,
                            );
                          setQuestion(updated);
                          setEditingQuestionText(false);
                          setQuestionTextDraft('');
                          toast.success('题目已保存');
                        } catch (err) {
                          logger.error('保存题目失败', err);
                          toast.error('保存失败，请重试');
                        } finally {
                          setSavingQuestionText(false);
                        }
                      }}
                       className="h-10 min-h-[40px] sm:h-7 px-3 text-xs"
                       disabled={savingQuestionText}
                     >
                       保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-base leading-relaxed whitespace-pre-wrap">
                  {question.questionText}
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {question.knowledgePoints && question.knowledgePoints.length > 0 ? (
                  question.knowledgePoints.map((kp) => (
                    <div key={kp.id} className="flex items-center gap-2 group">
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <Badge variant="outline" className="text-xs font-normal w-fit">
                          {kp.title}
                        </Badge>
                        <ChapterPathBadges chapterPaths={kp.chapterPaths} size="xs" />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (await showConfirm('确定移除该知识点关联？')) {
                            handleRemoveKnowledgePoint(kp.id);
                          }
                        }}
                        aria-label="移除知识点"
                        disabled={kpRemovingId === kp.id}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">暂无关联知识点</div>
                )}
                <Dialog open={kpDialogOpen} onOpenChange={setKpDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 w-full text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          添加知识点
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle className="text-base">添加关联知识点</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="搜索知识点名称..."
                                value={kpSearchKeyword}
                                onChange={(e) => setKpSearchKeyword(e.target.value)}
                                className="pl-8 text-sm"
                                autoFocus
                              />
                            </div>
                            <Select
                              value={kpSearchSubjectId}
                              onValueChange={setKpSearchSubjectId}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue placeholder="全部科目" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">全部科目</SelectItem>
                                {subjects.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <ScrollArea className="h-72 border rounded-md">
                            {kpSearching ? (
                              <div className="py-8 text-center text-sm text-muted-foreground">
                                搜索中...
                              </div>
                            ) : kpSearchResults.length === 0 ? (
                              <div className="py-8 text-center text-sm text-muted-foreground">
                                暂无匹配知识点
                              </div>
                            ) : (
                              <div>
                                {kpSearchResults.map((kp) => {
                                  const isLinked =
                                    question.knowledgePoints?.some(
                                      (k) => k.id === kp.id,
                                    ) ?? false;
                                  return (
                                    <button
                                      key={kp.id}
                                      type="button"
                                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b last:border-b-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                      onClick={() =>
                                        !isLinked && handleAddKnowledgePoint(kp.id)
                                      }
                                      disabled={isLinked}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium truncate">
                                          {kp.title}
                                        </div>
                                        {isLinked ? (
                                          <span className="text-xs text-muted-foreground flex-shrink-0">
                                            已关联
                                          </span>
                                        ) : (
                                          <span className="text-xs text-primary flex-shrink-0">
                                            添加
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-0.5">
                                        {kp.subjectName || '未知科目'} · 考频 {kp.examFrequency} 次
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setKpDialogOpen(false)}
                          >
                            取消
                          </Button>
                        </DialogFooter>
                       </DialogContent>
                     </Dialog>
                    </div>
                  </div>

              {/* 作答区 */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                我的答案
              </h3>
              {isRedoMode && wrongQuestion?.userAnswer && (
                <div className="mb-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
                  <div className="text-xs text-amber-700 font-medium mb-1">
                    我上次的答案
                  </div>
                  <div className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {wrongQuestion.userAnswer}
                  </div>
                </div>
              )}
              <Textarea
                placeholder="在这里写下你的答案..."
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                className="min-h-[120px] sm:min-h-28 resize-y"
              />
            </div>

             {/* 考点总结卡片 */}
             <div>
               <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-medium text-muted-foreground">
                   考点总结
                 </h3>
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   onClick={() => setShowCard((v) => !v)}
                    className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                    disabled={
                      !question.cardData ||
                     (!question.cardData.flowSteps?.length &&
                       !question.cardData.blocks?.length &&
                       !question.cardData.summary)
                   }
                   title={
                     question.cardData &&
                     (question.cardData.flowSteps?.length ||
                       question.cardData.blocks?.length ||
                       question.cardData.summary)
                       ? '展开考点总结'
                       : '暂无卡片'
                   }
                 >
                   <Layers className="h-3.5 w-3.5 mr-1" />
                   {showCard ? '收起' : '考点总结'}
                 </Button>
               </div>

               {showCard ? (
                 <div className="space-y-3 pt-1">
                   {editingCard ? (
                     <QuestionCardEditor
                       initialData={question.cardData ?? {}}
                       saving={savingCard}
                       onSave={async (data: KnowledgePointCardData) => {
                         setSavingCard(true);
                         try {
                           const updated = await api.examQuestions.updateCardData(
                             question.id,
                             data,
                           );
                           setQuestion(updated);
                           setEditingCard(false);
                           toast.success('考点总结已保存');
                         } catch (err) {
                           logger.error('保存考点总结失败', err);
                           toast.error('保存失败，请重试');
                         } finally {
                           setSavingCard(false);
                         }
                       }}
                       onCancel={() => setEditingCard(false)}
                     />
                   ) : question.cardData &&
                     (question.cardData.flowSteps?.length ||
                       question.cardData.blocks?.length ||
                       question.cardData.summary) ? (
                     <div className="space-y-3">
                       <div className="flex items-start justify-between">
                         <p className="text-xs text-muted-foreground">
                           这道题的答题框架与得分要点
                         </p>
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => setEditingCard(true)}
                            className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            编辑
                          </Button>
                        </div>
                        <div className="border border-stone-200 rounded-lg bg-white p-4">
                          <KnowledgeCardView
                           data={question.cardData}
                           title="考点总结"
                           subjectName={question.subjectName}
                         />
                       </div>
                       {question.knowledgePoints &&
                         question.knowledgePoints.length > 0 && (
                           <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
                             <span className="text-muted-foreground">
                               查看关联知识点完整卡片：
                             </span>
                             {question.knowledgePoints.map((kp, idx) => (
                               <span key={kp.id} className="flex items-center">
                                 <UniversalLink
                                   to={`/knowledge-points/${kp.id}`}
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   className="text-primary hover:underline inline-flex items-center gap-0.5"
                                 >
                                   {kp.title}
                                   <ExternalLink className="h-3 w-3" />
                                 </UniversalLink>
                                 {idx <
                                   (question.knowledgePoints?.length ?? 0) - 1 && (
                                   <span className="text-muted-foreground mx-1">
                                     、
                                   </span>
                                 )}
                               </span>
                             ))}
                           </div>
                         )}
                     </div>
                   ) : (
                     <div className="border border-dashed rounded-lg p-6 text-center bg-stone-50/50">
                       <div className="text-sm text-stone-600 mb-1">
                         暂无考点总结卡片
                       </div>
                       <p className="text-xs text-muted-foreground mb-3">
                         为这道题整理答题思路、得分点和易错点，复习更高效
                       </p>
                       <Button
                         type="button"
                         size="sm"
                         variant="outline"
                         onClick={() => {
                           setShowCard(true);
                           setEditingCard(true);
                         }}
                       >
                         <Plus className="h-3.5 w-3.5 mr-1" />
                         创建考点总结
                       </Button>
                     </div>
                   )}
                 </div>
               ) : (
                 <div className="p-3 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                   点击上方按钮查看考点总结
                 </div>
               )}
             </div>

             {/* 参考答案 */}
             <div>
               <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-medium text-muted-foreground">
                   参考答案
                 </h3>
                 <div className="flex items-center gap-1">
                   {showAnswer && question && question.answer && !editingAnswer && (
                     <Button
                       type="button"
                       variant="ghost"
                       size="sm"
                       onClick={() => {
                         setAnswerDraft(question.answer || '');
                         setEditingAnswer(true);
                       }}
                        className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑
                      </Button>
                    )}
                    <Button
                     type="button"
                     variant="ghost"
                     size="sm"
                     onClick={() => setShowAnswer((v) => !v)}
                      className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                    >
                      {showAnswer ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 mr-1" />
                          隐藏答案
                       </>
                     ) : (
                       <>
                         <Eye className="h-3.5 w-3.5 mr-1" />
                         显示参考答案
                       </>
                     )}
                   </Button>
                 </div>
               </div>

               {showAnswer ? (
                 <div className="space-y-3">
                   {editingAnswer ? (
                     <div className="space-y-2">
                       <Textarea
                         value={answerDraft}
                         onChange={(e) => setAnswerDraft(e.target.value)}
                         placeholder="输入参考答案..."
                         className="min-h-[160px] text-sm leading-relaxed resize-y"
                       />
                       <div className="flex items-center justify-end gap-2">
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           onClick={() => {
                             setEditingAnswer(false);
                             setAnswerDraft('');
                           }}
                            className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                            disabled={savingAnswer}
                          >
                            取消
                         </Button>
                         <Button
                           type="button"
                           size="sm"
                           onClick={async () => {
                             if (!question) return;
                             setSavingAnswer(true);
                             try {
                               const updated = await api.examQuestions.updateAnswer(
                                 question.id,
                                 answerDraft,
                               );
                               setQuestion(updated);
                               setEditingAnswer(false);
                               setAnswerDraft('');
                               toast.success('参考答案已保存');
                             } catch (err) {
                               logger.error('保存参考答案失败', err);
                               toast.error('保存失败，请重试');
                             } finally {
                               setSavingAnswer(false);
                             }
                           }}
                            className="h-10 min-h-[40px] sm:h-7 px-3 text-xs"
                            disabled={savingAnswer}
                          >
                            保存
                         </Button>
                       </div>
                     </div>
                   ) : question.answer ? (
                     <div className="p-3 rounded-md bg-muted/50 border text-sm leading-relaxed whitespace-pre-wrap">
                       {question.answer}
                     </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAnswerDraft('');
                          setEditingAnswer(true);
                        }}
                        className="w-full p-3 rounded-md border border-dashed text-center text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
                      >
                        暂无参考答案，点击编辑添加
                      </button>
                    )}
                 </div>
               ) : (
                 <div className="p-3 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                   点击上方按钮查看参考答案
                 </div>
               )}
             </div>

             {/* 得分点 */}
             <div>
               <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-medium text-muted-foreground">
                   得分点（勾选你答到的要点）
                 </h3>
                 <Button
                   type="button"
                   variant="ghost"
                   size="sm"
                   onClick={() => setShowKeywords((v) => !v)}
                   className="h-9 min-h-[36px] sm:h-7 px-3 text-xs"
                 >
                   {showKeywords ? (
                     <>
                       <ChevronUp className="h-3.5 w-3.5 mr-1" />
                       收起
                     </>
                   ) : (
                     <>
                       <ChevronDown className="h-3.5 w-3.5 mr-1" />
                       展开
                     </>
                   )}
                 </Button>
               </div>

               {showKeywords ? (
                 <div className="space-y-2">
                   {question.answerKeywords && question.answerKeywords.length > 0 ? (
                     <div className="space-y-2">
                       {question.answerKeywords.map((kw, idx) => (
                         <div
                           key={idx}
                           className="relative flex items-start gap-2 text-sm group"
                         >
                           <Checkbox
                             id={`kw-${idx}`}
                             checked={checkedKeywords.has(idx)}
                             onCheckedChange={() => toggleKeyword(idx)}
                             className="mt-0.5"
                             disabled={editingKeywordIndex === idx}
                           />
                           {editingKeywordIndex === idx ? (
                             <div className="flex-1 flex items-center gap-1">
                               <Input
                                 value={keywordDraft}
                                 onChange={(e) => setKeywordDraft(e.target.value)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') {
                                     e.preventDefault();
                                     handleSaveKeyword(idx);
                                   } else if (e.key === 'Escape') {
                                     setEditingKeywordIndex(null);
                                     setKeywordDraft('');
                                   }
                                 }}
                                 className="h-7 text-sm flex-1"
                                 autoFocus
                               />
                               <Button
                                 type="button"
                                 size="icon"
                                 variant="ghost"
                                 className="h-7 w-7"
                                 onClick={() => handleSaveKeyword(idx)}
                                 disabled={savingKeywords}
                                 aria-label="保存"
                               >
                                 <Check className="h-3.5 w-3.5" />
                               </Button>
                               <Button
                                 type="button"
                                 size="icon"
                                 variant="ghost"
                                 className="h-7 w-7 text-muted-foreground"
                                 onClick={() => {
                                   setEditingKeywordIndex(null);
                                   setKeywordDraft('');
                                 }}
                                 disabled={savingKeywords}
                                 aria-label="取消"
                               >
                                 <X className="h-3.5 w-3.5" />
                               </Button>
                             </div>
                           ) : (
                             <>
                               <label
                                 htmlFor={`kw-${idx}`}
                                 className="cursor-pointer leading-5 flex-1"
                               >
                                 {kw}
                               </label>
                               <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded bg-background/95 px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Button
                                   type="button"
                                   size="icon"
                                   variant="ghost"
                                   className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                   onClick={() => {
                                     setKeywordDraft(kw);
                                     setEditingKeywordIndex(idx);
                                   }}
                                   aria-label="编辑得分点"
                                 >
                                   <Pencil className="h-3 w-3" />
                                 </Button>
                                 <Button
                                   type="button"
                                   size="icon"
                                   variant="ghost"
                                   className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                   onClick={() => handleDeleteKeyword(idx)}
                                   disabled={savingKeywords}
                                   aria-label="删除得分点"
                                 >
                                   <Trash2 className="h-3 w-3" />
                                 </Button>
                               </div>
                             </>
                           )}
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="text-xs text-muted-foreground py-2">
                       暂无得分点，点击下方添加
                     </div>
                   )}

                   {addingKeyword ? (
                     <div className="flex items-center gap-1 pt-1">
                       <Input
                         value={newKeywordDraft}
                         onChange={(e) => setNewKeywordDraft(e.target.value)}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter') {
                             e.preventDefault();
                             handleAddKeyword();
                           } else if (e.key === 'Escape') {
                             setAddingKeyword(false);
                             setNewKeywordDraft('');
                           }
                         }}
                         placeholder="输入得分点内容，回车保存"
                         className="h-8 text-sm flex-1"
                         autoFocus
                       />
                       <Button
                         type="button"
                         size="sm"
                         onClick={handleAddKeyword}
                         disabled={savingKeywords || !newKeywordDraft.trim()}
                         className="h-8 text-xs"
                       >
                         <Check className="h-3.5 w-3.5 mr-1" />
                         保存
                       </Button>
                       <Button
                         type="button"
                         size="sm"
                         variant="ghost"
                         onClick={() => {
                           setAddingKeyword(false);
                           setNewKeywordDraft('');
                         }}
                         disabled={savingKeywords}
                         className="h-8 text-xs"
                       >
                         取消
                       </Button>
                     </div>
                   ) : (
                     <Button
                       type="button"
                       variant="outline"
                       size="sm"
                       onClick={() => {
                         setAddingKeyword(true);
                         setNewKeywordDraft('');
                       }}
                       disabled={savingKeywords}
                       className="w-full text-xs mt-1"
                     >
                       <Plus className="h-3.5 w-3.5 mr-1" />
                       添加得分点
                     </Button>
                   )}
                 </div>
               ) : (
                 <div className="p-3 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                   点击上方按钮展开得分点
                 </div>
               )}
             </div>

            {/* 错题本状态 */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {wrongQuestion ? (
                      <>
                        <Badge variant="destructive" className="text-xs">
                          <BookX className="h-3 w-3 mr-1" />
                          错题本（{wrongQuestion.wrongCount} 次）
                        </Badge>
                        {editingMistakeReason ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Select
                              value={mistakeReasonDraft}
                              onValueChange={setMistakeReasonDraft}
                            >
                              <SelectTrigger className="h-7 text-xs w-auto min-w-[120px]">
                                <SelectValue placeholder="选择错因" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="" className="text-xs">
                                  未标注
                                </SelectItem>
                                {(Object.keys(MISTAKE_REASON_LABEL) as MistakeReason[]).map((r) => (
                                  <SelectItem key={r} value={r} className="text-xs">
                                    {MISTAKE_REASON_LABEL[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleSaveMistakeReason}
                              disabled={savingMistakeReason}
                              className="h-7 text-xs px-2"
                            >
                              保存
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingMistakeReason(false)}
                              className="h-7 text-xs px-2"
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">
                              错因：
                              {wrongQuestion.mistakeReason
                                ? MISTAKE_REASON_LABEL[wrongQuestion.mistakeReason as MistakeReason] ??
                                  wrongQuestion.mistakeReason
                                : '未标注'}
                            </span>
                            {isRedoMode && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setMistakeReasonDraft(wrongQuestion.mistakeReason || '');
                                  setEditingMistakeReason(true);
                                }}
                                className="h-6 text-xs px-1.5"
                              >
                                <Pencil className="h-3 w-3 mr-0.5" />
                                编辑
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">未加入错题本</span>
                    )}
                  </div>
                <div className="flex items-center gap-1">
                  {wrongQuestion ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveFromWrong}
                      disabled={wrongLoading || submitting}
                      className="text-xs h-8"
                    >
                      <BookX className="h-3.5 w-3.5 mr-1" />
                      移出错题本
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Select
                        onValueChange={(v) => {
                          if (v) handleAddToWrong(v as MistakeReason);
                        }}
                        disabled={wrongLoading || submitting}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
                          <SelectValue placeholder="选择错因加入" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MISTAKE_REASON_LABEL) as MistakeReason[]).map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {MISTAKE_REASON_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddToWrong()}
                        disabled={wrongLoading || submitting}
                        className="text-xs h-8"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        加入错题
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 重做达标确认 */}
            {showMasteredConfirm && (
              <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-900">
                        本次重做得分 {masteredScore} 分，已达到掌握水平
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">
                        是否将这道题标记为已解决？
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleMarkResolvedAndClose}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        标记已解决
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSkipMarkResolved}
                      >
                        暂不标记
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 自评区 */}
            <div className="pt-2 border-t">
              <h3 className="text-sm font-medium mb-3">
                {isRedoMode ? '重做自评' : '自评结果'}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                 {SELF_RATING_OPTIONS.map((opt) => (
                   <Button
                     key={opt.key}
                     type="button"
                     variant={opt.variant}
                     size="sm"
                     disabled={submitting}
                     onClick={() => {
                       if (isRedoMode) {
                         handleRedoSubmit(opt.key, opt.score >= 60);
                       } else {
                         handleSubmit(opt.key);
                       }
                     }}
                     className={opt.className + " h-12 min-h-[48px] sm:h-auto sm:min-h-0 text-sm sm:text-xs"}
                   >
                     {opt.label}
                   </Button>
                 ))}
               </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {isRedoMode
                  ? '点击按钮记录重做结果，≥60分自动标记为掌握'
                  : '点击按钮后将自动记录本次答题结果'}
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default QuestionAnswerDialog;
