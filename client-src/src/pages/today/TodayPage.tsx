import { useEffect, useState, useCallback, useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as api from '@/api';
import { onWeakMarkChanged } from '@/utils/weak-mark-bus';
import type { DailyPlanItem, QuestionType } from '@shared/api.interface';
import { QUESTION_TYPE_LABEL } from '@shared/api.interface';
import { RefreshCw, Plus, Play, ChevronLeft, Star } from 'lucide-react';
import TodayTaskCard from './TodayTaskCard';
import BatchAddTasksDialog from './BatchAddTasksDialog';
import QuestionBatchDialog from './QuestionBatchDialog';
import { QuestionReviewDialog } from './QuestionReviewDialog';

type StatusFilter = 'all' | 'pending' | 'completed';
type ViewMode = 'overview' | 'knowledge' | 'questions';

interface SubjectGroup {
  subjectName: string;
  items: DailyPlanItem[];
  totalCount: number;
  completedCount: number;
}

interface SubjectStat {
  name: string;
  total: number;
  completed: number;
}

const TodayPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<api.dailyPlan.TodayPlanResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  const [overallStatusFilter, setOverallStatusFilter] = useState<StatusFilter>('all');
  const [knowledgeSubjectFilter, setKnowledgeSubjectFilter] = useState<string>('all');
  const [questionSubjectFilter, setQuestionSubjectFilter] = useState<string>('all');
  const [knowledgeStatusFilter, setKnowledgeStatusFilter] = useState<StatusFilter>('all');
  const [questionStatusFilter, setQuestionStatusFilter] = useState<StatusFilter>('all');

  const [batchDialogSubject, setBatchDialogSubject] = useState<string | null>(null);
  const [batchDialogItems, setBatchDialogItems] = useState<DailyPlanItem[]>([]);

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewQuestionId, setReviewQuestionId] = useState<string>('');
  const [reviewSubjectName, setReviewSubjectName] = useState('');

  const loadPlan = useCallback(async () => {
    try {
      const result = await api.dailyPlan.getTodayPlan();
      setPlan(result);
      return result;
    } catch (err) {
      logger.error('加载今日计划失败', err);
      toast.error('加载今日计划失败');
      throw err;
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await loadPlan();
      } catch {
        // already toasted
      } finally {
        setLoading(false);
      }
    };
    load();
   }, [loadPlan]);

   useEffect(() => {
     return onWeakMarkChanged(() => {
       loadPlan().catch(() => {});
     });
   }, [loadPlan]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await api.dailyPlan.generateToday();
      setPlan(result);
      toast.success('今日计划已重新生成');
    } catch (err) {
      logger.error('重新生成失败', err);
      toast.error('生成失败，请重试');
    } finally {
      setRegenerating(false);
    }
  };

  const handleItemComplete = useCallback((itemId: string) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const updatedItems = prev.items.map((it) =>
        it.id === itemId
          ? { ...it, completed: true, completedAt: new Date().toISOString() }
          : it,
      );
      const completedItems = updatedItems.filter((it) => it.completed).length;
      const completedMinutes = updatedItems
        .filter((it) => it.completed)
        .reduce((sum, it) => sum + (it.estimatedMinutes ?? 0), 0);
      return {
        ...prev,
        items: updatedItems,
        completedItems,
        completedMinutes,
      };
    });
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Shanghai',
      }),
    [],
  );

  const allItems = plan?.items ?? [];
  const totalItems = allItems.length;
  const completedItems = allItems.filter((it) => it.completed).length;
  const pendingItems = totalItems - completedItems;
  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const questionItems = useMemo(
    () => allItems.filter((it) => it.itemType === 'question_test'),
    [allItems],
  );
  const knowledgeItems = useMemo(
    () =>
      allItems.filter(
        (it) =>
          it.itemType === 'new_learning' ||
          it.itemType === 'scheduled_review' ||
          it.itemType === 'manual',
      ),
    [allItems],
  );

  const questionTotal = questionItems.length;
  const questionCompleted = questionItems.filter((it) => it.completed).length;
  const questionProgress = questionTotal > 0 ? Math.round((questionCompleted / questionTotal) * 100) : 0;

  const knowledgeTotal = knowledgeItems.length;
  const knowledgeCompleted = knowledgeItems.filter((it) => it.completed).length;
  const knowledgeProgress = knowledgeTotal > 0 ? Math.round((knowledgeCompleted / knowledgeTotal) * 100) : 0;

  const knowledgeSubjectStats = useMemo<SubjectStat[]>(() => {
    const map = new Map<string, { total: number; completed: number }>();
    knowledgeItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const cur = map.get(name) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (item.completed) cur.completed += 1;
      map.set(name, cur);
    });
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [knowledgeItems]);

  const questionSubjectStats = useMemo<SubjectStat[]>(() => {
    const map = new Map<string, { total: number; completed: number }>();
    questionItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const cur = map.get(name) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (item.completed) cur.completed += 1;
      map.set(name, cur);
    });
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [questionItems]);

  const filterItemsByStatus = (items: DailyPlanItem[], status: StatusFilter): DailyPlanItem[] => {
    if (status === 'pending') return items.filter((it) => !it.completed);
    if (status === 'completed') return items.filter((it) => it.completed);
    return items;
  };

  const filterItemsBySubject = (items: DailyPlanItem[], subject: string): DailyPlanItem[] => {
    if (subject === 'all') return items;
    return items.filter((it) => (it.subjectName || '未分类') === subject);
  };

  const displayKnowledgeItems = useMemo(() => {
    let items = knowledgeItems;
    if (viewMode === 'overview') {
      items = filterItemsByStatus(items, overallStatusFilter);
    } else {
      items = filterItemsByStatus(items, knowledgeStatusFilter);
    }
    items = filterItemsBySubject(items, knowledgeSubjectFilter);
    return [...items].sort((a, b) => b.priorityScore - a.priorityScore);
  }, [knowledgeItems, viewMode, overallStatusFilter, knowledgeStatusFilter, knowledgeSubjectFilter]);

  const displayQuestionItems = useMemo(() => {
    let items = questionItems;
    if (viewMode === 'overview') {
      items = filterItemsByStatus(items, overallStatusFilter);
    } else {
      items = filterItemsByStatus(items, questionStatusFilter);
    }
    items = filterItemsBySubject(items, questionSubjectFilter);
    return [...items].sort((a, b) => b.priorityScore - a.priorityScore);
  }, [questionItems, viewMode, overallStatusFilter, questionStatusFilter, questionSubjectFilter]);

  const knowledgeGroups = useMemo<SubjectGroup[]>(() => {
    const groupsMap = new Map<string, DailyPlanItem[]>();
    displayKnowledgeItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const arr = groupsMap.get(name) ?? [];
      arr.push(item);
      groupsMap.set(name, arr);
    });
    const totalMap = new Map<string, { total: number; completed: number }>();
    knowledgeItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const cur = totalMap.get(name) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (item.completed) cur.completed += 1;
      totalMap.set(name, cur);
    });
    return Array.from(groupsMap.entries())
      .map(([name, items]) => {
        const stats = totalMap.get(name) ?? { total: 0, completed: 0 };
        return {
          subjectName: name,
          items,
          totalCount: stats.total,
          completedCount: stats.completed,
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [displayKnowledgeItems, knowledgeItems]);

  const questionGroups = useMemo<SubjectGroup[]>(() => {
    const groupsMap = new Map<string, DailyPlanItem[]>();
    displayQuestionItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const arr = groupsMap.get(name) ?? [];
      arr.push(item);
      groupsMap.set(name, arr);
    });
    const totalMap = new Map<string, { total: number; completed: number }>();
    questionItems.forEach((item) => {
      const name = item.subjectName || '未分类';
      const cur = totalMap.get(name) ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (item.completed) cur.completed += 1;
      totalMap.set(name, cur);
    });
    return Array.from(groupsMap.entries())
      .map(([name, items]) => {
        const stats = totalMap.get(name) ?? { total: 0, completed: 0 };
        return {
          subjectName: name,
          items,
          totalCount: stats.total,
          completedCount: stats.completed,
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [displayQuestionItems, questionItems]);

  const handleStartQuestionBatch = useCallback(
    (subjectName: string, items: DailyPlanItem[]) => {
      const pending = items.filter((it) => !it.completed);
      if (pending.length === 0) {
        toast.info('该科目真题已全部完成');
        return;
      }
      const sorted = [...pending].sort((a, b) => b.priorityScore - a.priorityScore);
      setBatchDialogSubject(subjectName);
      setBatchDialogItems(sorted);
    },
    [],
  );

  const handleRetryQuestion = useCallback(() => {
    if (!reviewQuestionId || !plan) return;
    setReviewDialogOpen(false);
    const allQuestionItems = plan.items.filter(
      (it) => it.itemType === 'question_test' && it.questionId === reviewQuestionId,
    );
    if (allQuestionItems.length > 0) {
      const subjectName = allQuestionItems[0].subjectName ?? '真题';
      const sameSubjectItems = plan.items.filter(
        (it) => it.itemType === 'question_test' && it.subjectName === subjectName,
      );
      const pending = sameSubjectItems.filter((it) => !it.completed);
      const itemsToAnswer = pending.length > 0 ? pending : allQuestionItems;
      setBatchDialogSubject(subjectName);
      setBatchDialogItems(itemsToAnswer);
    }
  }, [reviewQuestionId, plan]);

  const handleQuestionClick = useCallback(
    (item: DailyPlanItem, subjectName: string, groupItems: DailyPlanItem[]) => {
      if (item.completed) {
        setReviewQuestionId(item.questionId || item.id);
        setReviewSubjectName(subjectName);
        setReviewDialogOpen(true);
        return;
      }
      const pending = groupItems.filter((it) => !it.completed);
      const startIdx = pending.findIndex((it) => it.id === item.id);
      const itemsToAnswer = startIdx >= 0 ? pending.slice(startIdx) : pending;
      if (itemsToAnswer.length === 0) {
        toast.info('该科目真题已全部完成');
        return;
      }
      const sorted = [...itemsToAnswer].sort((a, b) => b.priorityScore - a.priorityScore);
      setBatchDialogSubject(subjectName);
      setBatchDialogItems(sorted);
    },
    [],
  );

  const overallAllDone =
    viewMode === 'overview' &&
    overallStatusFilter !== 'completed' &&
    pendingItems === 0 &&
    totalItems > 0;

  const knowledgeAllDone =
    viewMode === 'knowledge' &&
    knowledgeStatusFilter !== 'completed' &&
    knowledgeCompleted === knowledgeTotal &&
    knowledgeTotal > 0;

  const questionAllDone =
    viewMode === 'questions' &&
    questionStatusFilter !== 'completed' &&
    questionCompleted === questionTotal &&
    questionTotal > 0;

  const renderSubjectTags = (
    stats: SubjectStat[],
    active: string,
    onChange: (v: string) => void,
    total: number,
    completed: number,
  ) => (
    <div className="flex gap-2 flex-wrap -mx-1 px-1 pb-1">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`text-xs px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap flex-shrink-0 h-8 inline-flex items-center ${
           active === 'all'
             ? 'bg-slate-800 text-white border-slate-800 font-medium'
             : 'bg-white text-muted-foreground border-border hover:bg-muted/50'
         }`}
       >
         全部 {completed}/{total}
       </button>
      {stats.map((s) => (
        <button
          key={s.name}
          type="button"
          onClick={() => onChange(s.name)}
           className={`text-xs px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap h-8 inline-flex items-center ${
             active === s.name
              ? 'bg-slate-800 text-white border-slate-800 font-medium'
              : 'bg-white text-muted-foreground border-border hover:bg-muted/50'
          }`}
        >
          {s.name} {s.completed}/{s.total}
        </button>
      ))}
    </div>
  );

  const renderStatusTabs = (
    value: StatusFilter,
    onChange: (v: StatusFilter) => void,
    total: number,
    completedNum: number,
  ) => (
    <div className="flex gap-4 overflow-x-auto flex-nowrap scrollbar-none">
      {(
        [
          { key: 'all', label: '全部', count: total },
          { key: 'pending', label: '待完成', count: total - completedNum },
          { key: 'completed', label: '已完成', count: completedNum },
        ] as { key: StatusFilter; label: string; count: number }[]
      ).map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`text-sm py-2 border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${
            value === tab.key
              ? 'border-foreground text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );

  const renderKnowledgeColumn = (isFullWidth: boolean) => (
    <Card className={isFullWidth ? '' : 'h-fit'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setViewMode('knowledge')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left"
          >
            <CardTitle className="text-base font-medium">
              今日知识点复习
            </CardTitle>
            <Badge
              variant="outline"
              className="text-xs border-blue-300 text-blue-700 bg-blue-50"
            >
              知识点
            </Badge>
          </button>
          <div className="text-sm text-muted-foreground">
            {knowledgeCompleted} / {knowledgeTotal}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-1.5 w-full rounded-full" />
        ) : (
          <Progress
            value={knowledgeProgress}
            className="h-1.5 [&_[data-slot=progress-indicator]]:bg-blue-500 bg-blue-100"
          />
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3">
          {renderSubjectTags(
            knowledgeSubjectStats,
            knowledgeSubjectFilter,
            setKnowledgeSubjectFilter,
            knowledgeTotal,
            knowledgeCompleted,
          )}
        </div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : knowledgeGroups.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无知识点任务
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
            {knowledgeGroups.map((group) => (
              <div key={group.subjectName}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">{group.subjectName}</div>
                  <div className="text-xs text-muted-foreground">
                    {group.completedCount}/{group.totalCount} 项
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <TodayTaskCard
                      key={item.id}
                      item={item}
                      onComplete={handleItemComplete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderQuestionColumn = (isFullWidth: boolean) => (
    <Card className={isFullWidth ? '' : 'h-fit'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => setViewMode('questions')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity text-left"
          >
            <CardTitle className="text-base font-medium">
              今日真题默写
            </CardTitle>
            <Badge
              variant="outline"
              className="text-xs border-amber-300 text-amber-700 bg-amber-50"
            >
              真题
            </Badge>
          </button>
          <div className="text-sm text-muted-foreground">
            {questionCompleted} / {questionTotal}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-1.5 w-full rounded-full" />
        ) : (
          <Progress
            value={questionProgress}
            className="h-1.5 [&_[data-slot=progress-indicator]]:bg-amber-500 bg-amber-100"
          />
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3">
          {renderSubjectTags(
            questionSubjectStats,
            questionSubjectFilter,
            setQuestionSubjectFilter,
            questionTotal,
            questionCompleted,
          )}
        </div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : questionGroups.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无真题任务
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {questionGroups.map((group) => {
              const pendingInGroup = group.items.filter((it) => !it.completed).length;
              return (
                <div
                  key={group.subjectName}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {group.subjectName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.completedCount}/{group.totalCount}
                      </span>
                    </div>
                    {pendingInGroup > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs px-3 min-h-[32px] bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => handleStartQuestionBatch(group.subjectName, group.items)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        开始默写
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.slice(0, 5).map((item) => (
                      <QuestionMiniCard
                        key={item.id}
                        item={item}
                        onClick={() => handleQuestionClick(item, group.subjectName, group.items)}
                      />
                    ))}
                    {group.items.length > 5 && (
                      <div className="text-xs text-muted-foreground text-center pt-1">
                        还有 {group.items.length - 5} 道
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 md:p-5">
      {/* 页面头部 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {viewMode !== 'overview' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('overview')}
              className="h-8 w-8 p-0 -ml-2"
              aria-label="返回总览"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-semibold leading-tight">
              {viewMode === 'overview' && '今日学习'}
              {viewMode === 'knowledge' && '今日知识点复习'}
              {viewMode === 'questions' && '今日真题默写'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{today}</p>
          </div>
        </div>
        {viewMode === 'overview' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="h-9"
            >
              <RefreshCw
                className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline ml-1">重新生成</span>
            </Button>
            <Button size="sm" onClick={() => setBatchDialogOpen(true)} className="h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">批量添加今日任务</span>
              <span className="sm:hidden">添加</span>
            </Button>
          </div>
        )}
      </div>

      {/* 总进度条 + 状态筛选（双列总览视角） */}
      {viewMode === 'overview' && (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm text-muted-foreground">
                今日待完成 {pendingItems} 项
              </div>
              <div className="text-sm font-medium">{overallProgress}%</div>
            </div>
            {loading ? (
              <Skeleton className="h-2 w-full rounded-full" />
            ) : (
              <Progress
                value={overallProgress}
                className="h-2 [&_[data-slot=progress-indicator]]:bg-emerald-500 bg-emerald-100"
              />
            )}
          </div>

          <div className="flex items-center justify-between border-b mb-4">
            {renderStatusTabs(overallStatusFilter, setOverallStatusFilter, totalItems, completedItems)}
            <div className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap flex-shrink-0 ml-2">按优先级排序</div>
          </div>

          {overallAllDone && (
            <div className="text-sm text-emerald-600 font-medium mb-4">
              今日任务已全部完成 🎉
            </div>
          )}
        </>
      )}

      {/* 单独视角：进度条 + 状态筛选 */}
      {viewMode === 'knowledge' && (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm text-muted-foreground">
                待复习 {knowledgeTotal - knowledgeCompleted} 项
              </div>
              <div className="text-sm font-medium">{knowledgeProgress}%</div>
            </div>
            {loading ? (
              <Skeleton className="h-2 w-full rounded-full" />
            ) : (
              <Progress
                value={knowledgeProgress}
                className="h-2 [&_[data-slot=progress-indicator]]:bg-blue-500 bg-blue-100"
              />
            )}
          </div>
          <div className="flex items-center justify-between border-b mb-4">
            {renderStatusTabs(knowledgeStatusFilter, setKnowledgeStatusFilter, knowledgeTotal, knowledgeCompleted)}
          </div>
          {knowledgeAllDone && (
            <div className="text-sm text-emerald-600 font-medium mb-4">
              知识点复习已全部完成 🎉
            </div>
          )}
        </>
      )}

      {viewMode === 'questions' && (
        <>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm text-muted-foreground">
                待默写 {questionTotal - questionCompleted} 道
              </div>
              <div className="text-sm font-medium">{questionProgress}%</div>
            </div>
            {loading ? (
              <Skeleton className="h-2 w-full rounded-full" />
            ) : (
              <Progress
                value={questionProgress}
                className="h-2 [&_[data-slot=progress-indicator]]:bg-amber-500 bg-amber-100"
              />
            )}
          </div>
          <div className="flex items-center justify-between border-b mb-4">
            {renderStatusTabs(questionStatusFilter, setQuestionStatusFilter, questionTotal, questionCompleted)}
          </div>
          {questionAllDone && (
            <div className="text-sm text-emerald-600 font-medium mb-4">
              真题默写已全部完成 🎉
            </div>
          )}
        </>
      )}

      {/* 双列布局（总览） */}
      {viewMode === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderKnowledgeColumn(false)}
          {renderQuestionColumn(false)}
        </div>
      )}

      {/* 单独视角 */}
      {viewMode === 'knowledge' && renderKnowledgeColumn(true)}
      {viewMode === 'questions' && renderQuestionColumn(true)}

      <BatchAddTasksDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        onAdded={loadPlan}
      />

      <QuestionBatchDialog
        open={batchDialogSubject !== null}
        onOpenChange={(open) => {
          if (!open) setBatchDialogSubject(null);
        }}
        items={batchDialogItems}
        subjectName={batchDialogSubject ?? ''}
        onItemCompleted={handleItemComplete}
      />

      <QuestionReviewDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        questionId={reviewQuestionId}
        subjectName={reviewSubjectName}
        onRetry={handleRetryQuestion}
      />
    </div>
  );
};

interface QuestionMiniCardProps {
  item: DailyPlanItem;
  onClick?: () => void;
}

const getDifficultyStars = (difficulty?: number): string => {
  const d = difficulty ?? 2;
  const clamped = Math.max(1, Math.min(5, d));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
};

const getMasteryStatusLabel = (score?: number): { label: string; className: string } => {
  const s = score ?? 0;
  if (s === 0) return { label: '未开始', className: 'border-slate-200 text-slate-500 bg-slate-50' };
  if (s < 40) return { label: '薄弱', className: 'border-red-200 text-red-600 bg-red-50' };
  if (s < 70) return { label: '巩固中', className: 'border-amber-200 text-amber-600 bg-amber-50' };
  if (s < 85) return { label: '熟悉', className: 'border-emerald-200 text-emerald-600 bg-emerald-50' };
  return { label: '掌握', className: 'border-green-200 text-green-700 bg-green-50' };
};

const QuestionMiniCard: React.FC<QuestionMiniCardProps> = ({ item, onClick }) => {
  const questionText = item.questionText ?? '';

  const typeLabel = item.questionType
    ? QUESTION_TYPE_LABEL[item.questionType as QuestionType]
    : '真题';

  const mastery = getMasteryStatusLabel(item.masteryScore);

  if (item.completed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-emerald-50/50 transition-colors text-left"
      >
        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex-shrink-0 mt-0.5 flex items-center justify-center">
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
         <div className="flex-1 min-w-0">
           <div className="text-sm line-clamp-2 sm:line-clamp-1">{questionText}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              {item.latestExamYear ? `${item.latestExamYear} 年` : ''}
            </span>
            {item.questionSource && (
              <span className="text-[10px] text-muted-foreground">
                {item.questionSource}
              </span>
            )}
             <span className="text-[10px] text-amber-600">
               <Star className="inline h-2.5 w-2.5 -mt-0.5" />
               {getDifficultyStars(item.questionDifficulty)}
             </span>
             <span className="text-[10px] text-muted-foreground">
               {item.questionAnswerCount && item.questionAnswerCount > 0
                 ? `已答${item.questionAnswerCount}次`
                 : '未答'}
             </span>
           </div>
         </div>
       </button>
     );
   }

   return (
     <button
       type="button"
       onClick={onClick}
       className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-amber-50/50 transition-colors text-left"
     >
       <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0 mt-0.5" />
         <div className="flex-1 min-w-0">
           <div className="text-sm line-clamp-2 sm:line-clamp-1">{questionText}</div>
         <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
           <span className="text-[10px] text-muted-foreground">
             {item.latestExamYear ? `${item.latestExamYear} 年` : ''}
           </span>
           {item.questionSource && (
             <span className="text-[10px] text-muted-foreground">
               {item.questionSource}
             </span>
           )}
           <span className={`text-[10px] px-1 py-px rounded border ${mastery.className}`}>
             {mastery.label}
           </span>
           <span className="text-[10px] text-amber-600">
             {getDifficultyStars(item.questionDifficulty)}
           </span>
           <span className="text-[10px] text-muted-foreground">
             {item.questionAnswerCount && item.questionAnswerCount > 0
               ? `已答${item.questionAnswerCount}次`
               : '未答'}
           </span>
           <span className="text-[10px] text-slate-400">
            {typeLabel}
          </span>
        </div>
      </div>
    </button>
  );
};

export default TodayPage;
