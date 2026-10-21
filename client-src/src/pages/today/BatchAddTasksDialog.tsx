import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import * as api from '@/api';
import type {
  KnowledgePoint,
  ExamQuestionBrief,
  Subject,
  YearQuestionOverview,
} from '@shared/api.interface';
import { QUESTION_TYPE_LABEL } from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { masteryTextColor } from '@/utils/mastery';

interface BatchAddTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

type TabValue = 'knowledge_point' | 'question';

const PAGE_SIZE = 20;

const TabTextIcon: React.FC<{ text: string }> = ({ text }) => (
  <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-primary/10 text-[10px] font-bold text-primary leading-none">
    {text}
  </span>
);

const BatchAddTasksDialog: React.FC<BatchAddTasksDialogProps> = ({
  open,
  onOpenChange,
  onAdded,
}) => {
  const [activeTab, setActiveTab] = useState<TabValue>('knowledge_point');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [yearList, setYearList] = useState<YearQuestionOverview[]>([]);
  const [allSources, setAllSources] = useState<string[]>([]);

  // 知识点tab
  const [kpKeyword, setKpKeyword] = useState('');
  const [kpSubjectId, setKpSubjectId] = useState('');
  const [kpPage, setKpPage] = useState(1);
  const [kpItems, setKpItems] = useState<KnowledgePoint[]>([]);
  const [kpTotal, setKpTotal] = useState(0);
  const [kpLoading, setKpLoading] = useState(false);

  // 真题tab
  const [qKeyword, setQKeyword] = useState('');
  const [qSubjectId, setQSubjectId] = useState('');
  const [qYear, setQYear] = useState('');
  const [qQuestionType, setQQuestionType] = useState('');
  const [qSchool, setQSchool] = useState('');
  const [qPage, setQPage] = useState(1);
  const [qItems, setQItems] = useState<ExamQuestionBrief[]>([]);
  const [qTotal, setQTotal] = useState(0);
  const [qLoading, setQLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [selectedKpIds, setSelectedKpIds] = useState<Set<string>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(
    new Set(),
  );

  const availableYears = useMemo(
    () => yearList.map((y) => y.year).sort((a, b) => b - a),
    [yearList],
  );

  const totalSelected = selectedKpIds.size + selectedQuestionIds.size;

  const loadSubjects = useCallback(async () => {
    try {
      const result = await api.subjects.getAll();
      setSubjects(result);
    } catch (err) {
      logger.error('加载科目失败', err);
    }
  }, []);

  const loadYears = useCallback(async () => {
    try {
      const result = await api.examQuestions.getByYear();
      setYearList(result);
    } catch (err) {
      logger.error('加载年份列表失败', err);
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const result = await api.examQuestions.getAllSources();
      setAllSources(result);
    } catch (err) {
      logger.error('加载院校列表失败', err);
    }
  }, []);

  const loadKpCandidates = useCallback(async () => {
    setKpLoading(true);
    try {
      const result = await api.dailyPlan.getCandidates({
        itemType: 'knowledge_point',
        page: kpPage,
        pageSize: PAGE_SIZE,
        keyword: kpKeyword || undefined,
        subjectId: kpSubjectId || undefined,
      });
      setKpItems(result.items as KnowledgePoint[]);
      setKpTotal(result.total);
    } catch (err) {
      logger.error('加载知识点候选失败', err);
      toast.error('加载失败');
    } finally {
      setKpLoading(false);
    }
  }, [kpPage, kpKeyword, kpSubjectId]);

  const loadQuestionCandidates = useCallback(async () => {
    setQLoading(true);
    try {
      const result = await api.dailyPlan.getCandidates({
        itemType: 'question',
        page: qPage,
        pageSize: PAGE_SIZE,
        keyword: qKeyword || undefined,
        subjectId: qSubjectId || undefined,
        year: qYear ? Number(qYear) : undefined,
        questionType: qQuestionType || undefined,
        school: qSchool || undefined,
      });
      setQItems(result.items as ExamQuestionBrief[]);
      setQTotal(result.total);
    } catch (err) {
      logger.error('加载真题候选失败', err);
      toast.error('加载失败');
    } finally {
      setQLoading(false);
    }
  }, [qPage, qKeyword, qSubjectId, qYear, qQuestionType, qSchool]);

  // 初始加载
  useEffect(() => {
    if (open) {
      loadSubjects();
      loadYears();
      loadSources();
    }
  }, [open, loadSubjects, loadYears, loadSources]);

  // 知识点搜索防抖
  const [debouncedKpKeyword, setDebouncedKpKeyword] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKpKeyword(kpKeyword), 300);
    return () => clearTimeout(t);
  }, [kpKeyword]);

  // 真题搜索防抖
  const [debouncedQKeyword, setDebouncedQKeyword] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQKeyword(qKeyword), 300);
    return () => clearTimeout(t);
  }, [qKeyword]);

  // tab切换或筛选变化时重置页码并加载
  useEffect(() => {
    if (!open) return;
    if (activeTab === 'knowledge_point') {
      setKpPage(1);
    } else {
      setQPage(1);
    }
  }, [
    open,
    activeTab,
    debouncedKpKeyword,
    kpSubjectId,
    debouncedQKeyword,
    qSubjectId,
    qYear,
    qQuestionType,
    qSchool,
  ]);

  useEffect(() => {
    if (!open || activeTab !== 'knowledge_point') return;
    loadKpCandidates();
  }, [open, activeTab, kpPage, debouncedKpKeyword, kpSubjectId, loadKpCandidates]);

  useEffect(() => {
    if (!open || activeTab !== 'question') return;
    loadQuestionCandidates();
  }, [
    open,
    activeTab,
    qPage,
    debouncedQKeyword,
    qSubjectId,
    qYear,
    qQuestionType,
    qSchool,
    loadQuestionCandidates,
  ]);

  // 打开时重置
  useEffect(() => {
    if (!open) {
      setKpKeyword('');
      setKpSubjectId('');
      setKpPage(1);
      setKpItems([]);
      setKpTotal(0);
      setQKeyword('');
      setQSubjectId('');
      setQYear('');
      setQQuestionType('');
      setQSchool('');
      setQPage(1);
      setQItems([]);
      setQTotal(0);
      setSelectedKpIds(new Set());
      setSelectedQuestionIds(new Set());
      setActiveTab('knowledge_point');
    }
  }, [open]);

  const toggleKpSelect = (id: string) => {
    setSelectedKpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQuestionSelect = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allKpVisibleSelected =
    kpItems.length > 0 && kpItems.every((p) => selectedKpIds.has(p.id));
  const allQuestionVisibleSelected =
    qItems.length > 0 && qItems.every((q) => selectedQuestionIds.has(q.id));

  const toggleAllKpVisible = () => {
    setSelectedKpIds((prev) => {
      const next = new Set(prev);
      if (allKpVisibleSelected) {
        kpItems.forEach((p) => next.delete(p.id));
      } else {
        kpItems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const toggleAllQuestionVisible = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (allQuestionVisibleSelected) {
        qItems.forEach((q) => next.delete(q.id));
      } else {
        qItems.forEach((q) => next.add(q.id));
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (totalSelected === 0) {
      toast.warning('请至少选择一项');
      return;
    }
    setSubmitting(true);
    try {
      await api.dailyPlan.addManualItems({
        knowledgePointIds:
          selectedKpIds.size > 0 ? Array.from(selectedKpIds) : undefined,
        questionIds:
          selectedQuestionIds.size > 0
            ? Array.from(selectedQuestionIds)
            : undefined,
      });
      toast.success(`已添加 ${totalSelected} 项到今日计划`);
      onOpenChange(false);
      onAdded();
    } catch (err) {
      logger.error('批量添加失败', err);
      toast.error('添加失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const kpTotalPages = Math.max(1, Math.ceil(kpTotal / PAGE_SIZE));
  const qTotalPages = Math.max(1, Math.ceil(qTotal / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] w-full max-w-full h-dvh sm:h-[88vh] sm:rounded-lg rounded-none border-0 sm:border p-0 flex flex-col gap-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0 shrink-0">
          <DialogTitle className="text-base sm:text-lg">批量添加今日任务</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex-1 flex flex-col min-h-0 relative">
          <div className="px-4 sm:px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-2 h-10 sm:h-9">
            <TabsTrigger value="knowledge_point" className="gap-1.5 h-full text-sm sm:text-sm">
              <TabTextIcon text="知" />
              <span>知识点</span>
            </TabsTrigger>
            <TabsTrigger value="question" className="gap-1.5 h-full text-sm sm:text-sm">
              <TabTextIcon text="真" />
              <span>真题</span>
            </TabsTrigger>
          </TabsList>
          </div>

          {/* 知识点 tab */}
          <TabsContent value="knowledge_point" className="flex-1 flex flex-col mt-2 sm:mt-3 min-h-0 absolute inset-0 top-12 sm:top-11 px-4 sm:px-6 pb-0">
            <div className="flex gap-2 flex-nowrap overflow-x-auto pb-2 -mx-4 sm:-mx-0 px-4 sm:px-0 scrollbar-none shrink-0">
              <div className="relative flex-none w-44 sm:w-auto sm:flex-1 sm:min-w-48">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索知识点..."
                  value={kpKeyword}
                  onChange={(e) => setKpKeyword(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={kpSubjectId} onValueChange={setKpSubjectId}>
                <SelectTrigger className="flex-none w-28 sm:w-40 h-9">
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

            <div className="text-xs text-muted-foreground mb-2 px-1 shrink-0">
              可选 {kpTotal} 个知识点（已排除今日计划内的）
            </div>

            {kpItems.length > 0 && (
              <div className="flex items-center gap-2 px-1 pb-2 border-b shrink-0">
                <Checkbox
                  checked={allKpVisibleSelected}
                  onCheckedChange={toggleAllKpVisible}
                  aria-label="全选当前页知识点"
                />
                <span className="text-xs text-muted-foreground">
                  全选当前页（{kpItems.length} 项）
                </span>
              </div>
            )}

            <ScrollArea className="flex-1 -mx-4 sm:-mx-0 px-4 sm:px-0 min-h-0">
              {kpLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : kpItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无匹配的知识点
                </div>
              ) : (
                <div className="py-1 space-y-0.5 pr-2">
                  {kpItems.map((kp) => (
                    <div
                      key={kp.id}
                      className="flex items-start gap-3 px-2 py-2.5 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={selectedKpIds.has(kp.id)}
                        onCheckedChange={() => toggleKpSelect(kp.id)}
                        className="mt-0.5 shrink-0"
                        aria-label={`选择 ${kp.title}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug line-clamp-2">
                          {kp.title}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                            考频 {kp.examFrequency}
                          </span>
                          <span
                            className={`inline-flex items-center font-medium ${masteryTextColor(
                              kp.masteryScore,
                            )}`}
                          >
                            掌握度 {kp.masteryScore}%
                          </span>
                          <span className="truncate max-w-full sm:max-w-[160px]">
                            {kp.subjectName}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <ChapterPathBadges
                            chapterPaths={kp.chapterPaths}
                            size="xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {kpTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2.5 border-t mt-2 shrink-0">
                <div className="text-xs text-muted-foreground">
                  第 {kpPage} / {kpTotalPages} 页
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={kpPage <= 1}
                    onClick={() => setKpPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">{kpPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={kpPage >= kpTotalPages}
                    onClick={() => setKpPage((p) => Math.min(kpTotalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* 真题 tab */}
          <TabsContent value="question" className="flex-1 flex flex-col mt-2 sm:mt-3 min-h-0 absolute inset-0 top-12 sm:top-11 px-4 sm:px-6 pb-0">
            <div className="flex gap-2 flex-nowrap overflow-x-auto pb-2 -mx-4 sm:-mx-0 px-4 sm:px-0 scrollbar-none">
              <div className="relative flex-none w-44 sm:w-auto sm:flex-1 sm:min-w-40">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索真题..."
                  value={qKeyword}
                  onChange={(e) => setQKeyword(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={qSubjectId} onValueChange={setQSubjectId}>
                <SelectTrigger className="flex-none w-28 h-9">
                  <SelectValue placeholder="科目" />
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
              <Select value={qYear} onValueChange={setQYear}>
                <SelectTrigger className="flex-none w-24 h-9">
                  <SelectValue placeholder="年份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部年份</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y} 年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={qQuestionType} onValueChange={setQQuestionType}>
                <SelectTrigger className="flex-none w-24 h-9">
                  <SelectValue placeholder="题型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部题型</SelectItem>
                  {Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={qSchool} onValueChange={setQSchool}>
                <SelectTrigger className="flex-none w-28 h-9">
                  <SelectValue placeholder="院校" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部院校</SelectItem>
                  {allSources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground mb-2 px-1 shrink-0">
              可选 {qTotal} 道真题（已排除今日计划内的）
            </div>

            {qItems.length > 0 && (
              <div className="flex items-center gap-2 px-1 pb-2 border-b shrink-0">
                <Checkbox
                  checked={allQuestionVisibleSelected}
                  onCheckedChange={toggleAllQuestionVisible}
                  aria-label="全选当前页真题"
                />
                <span className="text-xs text-muted-foreground">
                  全选当前页（{qItems.length} 项）
                </span>
              </div>
            )}

            <ScrollArea className="flex-1 -mx-4 sm:-mx-2 px-4 sm:px-2 min-h-0">
              {qLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : qItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无匹配的真题
                </div>
              ) : (
                <div className="py-1 space-y-0.5 pr-2">
                  {qItems.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 px-2 py-2.5 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={selectedQuestionIds.has(q.id)}
                        onCheckedChange={() => toggleQuestionSelect(q.id)}
                        className="mt-0.5 shrink-0"
                        aria-label={`选择真题 ${q.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm leading-snug line-clamp-3 sm:line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: q.questionText }}
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                            {q.year} 年
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                            {QUESTION_TYPE_LABEL[q.questionType] ??
                              q.questionType}
                          </span>
                          <span className="text-muted-foreground truncate max-w-full sm:max-w-[140px]">
                            {q.subjectName}
                          </span>
                          {q.source && (
                            <span className="text-muted-foreground truncate max-w-full sm:max-w-[140px]">
                              {q.source}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {qTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2.5 border-t mt-2 shrink-0">
                <div className="text-xs text-muted-foreground">
                  第 {qPage} / {qTotalPages} 页
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={qPage <= 1}
                    onClick={() => setQPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">{qPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={qPage >= qTotalPages}
                    onClick={() => setQPage((p) => Math.min(qTotalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 border-t px-4 sm:px-6 py-3 sm:py-4 gap-2 flex-col sm:flex-row sm:items-center m-0 rounded-none">
          <div className="text-xs sm:text-sm text-muted-foreground w-full sm:w-auto sm:mr-auto text-center sm:text-left order-2 sm:order-1">
            已选 <span className="font-medium text-foreground">{totalSelected}</span> 项（知识点 {selectedKpIds.size} / 真题 {selectedQuestionIds.size}）
          </div>
          <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none h-10 sm:h-9">
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || totalSelected === 0}
              className="flex-1 sm:flex-none h-10 sm:h-9"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              添加到今日计划
            </Button>
          </div>
        </DialogFooter>
        <div className="h-[env(safe-area-inset-bottom)] shrink-0 sm:hidden bg-background" />
      </DialogContent>
    </Dialog>
  );
};

export default BatchAddTasksDialog;
