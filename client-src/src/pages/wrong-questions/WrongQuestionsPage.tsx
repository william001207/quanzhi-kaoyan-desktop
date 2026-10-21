import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Trash2, AlertCircle, Trophy, CheckCircle2, Tag, XCircle, BookOpen, Flag, BookOpen as BookOpenIcon } from 'lucide-react';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import {
   Tabs,
   TabsContent,
   TabsList,
   TabsTrigger,
 } from '@/components/ui/tabs';
import type { WeakMarkKnowledgePoint } from '@shared/api.interface';
import { WEAK_MARK_REASON_LABEL } from '@shared/api.interface';
import { useNavigate } from 'react-router-dom';
import * as api from '@/api';
import { emitWeakMarkChanged, onWeakMarkChanged } from '@/utils/weak-mark-bus';
import type {
   Subject,
   TopWrongItem,
   WrongQuestionWithDetail,
   MistakeReason,
   WrongQuestionStats,
   WrongSubjectDistributionItem,
   WrongReasonDistributionItem,
   ErrorTag,
   ErrorTagDistributionItem,
 } from '@shared/api.interface';
import { QUESTION_TYPE_LABEL, MISTAKE_REASON_LABEL, ERROR_TAG_LABEL, ERROR_TAG_VALUES } from '@shared/api.interface';
import QuestionAnswerDialog from '../questions/QuestionAnswerDialog';
import { QuestionTags } from '@/components/question-tags';
import { QuestionDifficultyStars } from '@/components/question-difficulty';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  iconColor?: string;
  description?: string;
  loading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor,
  description,
  loading,
}) => (
  <Card>
    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon
        className={`h-4 w-4 ${iconColor ?? 'text-muted-foreground'}`}
      />
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </>
      )}
    </CardContent>
  </Card>
);

const REASON_COLORS: Record<string, string> = {
  knowledge_gap: '#ef4444',
  memory_blur: '#f59e0b',
  reading_error: '#3b82f6',
  expression_incomplete: '#8b5cf6',
  concept_confusion: '#10b981',
  other: '#94a3b8',
  unmarked: '#cbd5e1',
};

const ERROR_TAG_COLORS: Record<string, string> = {
  concept_confusion: '#f97316',
  knowledge_forgotten: '#3b82f6',
  reading_error: '#ef4444',
  incomplete_answer: '#8b5cf6',
  understanding_bias: '#06b6d4',
  other: '#64748b',
  unmarked: '#cbd5e1',
};

const WrongQuestionsPage: React.FC = () => {
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  // 统计数据
  const [stats, setStats] = useState<WrongQuestionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // 错题列表
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestionWithDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // 筛选 + 搜索
  const [subjectId, setSubjectId] = useState<string>('');
  const [resolvedFilter, setResolvedFilter] = useState<string>('unresolved');
  const [mistakeReasonFilter, setMistakeReasonFilter] = useState<string>('');
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [errorTagFilter, setErrorTagFilter] = useState<Set<string>>(new Set());
  const [tagEditingId, setTagEditingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // 解决二次确认
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);

  // 批量移除确认
   const [batchRemoveDialogOpen, setBatchRemoveDialogOpen] = useState(false);
   // 清空全部确认
   const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
   const [clearAllMode, setClearAllMode] = useState<'unresolved' | 'all'>('unresolved');

  // Tab
  const [activeTab, setActiveTab] = useState<'wrong' | 'weak'>('wrong');

  // 薄弱知识点列表
  const [weakKps, setWeakKps] = useState<WeakMarkKnowledgePoint[]>([]);
  const [weakTotal, setWeakTotal] = useState(0);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakPage, setWeakPage] = useState(1);
  const [weakPageSize] = useState(20);
  const [weakSubjectId, setWeakSubjectId] = useState<string>('');
  const [weakKeyword, setWeakKeyword] = useState('');
  const [weakDebouncedKeyword, setWeakDebouncedKeyword] = useState('');
  const weakKeywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weakUnmarkingIds, setWeakUnmarkingIds] = useState<Set<string>>(new Set());

  // 加载科目 + 统计（并行）
  useEffect(() => {
    const load = async () => {
      try {
        const [subjectsResult, statsResult] = await Promise.all([
          api.subjects.getAll(),
          api.wrongQuestions.getStats(),
        ]);
        setSubjects(subjectsResult);
        setStats(statsResult);
      } catch (err) {
        logger.error('加载基础数据失败', err);
        toast.error('加载数据失败');
      } finally {
        setSubjectsLoading(false);
        setStatsLoading(false);
      }
    };
    load();
  }, []);

  // 搜索防抖 300ms
  useEffect(() => {
    if (keywordTimerRef.current) {
      clearTimeout(keywordTimerRef.current);
    }
    keywordTimerRef.current = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setPage(1);
    }, 300);
    return () => {
      if (keywordTimerRef.current) {
        clearTimeout(keywordTimerRef.current);
      }
    };
   }, [keyword]);

  // 薄弱知识点搜索防抖
  useEffect(() => {
    if (weakKeywordTimerRef.current) {
      clearTimeout(weakKeywordTimerRef.current);
    }
    weakKeywordTimerRef.current = setTimeout(() => {
      setWeakDebouncedKeyword(weakKeyword.trim());
      setWeakPage(1);
    }, 300);
    return () => {
      if (weakKeywordTimerRef.current) {
        clearTimeout(weakKeywordTimerRef.current);
      }
    };
  }, [weakKeyword]);

   // 重新加载 stats
   const reloadStats = async () => {
    try {
      const result = await api.wrongQuestions.getStats();
      setStats(result);
    } catch (err) {
      logger.error('刷新统计数据失败', err);
    }
  };

   // 加载错题列表
   useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
         const result = await api.wrongQuestions.list({
           page,
           pageSize,
           subjectId: subjectId || undefined,
           resolved:
             resolvedFilter === 'all'
               ? undefined
               : resolvedFilter === 'resolved',
           mistakeReason: mistakeReasonFilter || undefined,
           errorTags: errorTagFilter.size > 0 ? Array.from(errorTagFilter) : undefined,
           keyword: debouncedKeyword || undefined,
         });
        setWrongQuestions(result.items);
        setTotal(result.total);
      } catch (err) {
        logger.error('加载错题失败', err);
        toast.error('加载错题失败');
      } finally {
        setLoading(false);
      }
    };
    load();
   }, [page, pageSize, subjectId, resolvedFilter, mistakeReasonFilter, errorTagFilter, debouncedKeyword]);

  // 加载薄弱知识点列表
  useEffect(() => {
    if (activeTab !== 'weak') return;
    const load = async () => {
      setWeakLoading(true);
      try {
        const result = await api.wrongQuestions.getWeakKnowledgePoints({
          page: weakPage,
          pageSize: weakPageSize,
          subjectId: weakSubjectId || undefined,
          search: weakDebouncedKeyword || undefined,
        });
        setWeakKps(result.items);
        setWeakTotal(result.total);
      } catch (err) {
        logger.error('加载薄弱知识点失败', err);
        toast.error('加载薄弱知识点失败');
      } finally {
        setWeakLoading(false);
      }
    };
     load();
   }, [activeTab, weakPage, weakPageSize, weakSubjectId, weakDebouncedKeyword]);

   useEffect(() => {
     if (activeTab !== 'weak') return;
     return onWeakMarkChanged(() => {
       const load = async () => {
         try {
           const result = await api.wrongQuestions.getWeakKnowledgePoints({
             page: weakPage,
             pageSize: weakPageSize,
             subjectId: weakSubjectId || undefined,
             search: weakDebouncedKeyword || undefined,
           });
           setWeakKps(result.items);
           setWeakTotal(result.total);
         } catch {
           // ignore refresh errors
         }
       };
       load();
     });
   }, [activeTab, weakPage, weakPageSize, weakSubjectId, weakDebouncedKeyword]);

  const handleWeakUnmark = async (id: string) => {
    setWeakUnmarkingIds((prev) => new Set(prev).add(id));
    try {
       await api.knowledgePoints.unmarkWeak(id);
       emitWeakMarkChanged();
       toast.success('已取消薄弱标记');
      setWeakKps((prev) => prev.filter((kp) => kp.id !== id));
      setWeakTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      logger.error('取消薄弱标记失败', err);
      toast.error('操作失败，请重试');
    } finally {
      setWeakUnmarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const weakTotalPages = Math.max(1, Math.ceil(weakTotal / weakPageSize));

  // 列表数据变化时清空选中
  useEffect(() => {
    setSelectedIds(new Set());
  }, [wrongQuestions]);

  const topWrong = stats?.topWrong ?? [];

  // 错因标签分布数据（按固定顺序排列）
  const errorTagDistribution = useMemo(() => {
    if (!stats) return [];
    const byTagMap = new Map<string, number>();
    stats.byErrorTags.forEach((item: ErrorTagDistributionItem) => {
      byTagMap.set(item.tag, item.count);
    });
    const result: { tag: string; label: string; count: number }[] = [];
    ERROR_TAG_VALUES.forEach((t) => {
      result.push({
        tag: t,
        label: ERROR_TAG_LABEL[t],
        count: byTagMap.get(t) ?? 0,
      });
    });
    result.push({
      tag: 'unmarked',
      label: '未标记',
      count: byTagMap.get('unmarked') ?? 0,
    });
    return result;
  }, [stats]);

  const maxErrorTagCount = useMemo(() => {
    if (errorTagDistribution.length === 0) return 0;
    return Math.max(...errorTagDistribution.map((d) => d.count), 1);
  }, [errorTagDistribution]);

  const handleRetry = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setDialogOpen(true);
  };

  const handleMarkResolved = (id: string) => {
    setConfirmResolveId(id);
  };

  const doMarkResolved = async () => {
    if (!confirmResolveId) return;
    try {
      await api.wrongQuestions.update(confirmResolveId, { resolved: true });
      toast.success('已标记为解决');
      setConfirmResolveId(null);
      setPage(1);
      await reloadStats();
    } catch (err) {
      logger.error('标记解决失败', err);
      toast.error('操作失败，请重试');
    }
  };

  const handleRetryFromResolveConfirm = () => {
    if (!confirmResolveId) return;
    const wq = wrongQuestions.find((w) => w.id === confirmResolveId);
    if (wq) {
      setConfirmResolveId(null);
      handleRetry(wq.questionId);
    }
  };

  const handleDialogSubmitted = () => {
    setPage(1);
    reloadStats();
    toast('可以在错题列表中标记错因', { description: '点击错因列选择错因标签', duration: 3000 });
  };

  const toggleErrorTagFilter = (tag: string) => {
    setErrorTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
    setPage(1);
  };

  const handleToggleErrorTag = async (wqId: string, currentTags: ErrorTag[], tag: ErrorTag) => {
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    try {
      await api.wrongQuestions.update(wqId, { errorTags: newTags });
      toast.success('错因标签已更新');
      setWrongQuestions((prev) =>
        prev.map((item) =>
          item.id === wqId ? { ...item, errorTags: newTags } : item,
        ),
      );
      reloadStats();
    } catch (err) {
      logger.error('更新错因标签失败', err);
      toast.error('更新失败');
    }
  };

  const confirmRemove = (id: string) => {
    setRemovingId(id);
    setRemoveDialogOpen(true);
  };

  const handleRemove = async () => {
    if (!removingId) return;
    try {
      await api.wrongQuestions.remove(removingId);
      toast.success('错题已移除');
      setRemoveDialogOpen(false);
      setRemovingId(null);
      setWrongQuestions((prev) =>
        prev.filter((wq) => wq.id !== removingId),
      );
      setTotal((prev) => Math.max(0, prev - 1));
      await reloadStats();
    } catch (err) {
      logger.error('移除错题失败', err);
      toast.error('移除失败，请重试');
    }
  };

  // 全选/取消全选当前页
  const allSelectedOnPage = wrongQuestions.length > 0
    && wrongQuestions.every((wq) => selectedIds.has(wq.id));

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(wrongQuestions.map((wq) => wq.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  // 批量移除
  const handleBatchRemove = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await api.wrongQuestions.batchRemove({
        ids: Array.from(selectedIds),
      });
      toast.success(`已移除 ${result.deletedCount} 道错题`);
      setBatchRemoveDialogOpen(false);
      setSelectedIds(new Set());
      setPage(1);
      await reloadStats();
    } catch (err) {
      logger.error('批量移除失败', err);
      toast.error('批量移除失败，请重试');
    }
  };

  // 清空全部
  const handleClearAll = async () => {
    try {
      const result = await api.wrongQuestions.batchRemove({
        onlyUnresolved: clearAllMode === 'unresolved',
      });
      toast.success(`已清空 ${result.deletedCount} 道错题`);
      setClearAllDialogOpen(false);
      setSelectedIds(new Set());
      setPage(1);
      await reloadStats();
    } catch (err) {
      logger.error('清空错题失败', err);
      toast.error('清空失败，请重试');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const getQuestionTypeLabel = (type: string): string => {
    const key = type as keyof typeof QUESTION_TYPE_LABEL;
    return QUESTION_TYPE_LABEL[key] ?? type;
  };

  // 按科目分布柱状图数据（前 5 + 其他）
  const subjectChartData = useMemo(() => {
    if (!stats) return [];
    const sorted = [...stats.bySubject].sort(
      (a: WrongSubjectDistributionItem, b: WrongSubjectDistributionItem) =>
        b.unresolvedCount - a.unresolvedCount,
    );
    if (sorted.length <= 5) {
      return sorted.map((s) => ({
        subject: s.subjectName,
        未解决: s.unresolvedCount,
      }));
    }
    const top = sorted.slice(0, 5);
    const others = sorted.slice(5);
    const othersCount = others.reduce(
      (sum: number, item: WrongSubjectDistributionItem) =>
        sum + item.unresolvedCount,
      0,
    );
    return [
      ...top.map((s) => ({
        subject: s.subjectName,
        未解决: s.unresolvedCount,
      })),
      { subject: '其他', 未解决: othersCount },
    ];
  }, [stats]);

  // 按错因分布环形图数据
  const reasonChartData = useMemo(() => {
    if (!stats) return [];
    const byReasonMap = new Map<string, number>();
    stats.byReason.forEach((item: WrongReasonDistributionItem) => {
      const key = item.mistakeReason ?? 'unmarked';
      byReasonMap.set(key, item.count);
    });
    const result: { name: string; value: number; key: string }[] = [];
    (Object.keys(MISTAKE_REASON_LABEL) as MistakeReason[]).forEach((r) => {
      result.push({
        name: MISTAKE_REASON_LABEL[r],
        value: byReasonMap.get(r) ?? 0,
        key: r,
      });
    });
    result.push({
      name: '未标注',
      value: byReasonMap.get('unmarked') ?? 0,
      key: 'unmarked',
    });
    return result;
  }, [stats]);

  const clearAllCount = clearAllMode === 'unresolved'
    ? stats?.overview.unresolvedCount ?? 0
    : stats?.overview.totalCount ?? 0;

   return (
     <div className="p-3 md:p-6">
       <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">错题本</h1>

       <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'wrong' | 'weak')}>
         <TabsList className="mb-6">
           <TabsTrigger value="wrong" className="flex items-center gap-1.5">
             <XCircle className="h-4 w-4" />
             真题错题
           </TabsTrigger>
           <TabsTrigger value="weak" className="flex items-center gap-1.5">
             <Flag className="h-4 w-4" />
             薄弱知识点
           </TabsTrigger>
         </TabsList>

         <TabsContent value="wrong">
       <div className="space-y-6">
        {/* 统计区 */}
        <div>
          {/* 数字卡 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard
              title="未解决错题"
              value={stats ? String(stats.overview.unresolvedCount) : '--'}
              icon={XCircle}
              iconColor="text-destructive"
              description="需要重点关注"
              loading={statsLoading}
            />
            <StatCard
              title="已掌握错题"
              value={stats ? String(stats.overview.resolvedCount) : '--'}
              icon={CheckCircle2}
              iconColor="text-emerald-600"
              description="已标记为解决"
              loading={statsLoading}
            />
            <StatCard
              title="累计错题"
              value={stats ? String(stats.overview.totalCount) : '--'}
              icon={BookOpen}
              iconColor="text-blue-600"
              description={
                stats
                  ? `掌握率 ${(stats.overview.masteryRate * 100).toFixed(1)}%`
                  : ''
              }
              loading={statsLoading}
            />
          </div>

          {/* 两个图表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* 按科目分布 - 横向柱状图 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  按科目分布（未解决）
                </CardTitle>
              </CardHeader>
              <CardContent className="min-h-72 h-auto sm:h-72">
                {statsLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-5 w-full" />
                      </div>
                    ))}
                  </div>
                ) : subjectChartData.length > 0 &&
                  subjectChartData.some((d) => d.未解决 > 0) ? (
                  <ChartContainer
                    config={{
                      未解决: { color: '#ef4444' },
                    }}
                    className="h-full w-full min-h-[240px]"
                  >
                    <BarChart data={subjectChartData} layout="vertical">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={true}
                        vertical={false}
                      />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="subject"
                        tick={{ fontSize: 12 }}
                        width={100}
                        interval={0}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="未解决"
                        fill="#ef4444"
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    暂无数据
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 按错因分布 - 环形图 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  按错因分布
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {statsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Skeleton className="h-40 w-40 rounded-full" />
                  </div>
                ) : reasonChartData.length > 0 &&
                  reasonChartData.reduce((a, b) => a + b.value, 0) > 0 ? (
                  <ChartContainer
                    config={Object.fromEntries(
                      reasonChartData.map((d) => [
                        d.name,
                        { color: REASON_COLORS[d.key] ?? '#94a3b8' },
                      ]),
                    )}
                    className="h-full w-full"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel />}
                      />
                      <Pie
                        data={reasonChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={1}
                      >
                        {reasonChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              REASON_COLORS[entry.key] ??
                              REASON_COLORS.other
                            }
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    暂无数据
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

           {/* 错因标签分布 */}
           <Card className="mb-4">
             <CardHeader className="pb-2">
               <div className="flex items-center gap-2">
                 <Tag className="h-4 w-4 text-orange-500" />
                 <CardTitle className="text-base font-medium">
                   错因标签分布（未解决）
                 </CardTitle>
               </div>
             </CardHeader>
             <CardContent>
               {statsLoading ? (
                 <div className="space-y-3">
                   {[...Array(6)].map((_, i) => (
                     <div key={i} className="space-y-1">
                       <Skeleton className="h-4 w-24" />
                       <Skeleton className="h-5 w-full" />
                     </div>
                   ))}
                 </div>
               ) : errorTagDistribution.some((d) => d.count > 0) ? (
                 <div className="space-y-2">
                   {errorTagDistribution.map((item) => (
                     <div key={item.tag} className="flex items-center gap-3">
                       <div className="flex items-center gap-2 w-24 flex-shrink-0">
                         <span
                           className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                           style={{ backgroundColor: ERROR_TAG_COLORS[item.tag] }}
                         />
                         <span className="text-xs text-foreground truncate">
                           {item.label}
                         </span>
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="h-5 rounded-full bg-muted overflow-hidden relative">
                           <div
                             className="h-full rounded-full transition-all duration-300"
                             style={{
                               width: `${(item.count / maxErrorTagCount) * 100}%`,
                               backgroundColor: ERROR_TAG_COLORS[item.tag],
                             }}
                           />
                         </div>
                       </div>
                       <div className="w-10 text-right text-xs font-medium text-muted-foreground flex-shrink-0">
                         {item.count}
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="py-8 text-center text-sm text-muted-foreground">
                   暂无数据
                 </div>
               )}
             </CardContent>
           </Card>

           {/* 反复错误 TOP 10 */}
           <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-base font-medium">
                  反复错误 TOP 10
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-96 sm:max-h-none overflow-y-auto sm:overflow-visible">
              {statsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : topWrong.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">排名</TableHead>
                        <TableHead>题目</TableHead>
                        <TableHead className="w-24 text-center">
                          错误次数
                        </TableHead>
                        <TableHead className="w-48">对应知识点</TableHead>
                        <TableHead className="w-32">科目</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topWrong.map((item: TopWrongItem) => (
                        <TableRow
                          key={item.questionId}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => {
                            if (item.knowledgePointId) {
                              navigate(
                                `/knowledge-points/${item.knowledgePointId}`,
                              );
                            }
                          }}
                        >
                          <TableCell>
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium ${
                                item.rank <= 3
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {item.rank}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm max-w-md">
                            <div className="line-clamp-2">
                              {item.questionText ||
                                `错题 #${item.questionId.slice(0, 8)}`}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`font-medium ${
                                item.wrongCount >= 3
                                  ? 'text-destructive'
                                  : item.wrongCount >= 2
                                    ? 'text-amber-600'
                                    : 'text-foreground'
                              }`}
                            >
                              {item.wrongCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.knowledgePointId &&
                            item.knowledgePointTitle ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-primary truncate max-w-[12rem] block">
                                  {item.knowledgePointTitle}
                                </span>
                                <ChapterPathBadges
                                  chapterPaths={item.chapterPaths}
                                  size="xs"
                                />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                未关联
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.subjectName}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 错题列表区 */}
        <div>
          {/* 筛选栏 */}
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索题干..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="pl-8 w-full"
                  />
                </div>
                <div className="w-full sm:w-36">
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      setPage(1);
                    }}
                    disabled={subjectsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择科目" />
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
                <div className="w-full sm:w-32">
                  <Select
                    value={resolvedFilter}
                    onValueChange={(v) => {
                      setResolvedFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="unresolved">未解决</SelectItem>
                      <SelectItem value="resolved">已解决</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-32">
                   <Select
                     value={mistakeReasonFilter}
                     onValueChange={(v) => {
                       setMistakeReasonFilter(v);
                       setPage(1);
                     }}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="错因" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="">全部错因</SelectItem>
                       {(Object.keys(MISTAKE_REASON_LABEL) as MistakeReason[]).map(
                         (r) => (
                           <SelectItem key={r} value={r}>
                             {MISTAKE_REASON_LABEL[r]}
                           </SelectItem>
                         ),
                       )}
                     </SelectContent>
                   </Select>
                 </div>
                 <div className="w-full sm:flex-1 min-w-0">
                   <div className="text-xs text-muted-foreground mb-1">错因标签</div>
                   <div className="flex flex-wrap gap-1.5">
                     {ERROR_TAG_VALUES.map((tag) => {
                       const selected = errorTagFilter.has(tag);
                       const color = ERROR_TAG_COLORS[tag];
                       return (
                         <button
                           key={tag}
                           type="button"
                           onClick={() => toggleErrorTagFilter(tag)}
                           className={`px-2.5 py-1 text-xs rounded-full transition-colors border ${selected ? 'text-white border-transparent' : 'bg-transparent text-muted-foreground hover:text-foreground border-border'}`}
                           style={selected ? { backgroundColor: color } : undefined}
                         >
                           {ERROR_TAG_LABEL[tag]}
                         </button>
                       );
                     })}
                     <button
                       type="button"
                       onClick={() => toggleErrorTagFilter('unmarked')}
                       className={`px-2.5 py-1 text-xs rounded-full transition-colors border ${errorTagFilter.has('unmarked') ? 'text-white border-transparent bg-slate-400' : 'bg-transparent text-muted-foreground hover:text-foreground border-border'}`}
                     >
                       未标记
                     </button>
                   </div>
                 </div>
               </div>
            </CardContent>
          </Card>

          {/* 批量操作栏（仅桌面端显示，且有选中项或固定显示） */}
          {selectedIds.size > 0 && (
            <div className="hidden md:flex items-center justify-between mb-4 px-4 py-3 bg-muted/40 rounded-lg border">
              <div className="text-sm text-muted-foreground">
                已选择{' '}
                <span className="font-medium text-foreground">
                  {selectedIds.size}
                </span>{' '}
                项
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBatchRemoveDialogOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  批量移除
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setClearAllMode('unresolved');
                    setClearAllDialogOpen(true);
                  }}
                >
                  <AlertCircle className="h-3.5 w-3.5 mr-1" />
                  清空全部错题
                </Button>
              </div>
            </div>
          )}

          {/* 错题列表 */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : wrongQuestions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无错题，继续加油！
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={allSelectedOnPage}
                              onCheckedChange={handleToggleAll}
                              aria-label="全选当前页"
                            />
                          </TableHead>
                          <TableHead>题目</TableHead>
                          <TableHead className="w-28">年份/题型</TableHead>
                          <TableHead className="w-32">难度/作答</TableHead>
                          <TableHead className="w-32">对应知识点</TableHead>
                          <TableHead className="w-20 text-center">
                            错误次数
                          </TableHead>
                          <TableHead className="w-28">错因</TableHead>
                          <TableHead className="w-28">上次错误</TableHead>
                          <TableHead className="w-20">状态</TableHead>
                          <TableHead className="w-32 text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wrongQuestions.map((wq) => (
                          <TableRow key={wq.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(wq.id)}
                                onCheckedChange={(checked) =>
                                  handleToggleOne(wq.id, !!checked)
                                }
                                aria-label="选择此错题"
                              />
                            </TableCell>
                             <TableCell className="text-sm max-w-md">
                               <div className="flex items-start gap-2">
                                 <button
                                   type="button"
                                   onClick={() => handleRetry(wq.questionId)}
                                   className="text-left hover:text-primary hover:underline w-full"
                                 >
                                   <div className="line-clamp-2">
                                     {wq.questionText ||
                                       `错题 #${wq.id.slice(0, 8)}`}
                                   </div>
                                 </button>
                                 {wq.examFrequency !== undefined && wq.examFrequency >= 3 && (
                                   <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                                     高频
                                   </span>
                                 )}
                               </div>
                             </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="mb-1">
                                <QuestionTags
                                  year={wq.questionYear}
                                  source={wq.questionSource}
                                  yearVariant="normal"
                                  sourceVariant="normal"
                                />
                              </div>
                              <div className="text-xs">
                                {getQuestionTypeLabel(wq.questionType)}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <QuestionDifficultyStars
                                  difficulty={wq.difficulty}
                                  size="sm"
                                />
                                <span className="text-xs text-muted-foreground">
                                  {wq.answerCount > 0
                                    ? `已答${wq.answerCount}次`
                                    : '未答'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {wq.knowledgePoints &&
                              wq.knowledgePoints.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {wq.knowledgePoints.map((kp) => (
                                    <Badge
                                      key={kp.id}
                                      variant="outline"
                                      className="text-xs cursor-pointer hover:bg-muted"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(
                                          `/knowledge-points/${kp.id}`,
                                        );
                                      }}
                                    >
                                      {kp.title}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  未关联
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`font-medium ${
                                  wq.wrongCount >= 3
                                    ? 'text-destructive'
                                    : wq.wrongCount >= 2
                                      ? 'text-amber-600'
                                      : 'text-foreground'
                                }`}
                              >
                                {wq.wrongCount}
                              </span>
                            </TableCell>
                             <TableCell>
                               <div className="space-y-1.5">
                                 {editingReasonId === wq.id ? (
                                   <Select
                                     value={wq.mistakeReason || ''}
                                     onValueChange={async (v) => {
                                       try {
                                         await api.wrongQuestions.update(wq.id, {
                                           mistakeReason: v || undefined,
                                         });
                                         toast.success('错因已更新');
                                         setWrongQuestions((prev) =>
                                           prev.map((item) =>
                                             item.id === wq.id
                                               ? {
                                                   ...item,
                                                   mistakeReason: v || null,
                                                 }
                                               : item,
                                           ),
                                         );
                                         reloadStats();
                                       } catch (err) {
                                         logger.error('更新错因失败', err);
                                         toast.error('更新失败');
                                       } finally {
                                         setEditingReasonId(null);
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="h-7 text-xs w-full">
                                       <SelectValue placeholder="选择错因" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="">未标注</SelectItem>
                                       {(
                                         Object.keys(
                                           MISTAKE_REASON_LABEL,
                                         ) as MistakeReason[]
                                       ).map((r) => (
                                         <SelectItem
                                           key={r}
                                           value={r}
                                           className="text-xs"
                                         >
                                           {MISTAKE_REASON_LABEL[r]}
                                         </SelectItem>
                                       ))}
                                     </SelectContent>
                                   </Select>
                                 ) : (
                                   <button
                                     type="button"
                                     onClick={() => setEditingReasonId(wq.id)}
                                     className="text-left"
                                   >
                                     {wq.mistakeReason ? (
                                       <Badge
                                         variant="outline"
                                         className="text-xs border-amber-200 text-amber-700 bg-amber-50"
                                       >
                                         <Tag className="h-3 w-3 mr-1" />
                                         {MISTAKE_REASON_LABEL[
                                           wq.mistakeReason as MistakeReason
                                         ] ?? wq.mistakeReason}
                                       </Badge>
                                     ) : (
                                       <span className="text-xs text-muted-foreground hover:text-foreground">
                                         未标注
                                       </span>
                                     )}
                                   </button>
                                 )}
                                 <div className="flex flex-wrap gap-1">
                                   {wq.errorTags && wq.errorTags.length > 0 ? (
                                     wq.errorTags.map((tag) => (
                                       <span
                                         key={tag}
                                         className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full text-white"
                                         style={{ backgroundColor: ERROR_TAG_COLORS[tag] }}
                                       >
                                         {ERROR_TAG_LABEL[tag as ErrorTag]}
                                       </span>
                                     ))
                                   ) : (
                                     <span className="text-[10px] text-muted-foreground/70">
                                       未标记错因标签
                                     </span>
                                   )}
                                 </div>
                               </div>
                             </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(wq.lastWrongAt)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  wq.resolved ? 'secondary' : 'destructive'
                                }
                                className="text-xs"
                              >
                                {wq.resolved ? '已解决' : '未解决'}
                              </Badge>
                            </TableCell>
                             <TableCell className="text-right">
                               <div className="flex items-center justify-end gap-1 relative">
                                 <div className="relative">
                                   <Button
                                     size="sm"
                                     variant="ghost"
                                     onClick={() => setTagEditingId(tagEditingId === wq.id ? null : wq.id)}
                                     className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                     aria-label="标记错因标签"
                                   >
                                     <Tag className="h-3.5 w-3.5 mr-1" />
                                     错因
                                   </Button>
                                   {tagEditingId === wq.id && (
                                     <div className="absolute right-0 top-full mt-1 z-10 w-44 bg-background border rounded-lg shadow-lg p-2 text-left">
                                       <div className="text-xs text-muted-foreground mb-2 px-1">点击标签切换</div>
                                       <div className="space-y-1">
                                         {ERROR_TAG_VALUES.map((tag) => {
                                           const active = wq.errorTags?.includes(tag);
                                           const color = ERROR_TAG_COLORS[tag];
                                           return (
                                             <button
                                               key={tag}
                                               type="button"
                                               onClick={() => handleToggleErrorTag(wq.id, wq.errorTags ?? [], tag)}
                                               className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${active ? 'text-white' : 'hover:bg-muted text-foreground'}`}
                                               style={active ? { backgroundColor: color } : undefined}
                                             >
                                               <span
                                                 className="w-2 h-2 rounded-full flex-shrink-0"
                                                 style={{ backgroundColor: active ? '#fff' : color }}
                                               />
                                               {ERROR_TAG_LABEL[tag]}
                                             </button>
                                           );
                                         })}
                                       </div>
                                       <button
                                         type="button"
                                         onClick={() => setTagEditingId(null)}
                                         className="w-full mt-1 text-xs text-muted-foreground hover:text-foreground py-1 text-center"
                                       >
                                         完成
                                       </button>
                                     </div>
                                   )}
                                 </div>
                                 <Button
                                   size="sm"
                                   variant="ghost"
                                   onClick={() => handleRetry(wq.questionId)}
                                 >
                                   重做
                                 </Button>
                                 {!wq.resolved && (
                                   <Button
                                     size="sm"
                                     variant="ghost"
                                     onClick={() => handleMarkResolved(wq.id)}
                                     className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                   >
                                     <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                     解决
                                   </Button>
                                 )}
                                 <Button
                                   size="sm"
                                   variant="ghost"
                                   onClick={() => confirmRemove(wq.id)}
                                   className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                   aria-label="移除此错题"
                                 >
                                   <Trash2 className="h-3.5 w-3.5 mr-1" />
                                   移除
                                 </Button>
                               </div>
                             </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* 移动端卡片列表 */}
                  <div className="md:hidden space-y-3 p-3">
                    {wrongQuestions.map((wq) => (
                      <Card key={wq.id}>
                        <CardContent className="p-3 space-y-2">
                          {/* 顶部：年份/题型 + 状态 */}
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 flex-wrap">
                               <QuestionTags
                                 year={wq.questionYear}
                                 source={wq.questionSource}
                                 yearVariant="normal"
                                 sourceVariant="normal"
                               />
                               <span className="text-xs text-muted-foreground">
                                 {getQuestionTypeLabel(wq.questionType)}
                               </span>
                             </div>
                             <div className="flex items-center gap-2">
                               <QuestionDifficultyStars
                                 difficulty={wq.difficulty}
                                 size="sm"
                               />
                               <span className="text-xs text-muted-foreground">
                                 {wq.answerCount > 0
                                   ? `已答${wq.answerCount}次`
                                   : '未答'}
                               </span>
                             </div>
                            <Badge
                              variant={
                                wq.resolved ? 'secondary' : 'destructive'
                              }
                              className="text-xs flex-shrink-0"
                            >
                              {wq.resolved ? '已解决' : '未解决'}
                            </Badge>
                          </div>
                           {/* 题目 */}
                           <div className="flex items-start gap-2">
                             <button
                               type="button"
                               onClick={() => handleRetry(wq.questionId)}
                               className="text-sm line-clamp-2 text-left hover:text-primary flex-1 min-w-0"
                             >
                               {wq.questionText ||
                                 `错题 #${wq.id.slice(0, 8)}`}
                             </button>
                             {wq.examFrequency !== undefined && wq.examFrequency >= 3 && (
                               <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                                 高频
                               </span>
                             )}
                           </div>
                          {/* 知识点 */}
                          {wq.knowledgePoints &&
                          wq.knowledgePoints.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {wq.knowledgePoints.map((kp) => (
                                <Badge
                                  key={kp.id}
                                  variant="outline"
                                  className="text-xs cursor-pointer hover:bg-muted"
                                  onClick={() =>
                                    navigate(
                                      `/knowledge-points/${kp.id}`,
                                    )
                                  }
                                >
                                  {kp.title}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              未关联知识点
                            </div>
                          )}
                           {/* 错因 */}
                           <div className="flex items-center gap-1 flex-wrap">
                             <span className="text-xs text-muted-foreground">
                               错因：
                             </span>
                             {wq.mistakeReason ? (
                               <Badge
                                 variant="outline"
                                 className="text-xs border-amber-200 text-amber-700 bg-amber-50"
                               >
                                 {MISTAKE_REASON_LABEL[
                                   wq.mistakeReason as MistakeReason
                                 ] ?? wq.mistakeReason}
                               </Badge>
                             ) : (
                               <span className="text-xs text-muted-foreground">
                                 未标注
                               </span>
                             )}
                           </div>
                           {/* 错因标签 */}
                           <div className="flex items-center gap-1 flex-wrap">
                             <span className="text-xs text-muted-foreground">
                               标签：
                             </span>
                             {wq.errorTags && wq.errorTags.length > 0 ? (
                               wq.errorTags.map((tag) => (
                                 <span
                                   key={tag}
                                   className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full text-white"
                                   style={{ backgroundColor: ERROR_TAG_COLORS[tag] }}
                                 >
                                   {ERROR_TAG_LABEL[tag as ErrorTag]}
                                 </span>
                               ))
                             ) : (
                               <span className="text-xs text-muted-foreground">
                                 未标记
                               </span>
                             )}
                           </div>
                          {/* 底部：错误次数 + 日期 + 操作按钮 */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                错误{' '}
                                <span
                                  className={`font-medium ${
                                    wq.wrongCount >= 3
                                      ? 'text-destructive'
                                      : wq.wrongCount >= 2
                                        ? 'text-amber-600'
                                        : 'text-foreground'
                                  }`}
                                >
                                  {wq.wrongCount}
                                </span>{' '}
                                次
                              </span>
                              <span>{formatDate(wq.lastWrongAt)}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRetry(wq.questionId)}
                                className="h-9 min-h-[36px]"
                              >
                                重做
                              </Button>
                              {!wq.resolved && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkResolved(wq.id)}
                                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-9 min-h-[36px]"
                                >
                                  解决
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmRemove(wq.id)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 min-h-[36px]"
                                aria-label="移除此错题"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 分页 */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <div>
                共 {total} 条，第 {page} / {totalPages} 页
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
         </TabsContent>

         <TabsContent value="weak">
           {/* 薄弱知识点筛选 */}
           <Card className="mb-4">
             <CardContent className="pt-6">
               <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                 <div className="w-full sm:w-36">
                   <Select
                     value={weakSubjectId}
                     onValueChange={(v) => {
                       setWeakSubjectId(v);
                       setWeakPage(1);
                     }}
                     disabled={subjectsLoading}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="选择科目" />
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
                 <div className="relative flex-1 min-w-0 sm:min-w-64 w-full">
                   <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                     placeholder="搜索薄弱知识点..."
                     value={weakKeyword}
                     onChange={(e) => setWeakKeyword(e.target.value)}
                     className="pl-8 w-full"
                   />
                 </div>
               </div>
             </CardContent>
           </Card>

           {/* 薄弱知识点列表 */}
           <Card>
             <CardContent className="p-0">
               {weakLoading ? (
                 <div className="p-4 space-y-2">
                   {[...Array(6)].map((_, i) => (
                     <Skeleton key={i} className="h-16 w-full" />
                   ))}
                 </div>
               ) : weakKps.length === 0 ? (
                 <div className="py-16 text-center">
                   <Flag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                   <div className="text-sm text-muted-foreground mb-1">
                     还没有标记薄弱知识点
                   </div>
                   <div className="text-xs text-muted-foreground">
                     去知识点详情页标记吧
                   </div>
                 </div>
               ) : (
                 <div className="divide-y divide-border">
                   {weakKps.map((kp) => (
                     <div
                       key={kp.id}
                       className="p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors"
                     >
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 flex-wrap mb-1">
                           <span className="font-medium text-sm md:text-base truncate">
                             {kp.title}
                           </span>
                           {kp.weakMarkReason && (
                             <Badge
                               variant="outline"
                               className="text-[10px] border-red-200 text-red-600 bg-red-50 font-medium"
                             >
                               {WEAK_MARK_REASON_LABEL[kp.weakMarkReason]}
                             </Badge>
                           )}
                         </div>
                         <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
                           <span>{kp.subjectName}</span>
                           <span className="text-border">·</span>
                           <span>{kp.chapterName || '—'}</span>
                           {kp.weakMarkedAt && (
                             <>
                               <span className="text-border">·</span>
                               <span>标记于 {formatDate(kp.weakMarkedAt)}</span>
                             </>
                           )}
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs text-muted-foreground w-12 flex-shrink-0">
                             掌握度
                           </span>
                           <div className="w-24 flex-shrink-0">
                             <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                               <div
                                 className={`h-full rounded-full ${
                                   kp.masteryScore >= 85
                                     ? 'bg-emerald-500'
                                     : kp.masteryScore >= 70
                                       ? 'bg-green-500'
                                       : kp.masteryScore >= 40
                                         ? 'bg-amber-500'
                                         : 'bg-red-500'
                                 }`}
                                 style={{ width: `${kp.masteryScore}%` }}
                               />
                             </div>
                           </div>
                           <span className="text-xs font-medium w-8">
                             {kp.masteryScore}%
                           </span>
                         </div>
                       </div>
                       <div className="flex items-center gap-2 sm:justify-end flex-shrink-0">
                         <Button
                           size="sm"
                           variant="default"
                           className="h-8 text-xs"
                           onClick={() =>
                             navigate(`/knowledge-points/${kp.id}`)
                           }
                         >
                           <BookOpenIcon className="h-3 w-3 mr-1" />
                           去复习
                         </Button>
                         <Button
                           size="sm"
                           variant="outline"
                           className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                           onClick={() => handleWeakUnmark(kp.id)}
                           disabled={weakUnmarkingIds.has(kp.id)}
                         >
                           取消标记
                         </Button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </CardContent>
           </Card>

           {/* 薄弱知识点分页 */}
           {weakTotal > 0 && (
             <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
               <div>
                 共 {weakTotal} 条，第 {weakPage} / {weakTotalPages} 页
               </div>
               <div className="flex gap-2">
                 <Button
                   size="sm"
                   variant="outline"
                   disabled={weakPage <= 1 || weakLoading}
                   onClick={() => setWeakPage((p) => p - 1)}
                 >
                   上一页
                 </Button>
                 <Button
                   size="sm"
                   variant="outline"
                   disabled={weakPage >= weakTotalPages || weakLoading}
                   onClick={() => setWeakPage((p) => p + 1)}
                 >
                   下一页
                 </Button>
               </div>
             </div>
           )}
         </TabsContent>
       </Tabs>

      <QuestionAnswerDialog
        questionId={selectedQuestionId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmitted={handleDialogSubmitted}
      />

      {/* 解决二次确认 */}
      <AlertDialog
        open={confirmResolveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmResolveId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认已掌握这道题？</AlertDialogTitle>
            <AlertDialogDescription>
              建议先重做对照答案，确认自己真的掌握了再标记为已解决。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row">
            <AlertDialogCancel
              onClick={handleRetryFromResolveConfirm}
              className="mt-2 sm:mt-0"
            >
              先重做
            </AlertDialogCancel>
            <AlertDialogAction onClick={doMarkResolved}>
              直接标记
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认移除该错题？</AlertDialogTitle>
            <AlertDialogDescription>
              移除后该错题记录将被删除，且无法恢复。相关真题和知识点数据不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量移除确认 */}
      <AlertDialog
        open={batchRemoveDialogOpen}
        onOpenChange={setBatchRemoveDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量移除？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除已选中的 {selectedIds.size} 道错题，删除后无法恢复。相关真题和知识点数据不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 清空全部确认 */}
      <AlertDialog
        open={clearAllDialogOpen}
        onOpenChange={setClearAllDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部错题？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除错题记录，无法恢复。相关真题和知识点数据不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="clear-unresolved"
                checked={clearAllMode === 'unresolved'}
                onCheckedChange={(checked) => {
                  if (checked) setClearAllMode('unresolved');
                }}
              />
              <label
                htmlFor="clear-unresolved"
                className="text-sm cursor-pointer flex-1"
              >
                仅清空未解决错题
              </label>
              <span className="text-sm text-muted-foreground">
                {stats?.overview.unresolvedCount ?? 0} 道
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <Checkbox
                id="clear-all"
                checked={clearAllMode === 'all'}
                onCheckedChange={(checked) => {
                  if (checked) setClearAllMode('all');
                }}
              />
              <label
                htmlFor="clear-all"
                className="text-sm cursor-pointer flex-1"
              >
                清空全部错题（含已解决）
              </label>
              <span className="text-sm text-muted-foreground">
                {stats?.overview.totalCount ?? 0} 道
              </span>
            </div>
            <div className="text-xs text-destructive flex items-center gap-1 pt-1">
              <AlertCircle className="h-3 w-3" />
              将删除 {clearAllCount} 道错题记录
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WrongQuestionsPage;
