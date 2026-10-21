import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/components/ui/markdown';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
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
import { Search, Plus } from 'lucide-react';
import * as api from '@/api';
import { emitWeakMarkChanged } from '@/utils/weak-mark-bus';
import type {
  KnowledgePoint,
  ExamQuestion,
  ReviewRecord,
  SelfRating,
  SyllabusMode,
  ChapterPathNode,
} from '@shared/api.interface';
import {
  KP_STATUS_LABEL,
  REQUIREMENT_LEVEL_LABEL,
  QUESTION_TYPE_LABEL,
  SELF_RATING_LABEL,
  QUESTION_STATUS_LABEL,
  getQuestionStatus,
} from '@shared/api.interface';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  FileText,
  History,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Key,
  Eye,
  Flag,
  X,
} from 'lucide-react';
import { masteryColor, masteryTextColor, requirementBorderClass, formatDate, isOverdue, statusBadgeClass } from '@/utils/mastery';
import KnowledgeCardView from '@/components/knowledge-card/KnowledgeCardView';
import KnowledgeCardEditor from '@/components/knowledge-card/KnowledgeCardEditor';
import type { KnowledgePointCardData } from '@shared/api.interface';
import { Pencil, LayoutGrid, FileText as FileTextIcon, ExternalLink, Layers } from 'lucide-react';
import { resolveAppUrl } from '@lark-apaas/client-toolkit/utils/resolveAppUrl';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { QuestionTags } from '@/components/question-tags';
import { QuestionDifficultyStars } from '@/components/question-difficulty';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { WeakMarkReason } from '@shared/api.interface';
import { WEAK_MARK_REASON_LABEL } from '@shared/api.interface';
import { showConfirm } from '@lark-apaas/client-toolkit';

const KnowledgePointDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'content';

  const [kp, setKp] = useState<KnowledgePoint | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const [qDialogOpen, setQDialogOpen] = useState(false);
  const [qSearchKeyword, setQSearchKeyword] = useState('');
  const [qSearchResults, setQSearchResults] = useState<ExamQuestion[]>([]);
  const [qSearching, setQSearching] = useState(false);
  const [removingQId, setRemovingQId] = useState<string | null>(null);

  const handleRemoveQuestion = async (questionId: string) => {
    if (!id) return;
    if (!await showConfirm('确定移除该真题关联？')) return;
    setRemovingQId(questionId);
    try {
      const updated = await api.knowledgePoints.removeQuestion(id, questionId);
      setQuestions(updated);
      toast.success('已移除关联');
    } catch (err) {
      logger.error('移除真题关联失败', err);
      toast.error('移除失败，请重试');
    } finally {
      setRemovingQId(null);
    }
  };

  useEffect(() => {
    if (!qDialogOpen) {
      setQSearchKeyword('');
      setQSearchResults([]);
      return;
    }
  }, [qDialogOpen]);

  useEffect(() => {
    if (!qDialogOpen) return;
    const timer = setTimeout(async () => {
      setQSearching(true);
      try {
        const data = await api.examQuestions.list({
          keyword: qSearchKeyword || undefined,
          page: 1,
          pageSize: 20,
        });
        setQSearchResults(data.items);
      } catch (err) {
        logger.error('搜索真题失败', err);
        toast.error('搜索失败');
      } finally {
        setQSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [qSearchKeyword, qDialogOpen]);

  const handleAddQuestion = async (questionId: string) => {
    if (!id) return;
    try {
      const updated = await api.knowledgePoints.addQuestion(id, questionId);
      setQuestions(updated);
      toast.success('已添加关联真题');
      setQDialogOpen(false);
    } catch (err) {
      logger.error('添加真题关联失败', err);
      const msg =
        (err as any)?.response?.data?.error?.message ?? '添加失败，请重试';
      toast.error(msg);
    }
  };

  const pathLabelMap: Record<SyllabusMode, { label: string; color: string }> = {
    exam_syllabus: { label: '真题大纲', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    textbook: { label: '本科教材', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };

  const renderPathLine = (source: SyllabusMode, path: ChapterPathNode[] | undefined) => {
    const cfg = pathLabelMap[source];
    const arrow = <span className="text-muted-foreground mx-1.5 select-none">→</span>;

    return (
      <div key={source} className="flex items-start gap-2 text-sm text-muted-foreground flex-wrap leading-relaxed">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded border ${cfg.color} font-medium whitespace-nowrap text-xs flex-shrink-0 mt-0.5`}
        >
          {cfg.label}
        </span>
        <button
          type="button"
          className="hover:text-foreground transition-colors"
          onClick={() => navigate('/syllabus')}
        >
          大纲地图
        </button>
        {arrow}
        <button
          type="button"
          className="hover:text-foreground transition-colors"
          onClick={() => navigate(`/syllabus?mode=${source}&subjectId=${kp?.subjectId ?? ''}`)}
        >
          {kp?.subjectName || '—'}
        </button>
        {path && path.length > 0 && path.map((node) => (
          <React.Fragment key={node.id}>
            {arrow}
            <button
              type="button"
              className="hover:text-foreground transition-colors text-left"
              onClick={() =>
                navigate(
                  `/syllabus?mode=${source}&subjectId=${kp?.subjectId ?? ''}&chapterId=${node.id}`,
                )
              }
              title={node.title}
            >
              {node.title}
            </button>
          </React.Fragment>
        ))}
        {arrow}
        <span className="text-foreground font-medium">{kp?.title}</span>
      </div>
    );
  };

  // 主动回忆状态
  const [showHint, setShowHint] = useState(false);
  const [showKeywords, setShowKeywords] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 关联真题筛选
  const [questionFilter, setQuestionFilter] = useState<string>('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [expandedCardQuestionId, setExpandedCardQuestionId] = useState<string | null>(null);
  const [questionSort, setQuestionSort] = useState<string>('year_desc');

  // 知识内容视图切换
  const hasCardData = (data: KnowledgePointCardData | undefined): boolean => {
    if (!data) return false;
    return !!(data.flowSteps?.length || data.blocks?.length || data.summary);
  };
  const getInitialView = (): 'note' | 'card' => {
    const saved = localStorage.getItem(`kp_view_${id}`);
    if (saved === 'card' || saved === 'note') return saved;
    return hasCardData(kp?.cardData) ? 'card' : 'note';
  };
  const [contentView, setContentView] = useState<'note' | 'card'>('note');
  const [editingCard, setEditingCard] = useState(false);

  useEffect(() => {
    if (!kp) return;
    const saved = localStorage.getItem(`kp_view_${id}`);
    if (saved === 'card' || saved === 'note') {
      setContentView(saved);
    } else {
      setContentView(hasCardData(kp.cardData) ? 'card' : 'note');
    }
  }, [kp?.id, id]);

  const setContentViewAndSave = (view: 'note' | 'card') => {
    setContentView(view);
    if (id) localStorage.setItem(`kp_view_${id}`, view);
  };

  const loadKp = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const result = await api.knowledgePoints.getById(id);
      setKp(result);
    } catch (err) {
      logger.error('加载知识点详情失败', err);
      toast.error('加载知识点详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadKp();
  }, [loadKp]);

  useEffect(() => {
    if (!id) return;
    const loadQuestions = async () => {
      try {
        const result = await api.knowledgePoints.getQuestions(id);
        setQuestions(result);
      } catch (err) {
        logger.error('加载关联真题失败', err);
        toast.error('加载关联真题失败');
      } finally {
        setQuestionsLoading(false);
      }
    };
    loadQuestions();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const loadRecords = async () => {
      try {
        const result = await api.knowledgePoints.getReviewRecords(id);
        setRecords(result);
      } catch (err) {
        logger.error('加载复习历史失败', err);
        toast.error('加载复习历史失败');
      } finally {
        setRecordsLoading(false);
      }
    };
    loadRecords();
  }, [id]);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
    // 重置回忆状态
    if (value === 'recall') {
      setShowHint(false);
      setShowKeywords(false);
      setShowAnswer(false);
    }
  };

  // 薄弱标记
  const [weakMarkPopoverOpen, setWeakMarkPopoverOpen] = useState(false);
  const [weakMarkLoading, setWeakMarkLoading] = useState(false);

  const handleMarkWeak = async (reason?: WeakMarkReason) => {
    if (!id) return;
    setWeakMarkLoading(true);
    try {
      const result = await api.knowledgePoints.markWeak(id, reason);
       setKp(result);
       emitWeakMarkChanged();
       toast.success(reason
         ? `已标记为薄弱·${WEAK_MARK_REASON_LABEL[reason]}`
         : '已标记为薄弱');
      setWeakMarkPopoverOpen(false);
    } catch (err: unknown) {
      logger.error('标记薄弱失败', err);
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || '标记失败，请重试';
      toast.error(msg);
    } finally {
      setWeakMarkLoading(false);
    }
  };

  const handleUnmarkWeak = async () => {
    if (!id) return;
    setWeakMarkLoading(true);
    try {
       const result = await api.knowledgePoints.unmarkWeak(id);
       setKp(result);
       emitWeakMarkChanged();
       toast.success('已取消薄弱标记');
      setWeakMarkPopoverOpen(false);
    } catch (err: unknown) {
      logger.error('取消薄弱标记失败', err);
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || '操作失败，请重试';
      toast.error(msg);
    } finally {
      setWeakMarkLoading(false);
    }
  };

  const handleSelfRating = async (rating: SelfRating) => {
    if (!id || !kp) return;
    setSubmitting(true);
    try {
      const oldScore = kp.masteryScore;
      const result = await api.review.submitKnowledgePointReview(id, {
        selfRating: rating,
        recallScore: ratingToScore(rating),
      });
      toast.success(
        `复习已记录，掌握度 ${oldScore} → ${result.reviewRecord.newMasteryScore}`,
      );
      setKp(result.knowledgePoint);
      setShowHint(false);
      setShowKeywords(false);
      setShowAnswer(false);
      const recordsResult = await api.knowledgePoints.getReviewRecords(id);
      setRecords(recordsResult);
    } catch (err: unknown) {
      logger.error('提交复习结果失败', err);
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || '提交失败，请重试';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 筛选和排序真题
  const filteredQuestions = (() => {
    let list = [...questions];
    if (questionFilter === 'undone') {
      list = list.filter(() => true); // 简化：暂无完成状态字段
    } else if (questionFilter === 'wrong') {
      list = list.filter(() => false); // 简化：暂无错题标记
    }
    if (questionSort === 'year_desc') {
      list.sort((a, b) => b.year - a.year);
    } else if (questionSort === 'year_asc') {
      list.sort((a, b) => a.year - b.year);
    } else if (questionSort === 'type') {
      list.sort((a, b) => a.questionType.localeCompare(b.questionType));
    }
    return list;
  })();

  if (loading && !kp) {
    return (
      <div className="p-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-60" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!kp) {
    return (
      <div className="p-6">
        <Link
          to="/knowledge-points"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          返回知识点列表
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            知识点不存在
          </CardContent>
        </Card>
      </div>
    );
  }

  const overdue = isOverdue(kp.nextReviewAt);

   return (
      <div className="p-3 md:p-6">
        <Link
          to="/knowledge-points"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 md:mb-4 min-h-[32px]"
        >
          <ArrowLeft className="h-4 w-4" />
          返回知识点列表
        </Link>

        {/* 顶部信息条 */}
        <Card className="mb-4 md:mb-6">
          <CardContent className="pt-4 md:pt-6">
            {/* 双目录路径 */}
            <div className="space-y-2 mb-3 md:mb-4">
            {renderPathLine('exam_syllabus' as SyllabusMode, kp.chapterPaths?.examSyllabus)}
            {renderPathLine('textbook' as SyllabusMode, kp.chapterPaths?.textbook)}
          </div>
          <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold flex-1 min-w-0">{kp.title}</h1>
              {kp.examFrequency >= 3 && (
                <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-1.5">
                  高频
                </span>
              )}
            </div>
            <Popover open={weakMarkPopoverOpen} onOpenChange={setWeakMarkPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant={kp.isWeakMarked ? 'default' : 'outline'}
                  className={kp.isWeakMarked ? 'bg-red-500 hover:bg-red-600 text-white border-red-500' : ''}
                  disabled={weakMarkLoading}
                  aria-label={kp.isWeakMarked ? '已标记薄弱' : '标记为薄弱'}
                >
                  <Flag className={`h-4 w-4 mr-1 ${kp.isWeakMarked ? 'fill-current' : ''}`} />
                  {kp.isWeakMarked
                    ? `已标记·${kp.weakMarkReason ? WEAK_MARK_REASON_LABEL[kp.weakMarkReason as keyof typeof WEAK_MARK_REASON_LABEL] : '薄弱'}`
                    : '标记为不熟悉'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                {kp.isWeakMarked ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">当前标记</div>
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-red-500 fill-red-500" />
                        <span className="font-medium text-red-600">
                          {kp.weakMarkReason
                            ? WEAK_MARK_REASON_LABEL[kp.weakMarkReason]
                            : '薄弱'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">更换原因</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(WEAK_MARK_REASON_LABEL) as WeakMarkReason[]).map(
                        (reason) => (
                          <Button
                            key={reason}
                            size="sm"
                            variant={kp.weakMarkReason === reason ? 'default' : 'outline'}
                            className={
                              kp.weakMarkReason === reason
                                ? 'bg-red-500 hover:bg-red-600 text-white border-red-500 h-8 text-xs'
                                : 'h-8 text-xs'
                            }
                            onClick={() => handleMarkWeak(reason)}
                            disabled={weakMarkLoading}
                          >
                            {WEAK_MARK_REASON_LABEL[reason]}
                          </Button>
                        ),
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
                      onClick={handleUnmarkWeak}
                      disabled={weakMarkLoading}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      取消薄弱标记
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">选择标记原因</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(WEAK_MARK_REASON_LABEL) as WeakMarkReason[]).map(
                        (reason) => (
                          <Button
                            key={reason}
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs hover:border-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleMarkWeak(reason)}
                            disabled={weakMarkLoading}
                          >
                            {WEAK_MARK_REASON_LABEL[reason]}
                          </Button>
                        ),
                      )}
                    </div>
                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-border" />
                      <span className="flex-shrink mx-2 text-xs text-muted-foreground">或</span>
                      <div className="flex-grow border-t border-border" />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-8 text-xs"
                      onClick={() => handleMarkWeak()}
                      disabled={weakMarkLoading}
                    >
                      不选原因，直接标记
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">综合掌握度</span>
                <span className={`text-2xl font-bold ${masteryTextColor(kp.masteryScore)}`}>
                  {kp.masteryScore}%
                </span>
                <div className="w-20">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${masteryColor(kp.masteryScore)}`}
                      style={{ width: `${kp.masteryScore}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>主动回忆</span>
                  <span className={`font-medium ${masteryTextColor(kp.recallMastery)}`}>
                    {kp.recallMastery}%
                  </span>
                </div>
                <div className="w-px h-3 bg-border" />
                <div className="flex items-center gap-1.5">
                  <span>真题</span>
                  <span className={`font-medium ${masteryTextColor(kp.questionMastery)}`}>
                    {kp.questionMastery}%
                  </span>
                  <span>（{kp.answeredQuestionCount} 题已答）</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">大纲要求</span>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${requirementBorderClass(kp.requirementLevel)}`}
              >
                {REQUIREMENT_LEVEL_LABEL[kp.requirementLevel]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">真题次数</span>
              <span className="font-medium">{kp.examFrequency}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">下次复习</span>
              <span className={`font-medium ${overdue ? 'text-red-600' : ''}`}>
                {kp.nextReviewAt
                  ? formatDate(kp.nextReviewAt) + (overdue ? '（逾期）' : '')
                  : '未安排'}
              </span>
            </div>
            <Badge
              variant="outline"
              className={statusBadgeClass(kp.status) + ' text-xs'}
            >
              {KP_STATUS_LABEL[kp.status]}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tabFromUrl} onValueChange={handleTabChange}>
        <div className="overflow-x-auto scrollbar-none -mx-3 px-3 md:mx-0 md:px-0 mb-4">
          <TabsList className="mb-0">
            <TabsTrigger value="content" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
              <BookOpen className="h-4 w-4" />
              知识内容
            </TabsTrigger>
            <TabsTrigger value="recall" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
              <Brain className="h-4 w-4" />
              主动回忆
            </TabsTrigger>
            <TabsTrigger value="questions" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
              <FileText className="h-4 w-4" />
              关联真题
              <span className="text-xs text-muted-foreground">({questions.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
              <History className="h-4 w-4" />
              复习历史
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: 知识内容 */}
        <TabsContent value="content">
          <Card className="border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-slate-800">知识内容</CardTitle>
                <div className="flex items-center gap-1">
                  <div className="flex items-center bg-slate-100 rounded-md p-0.5 border border-slate-200">
                    <button
                      onClick={() => setContentViewAndSave('note')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        contentView === 'note'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <FileTextIcon className="h-3.5 w-3.5" />
                      笔记视图
                    </button>
                    <button
                      onClick={() => setContentViewAndSave('card')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                        contentView === 'card'
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      卡片视图
                    </button>
                  </div>
                  {contentView === 'card' && !editingCard && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-1"
                      onClick={() => setEditingCard(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      编辑卡片
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 md:pt-5">
              {contentView === 'note' && (
                <div className="space-y-4 md:space-y-6">
                  {kp.keywords.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                      <div className="text-xs font-medium text-slate-500 sm:w-16 flex-shrink-0 pt-0.5">关键词</div>
                      <div className="flex items-center gap-1.5 flex-wrap flex-1">
                        {kp.keywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-slate-50 border-slate-200 text-slate-700 font-normal">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                    <div className="text-xs font-medium text-slate-500 sm:w-16 flex-shrink-0 pt-1">详细内容</div>
                    <div className="flex-1 min-w-0 w-full">
                      {kp.content ? (
                        <div className="kp-markdown text-sm border border-slate-200 rounded-md p-4 md:p-6 bg-white shadow-sm w-full">
                          <Markdown>{kp.content}</Markdown>
                        </div>
                      ) : kp.summary ? (
                        <div className="kp-markdown text-sm border border-slate-200 rounded-md p-4 md:p-6 bg-white shadow-sm w-full">
                          <Markdown>{kp.summary}</Markdown>
                        </div>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground border border-dashed border-slate-200 rounded-md">
                          暂无知识内容
                        </div>
                      )}
                    </div>
                  </div>
                  {kp.summary && kp.content && (
                    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                      <div className="text-xs font-medium text-slate-500 sm:w-16 flex-shrink-0 pt-1">内容摘要</div>
                      <div className="flex-1 text-sm leading-relaxed text-slate-600 bg-slate-50 rounded-md p-4 border border-slate-100">
                        {kp.summary}
                      </div>
                    </div>
                  )}
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors sm:ml-[76px] min-h-[32px]">
                      <ChevronDown className="h-3.5 w-3.5" />
                      查看大纲原文
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 sm:ml-[76px]">
                      <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3 border border-slate-200 leading-relaxed">
                        {kp.syllabusTitle || '（大纲原文关联中...）'}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {contentView === 'card' && !editingCard && (
                <div>
                  {hasCardData(kp.cardData) ? (
                    <KnowledgeCardView
                      data={kp.cardData}
                      title={kp.title}
                      subjectName={kp.subjectName}
                    />
                  ) : (
                    <div className="py-16 text-center border border-dashed border-amber-200 rounded-lg bg-amber-50/30">
                      <div className="text-amber-800 text-sm font-medium mb-2">
                        还没有知识卡片
                      </div>
                      <p className="text-xs text-amber-700/70 mb-4">
                        用教材总结卡片版式整理重点，更方便记忆
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setEditingCard(true)}
                        className="bg-stone-700 hover:bg-stone-800"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        点此创建卡片
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {contentView === 'card' && editingCard && (
                <KnowledgeCardEditor
                  kpId={kp.id}
                  initialData={kp.cardData ?? {}}
                  onSaved={(newData) => {
                    setKp({ ...kp, cardData: newData });
                    setEditingCard(false);
                    if (!hasCardData(newData)) {
                      setContentViewAndSave('note');
                    }
                  }}
                  onCancel={() => setEditingCard(false)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: 主动回忆 */}
        <TabsContent value="recall">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                请复述：{kp.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 操作按钮 */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={showHint ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowHint(!showHint)}
                  className="h-10 min-h-[40px]"
                >
                  <Lightbulb className="h-4 w-4" />
                  {showHint ? '隐藏提示' : '显示提示'}
                </Button>
                <Button
                  variant={showKeywords ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowKeywords(!showKeywords)}
                  className="h-10 min-h-[40px]"
                >
                  <Key className="h-4 w-4" />
                  {showKeywords ? '隐藏关键词' : '显示关键词'}
                </Button>
                <Button
                  variant={showAnswer ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setShowAnswer(!showAnswer)}
                  className="h-10 min-h-[40px]"
                >
                  <Eye className="h-4 w-4" />
                  {showAnswer ? '隐藏答案' : '显示完整答案'}
                </Button>
              </div>

              {/* 提示区 */}
              {showHint && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs text-amber-600 font-medium mb-1">💡 提示</div>
                  <div className="text-sm text-amber-900">
                    {kp.summary || '暂无摘要提示'}
                  </div>
                </div>
              )}

              {/* 关键词区 */}
              {showKeywords && kp.keywords.length > 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs text-blue-600 font-medium mb-2">🔑 关键词</div>
                  <div className="flex flex-wrap gap-2">
                    {kp.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="bg-white">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {showKeywords && kp.keywords.length === 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs text-blue-600 font-medium mb-1">🔑 关键词</div>
                  <div className="text-sm text-blue-900">暂无关键词</div>
                </div>
              )}

              {/* 答案区 */}
              {showAnswer && (
                <div className="rounded-md border p-4">
                  <div className="text-xs text-muted-foreground font-medium mb-2">📖 完整答案</div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {kp.content || kp.summary || '暂无内容'}
                  </div>
                </div>
              )}

              {!showHint && !showKeywords && !showAnswer && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  先尝试在脑中回忆答案，再点击下方按钮验证
                </div>
              )}

              {/* 自评按钮组 */}
              <div className="pt-4 border-t">
                <div className="text-sm font-medium mb-3">自评结果</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <Button
                    variant="destructive"
                    onClick={() => handleSelfRating('again')}
                    disabled={submitting}
                    className="flex-col py-3 md:py-4 h-auto min-h-[56px]"
                  >
                    <span className="text-base font-semibold">不会</span>
                    <span className="text-[11px] opacity-80">重新学习</span>
                  </Button>
                  <Button
                    className="flex-col py-3 md:py-4 h-auto min-h-[56px] bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                    onClick={() => handleSelfRating('hard')}
                    disabled={submitting}
                  >
                    <span className="text-base font-semibold">模糊</span>
                    <span className="text-[11px] opacity-80">加强记忆</span>
                  </Button>
                  <Button
                    className="flex-col py-3 md:py-4 h-auto min-h-[56px] bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600"
                    onClick={() => handleSelfRating('good')}
                    disabled={submitting}
                  >
                    <span className="text-base font-semibold">基本掌握</span>
                    <span className="text-[11px] opacity-80">正常间隔</span>
                  </Button>
                  <Button
                    className="flex-col py-3 md:py-4 h-auto min-h-[56px] bg-green-700 hover:bg-green-800 text-white border-green-800"
                    onClick={() => handleSelfRating('easy')}
                    disabled={submitting}
                  >
                    <span className="text-base font-semibold">熟练</span>
                    <span className="text-[11px] opacity-80">延长间隔</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: 关联真题 */}
        <TabsContent value="questions">
          <Card>
             <CardHeader className="flex-row items-center justify-between">
               <div className="flex items-center gap-3">
                 <CardTitle className="text-base font-medium">
                   关联真题 ({questions.length})
                 </CardTitle>
                 {(() => {
                   const sources = Array.from(
                     new Set(
                       questions
                         .map((q) => q.source)
                         .filter((s): s is string => !!s),
                     ),
                   );
                   if (sources.length === 0) return null;
                   const shown = sources.slice(0, 5);
                   const extra = sources.length - shown.length;
                   return (
                     <span className="text-xs text-muted-foreground">
                       来自 {sources.length} 所院校：
                       <span className="text-sky-600">
                         {shown.join('、')}
                         {extra > 0 && ` +${extra} 所`}
                       </span>
                     </span>
                   );
                 })()}
               </div>
                <div className="flex items-center gap-2">
                 <Select value={questionFilter} onValueChange={setQuestionFilter}>
                   <SelectTrigger className="w-28 h-8 text-xs">
                     <SelectValue placeholder="筛选" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">全部</SelectItem>
                     <SelectItem value="undone">未做</SelectItem>
                     <SelectItem value="wrong">错题</SelectItem>
                   </SelectContent>
                 </Select>
                 <Select value={questionSort} onValueChange={setQuestionSort}>
                   <SelectTrigger className="w-28 h-8 text-xs">
                     <SelectValue placeholder="排序" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="year_desc">年份降序</SelectItem>
                     <SelectItem value="year_asc">年份升序</SelectItem>
                     <SelectItem value="type">按题型</SelectItem>
                   </SelectContent>
                 </Select>
                 <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
                   <DialogTrigger asChild>
                     <Button size="sm" variant="outline" className="h-8 text-xs">
                       <Plus className="h-3.5 w-3.5 mr-1" />
                       添加真题
                     </Button>
                   </DialogTrigger>
                   <DialogContent className="sm:max-w-lg">
                     <DialogHeader>
                       <DialogTitle className="text-base">添加关联真题</DialogTitle>
                     </DialogHeader>
                     <div className="space-y-3">
                       <div className="relative">
                         <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                           placeholder="搜索题干、院校、年份..."
                           value={qSearchKeyword}
                           onChange={(e) => setQSearchKeyword(e.target.value)}
                           className="pl-8 text-sm"
                           autoFocus
                         />
                       </div>
                       <ScrollArea className="h-80 border rounded-md">
                         {qSearching ? (
                           <div className="py-8 text-center text-sm text-muted-foreground">
                             搜索中...
                           </div>
                         ) : qSearchResults.length === 0 ? (
                           <div className="py-8 text-center text-sm text-muted-foreground">
                             暂无匹配真题
                           </div>
                         ) : (
                           <div>
                             {qSearchResults.map((q) => {
                               const isLinked = questions.some(
                                 (item) => item.id === q.id,
                               );
                               return (
                                 <button
                                   key={q.id}
                                   type="button"
                                   className="w-full text-left px-3 py-2.5 hover:bg-muted/60 border-b last:border-b-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                   onClick={() =>
                                     !isLinked && handleAddQuestion(q.id)
                                   }
                                   disabled={isLinked}
                                 >
                                   <div className="flex items-center justify-between gap-2 mb-1">
                                     <div className="flex items-center gap-2">
                                       <span className="text-[11px] px-1.5 py-px rounded bg-slate-100 text-slate-600">
                                         {q.year}
                                       </span>
                                       <span className="text-xs text-muted-foreground">
                                         {QUESTION_TYPE_LABEL[q.questionType]}
                                       </span>
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
                                   <div className="text-sm line-clamp-2">
                                     {q.questionText}
                                   </div>
                                   {q.source && (
                                     <div className="text-xs text-muted-foreground mt-0.5">
                                       {q.source}
                                     </div>
                                   )}
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
                         onClick={() => setQDialogOpen(false)}
                       >
                         取消
                       </Button>
                     </DialogFooter>
                   </DialogContent>
                 </Dialog>
               </div>
            </CardHeader>
            <CardContent className="p-0">
              {questionsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  暂无关联真题
                </div>
               ) : (
                 <>
                   {/* 桌面端表格 */}
                   <div className="hidden md:block overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead className="w-20">年份</TableHead>
                       <TableHead className="w-24">题型</TableHead>
                       <TableHead>题目</TableHead>
                        <TableHead className="w-20">难度</TableHead>
                        <TableHead className="w-20">状态</TableHead>
                        <TableHead className="w-36">操作</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {filteredQuestions.map((q) => {
                       const expanded = expandedQuestionId === q.id;
                       return (
                         <React.Fragment key={q.id}>
                           <TableRow
                             className="cursor-pointer hover:bg-muted/30"
                             onClick={() =>
                               setExpandedQuestionId(expanded ? null : q.id)
                             }
                           >
                             <TableCell className="text-sm">{q.year}</TableCell>
                             <TableCell className="text-sm">
                               {QUESTION_TYPE_LABEL[q.questionType]}
                             </TableCell>
                               <TableCell className="text-sm">
                                 <div className="mb-1">
                                   <QuestionTags
                                     year={null}
                                     source={q.source}
                                     sourceVariant="normal"
                                   />
                                 </div>
                                 <div className="flex items-center gap-2 mb-1 flex-wrap">
                                   <div className="line-clamp-1 flex-1 min-w-0">{q.questionText}</div>
                                   {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                     <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                       高频
                                     </span>
                                   )}
                                 </div>
                               </TableCell>
                               <TableCell className="text-sm">
                                  <div className="flex flex-col gap-1">
                                    <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                    <span className="text-xs text-muted-foreground">
                                      {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                    </span>
                                  </div>
                                </TableCell>
                              <TableCell className="text-sm">
                                 <Badge
                                   variant="outline"
                                   className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                 >
                                  {QUESTION_STATUS_LABEL[
                                    getQuestionStatus(q.answered, q.masteryScore)
                                  ]}
                                </Badge>
                              </TableCell>
                              <TableCell
                                className="text-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleRemoveQuestion(q.id)}
                                    disabled={removingQId === q.id}
                                    title="移除关联"
                                  >
                                    <X className="w-3.5 h-3.5 mr-1" />
                                    移除
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    disabled={!q.cardData || !hasCardData(q.cardData)}
                                    onClick={() =>
                                      setExpandedCardQuestionId(
                                        expandedCardQuestionId === q.id ? null : q.id
                                      )
                                    }
                                    title={
                                     q.cardData && hasCardData(q.cardData)
                                       ? '展开考点总结'
                                       : '暂无卡片'
                                   }
                                 >
                                   <Layers className="w-3.5 h-3.5 mr-1" />
                                   考点总结
                                 </Button>
                                 <Button
                                   size="sm"
                                   variant="ghost"
                                   className="h-7 px-2 text-xs"
                                   asChild
                                 >
                                   <UniversalLink
                                     to={resolveAppUrl(`/questions?id=${q.id}`)}
                                     target="_blank"
                                     rel="noopener noreferrer"
                                   >
                                     查看真题
                                     <ExternalLink className="w-3.5 h-3.5 ml-1" />
                                   </UniversalLink>
                                 </Button>
                               </div>
                             </TableCell>
                           </TableRow>
                            {expanded && (
                              <TableRow className="bg-muted/20">
                                <TableCell colSpan={6} className="py-4">
                                 <div className="space-y-3">
                                   <div>
                                     <div className="text-xs text-muted-foreground mb-1">题干</div>
                                     <div className="text-sm whitespace-pre-wrap">
                                       {q.questionText}
                                     </div>
                                   </div>
                                   {q.answer && (
                                     <div>
                                       <div className="text-xs text-muted-foreground mb-1">参考答案</div>
                                       <div className="text-sm whitespace-pre-wrap text-emerald-700 bg-emerald-50 rounded p-3 border border-emerald-100">
                                         {q.answer}
                                       </div>
                                     </div>
                                   )}
                                   {q.answerKeywords.length > 0 && (
                                     <div>
                                       <div className="text-xs text-muted-foreground mb-1">答案关键词</div>
                                       <div className="flex flex-wrap gap-1">
                                         {q.answerKeywords.map((kw, i) => (
                                           <Badge key={i} variant="outline" className="text-[11px]">
                                             {kw}
                                           </Badge>
                                         ))}
                                       </div>
                                     </div>
                                   )}
                                   {expandedCardQuestionId === q.id && q.cardData && hasCardData(q.cardData) && (
                                     <div className="pt-2 border-t border-dashed">
                                       <div className="text-xs text-muted-foreground mb-2">
                                         考点总结
                                       </div>
                                       <KnowledgeCardView
                                         data={q.cardData}
                                         title="考点总结卡片"
                                       />
                                     </div>
                                   )}
                                 </div>
                               </TableCell>
                             </TableRow>
                           )}
                            {expandedCardQuestionId === q.id && !expanded && q.cardData && hasCardData(q.cardData) && (
                              <TableRow className="bg-muted/20">
                                <TableCell colSpan={6} className="py-4">
                                 <div className="text-xs text-muted-foreground mb-2">
                                   考点总结
                                 </div>
                                 <KnowledgeCardView
                                   data={q.cardData}
                                   title="考点总结卡片"
                                 />
                               </TableCell>
                             </TableRow>
                           )}
                         </React.Fragment>
                       );
                     })}
                   </TableBody>
                 </Table>
                   </div>

                   {/* 手机端卡片列表 */}
                   <div className="md:hidden space-y-2 p-3">
                     {filteredQuestions.map((q) => {
                       const expanded = expandedQuestionId === q.id;
                       return (
                         <div key={q.id} className="border rounded-md">
                           <button
                             type="button"
                             className="w-full text-left p-3 hover:bg-muted/30 transition-colors min-h-[44px]"
                             onClick={() =>
                               setExpandedQuestionId(expanded ? null : q.id)
                             }
                           >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{q.year}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {QUESTION_TYPE_LABEL[q.questionType]}
                                  </Badge>
                                 <Badge
                                   variant="outline"
                                   className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                 >
                                    {QUESTION_STATUS_LABEL[
                                      getQuestionStatus(q.answered, q.masteryScore)
                                    ]}
                                  </Badge>
                                </div>
                                 <div>
                                    <div className="flex items-center gap-2">
                                      <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                      <span className="text-xs text-muted-foreground">
                                        {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                      </span>
                                    </div>
                                  </div>
                              </div>
                              <div className="mb-2">
                                <QuestionTags
                                  year={null}
                                  source={q.source}
                                  sourceVariant="normal"
                                />
                              </div>
                              <div className="flex items-start gap-2 mb-1">
                                <div className="text-sm line-clamp-2 text-muted-foreground flex-1 min-w-0">
                                  {q.questionText}
                                </div>
                                {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                  <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                                    高频
                                  </span>
                                )}
                              </div>
                           </button>
                           <div className="flex items-center gap-1 px-3 pb-3 border-t pt-2">
                             <Button
                               size="sm"
                               variant="outline"
                               className="h-9 flex-1 text-xs"
                               disabled={!q.cardData || !hasCardData(q.cardData)}
                               onClick={() =>
                                 setExpandedCardQuestionId(
                                   expandedCardQuestionId === q.id ? null : q.id
                                 )
                               }
                             >
                               <Layers className="w-3.5 h-3.5 mr-1" />
                               考点总结
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               className="h-9 flex-1 text-xs"
                               asChild
                             >
                               <UniversalLink
                                 to={resolveAppUrl(`/questions?id=${q.id}`)}
                                 target="_blank"
                                 rel="noopener noreferrer"
                               >
                                 查看真题
                                 <ExternalLink className="w-3.5 h-3.5 ml-1" />
                               </UniversalLink>
                             </Button>
                           </div>
                           {expanded && (
                             <div className="bg-muted/20 p-3 space-y-3 border-t">
                               <div>
                                 <div className="text-xs text-muted-foreground mb-1">题干</div>
                                 <div className="text-sm whitespace-pre-wrap">
                                   {q.questionText}
                                 </div>
                               </div>
                               {q.answer && (
                                 <div>
                                   <div className="text-xs text-muted-foreground mb-1">参考答案</div>
                                   <div className="text-sm whitespace-pre-wrap text-emerald-700 bg-emerald-50 rounded p-3 border border-emerald-100">
                                     {q.answer}
                                   </div>
                                 </div>
                               )}
                               {q.answerKeywords.length > 0 && (
                                 <div>
                                   <div className="text-xs text-muted-foreground mb-1">答案关键词</div>
                                   <div className="flex flex-wrap gap-1">
                                     {q.answerKeywords.map((kw, i) => (
                                       <Badge key={i} variant="outline" className="text-[11px]">
                                         {kw}
                                       </Badge>
                                     ))}
                                   </div>
                                 </div>
                               )}
                               {expandedCardQuestionId === q.id && q.cardData && hasCardData(q.cardData) && (
                                 <div className="pt-2 border-t border-dashed">
                                   <div className="text-xs text-muted-foreground mb-2">
                                     考点总结
                                   </div>
                                   <KnowledgeCardView
                                     data={q.cardData}
                                     title="考点总结卡片"
                                   />
                                 </div>
                               )}
                             </div>
                           )}
                           {expandedCardQuestionId === q.id && !expanded && q.cardData && hasCardData(q.cardData) && (
                             <div className="bg-muted/20 p-3 border-t">
                               <div className="text-xs text-muted-foreground mb-2">
                                 考点总结
                               </div>
                               <KnowledgeCardView
                                 data={q.cardData}
                                 title="考点总结卡片"
                               />
                             </div>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 </>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: 复习历史 */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                复习历史 ({records.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recordsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : records.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  暂无复习记录
                </div>
              ) : (
                <div className="relative px-6 py-4">
                  <div className="absolute left-[26px] top-6 bottom-6 w-px bg-border" />
                  <div className="space-y-4">
                    {records.map((r) => {
                      const isUp = r.newMasteryScore >= r.oldMasteryScore;
                      return (
                        <div key={r.id} className="relative pl-10">
                          <div
                            className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-background ${
                              isUp ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-medium">
                              {new Date(r.reviewedAt).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {SELF_RATING_LABEL[
                                r.selfRating as keyof typeof SELF_RATING_LABEL
                              ] ?? r.selfRating}
                            </Badge>
                            <span className="text-xs">
                              <span className="text-muted-foreground">掌握度 </span>
                              <span className={isUp ? 'text-emerald-600' : 'text-red-600'}>
                                {r.oldMasteryScore} → {r.newMasteryScore}
                              </span>
                            </span>
                            {r.nextReviewAt && (
                              <span className="text-xs text-muted-foreground">
                                下次复习：{formatDate(r.nextReviewAt)}
                              </span>
                            )}
                          </div>
                          {r.notes && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {r.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function ratingToScore(rating: SelfRating): number {
  switch (rating) {
    case 'again':
      return 0;
    case 'hard':
      return 40;
    case 'good':
      return 70;
    case 'easy':
      return 100;
    default:
      return 50;
  }
}

export default KnowledgePointDetailPage;
