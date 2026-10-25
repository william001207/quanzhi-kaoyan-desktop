import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as api from '@/api';
import { emitWeakMarkChanged } from '@/utils/weak-mark-bus';
import type {
  KnowledgePoint,
  Subject,
  HighFreqItem,
  YearQuestionOverview,
} from '@shared/api.interface';
import {
  KP_STATUS_LABEL,
  REQUIREMENT_LEVEL_LABEL,
  QUESTION_TYPE_LABEL,
} from '@shared/api.interface';
import { Search, ChevronLeft, ChevronRight, Flag, TrendingUp, Plus } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  masteryColor,
  requirementBorderClass,
  isOverdue,
  formatDate,
  statusBadgeClass,
} from '@/utils/mastery';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import CreateKnowledgePointDialog from './CreateKnowledgePointDialog';


const PAGE_SIZE = 20;

type KpTabValue = 'list' | 'high-freq';

const KnowledgePointsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [kpTab, setKpTab] = useState<KpTabValue>('high-freq');

  // 科目
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // 知识点列表 tab
  const [kps, setKps] = useState<KnowledgePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [subjectId, setSubjectId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [weakMarkedFilter, setWeakMarkedFilter] = useState<string>('');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  // 新增知识点弹窗 / 列表刷新令牌
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 年份概览（供高频榜年份筛选使用）
  const [yearOverviewList, setYearOverviewList] = useState<YearQuestionOverview[]>([]);

  // 所有年份
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    yearOverviewList.forEach((g) => years.add(g.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [yearOverviewList]);

  // 高频榜
  const [highFreqItems, setHighFreqItems] = useState<HighFreqItem[]>([]);
  const [highFreqLoading, setHighFreqLoading] = useState(false);
  const [highFreqSubjectId, setHighFreqSubjectId] = useState<string>('');
  const [highFreqYear, setHighFreqYear] = useState<string>('');
  const [highFreqQuestionType, setHighFreqQuestionType] = useState<string>('');
  const [highFreqKeyword, setHighFreqKeyword] = useState('');
  const [debouncedHighFreqKeyword, setDebouncedHighFreqKeyword] = useState('');

  // 从 URL 读取初始 tab
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl === 'high-freq') {
      setKpTab('high-freq');
    }
  }, [searchParams]);

  // 加载科目
  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const result = await api.subjects.getAll();
        setSubjects(result);
      } catch (err) {
        logger.error('加载科目失败', err);
        toast.error('加载科目失败');
      }
    };
    loadSubjects();
  }, []);

  // 加载年份概览（供高频榜年份筛选下拉使用）
  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.examQuestions.getByYear();
        setYearOverviewList(result);
      } catch (err) {
        logger.error('加载年份概览失败', err);
      }
    };
    load();
  }, []);

  // 知识点列表加载
  const load = useCallback(async () => {
     setLoading(true);
     try {
       const result = await api.knowledgePoints.list({
         subjectId: subjectId || undefined,
         status: status || undefined,
         keyword: keyword || undefined,
         weakMarked: weakMarkedFilter === ''
           ? undefined
           : weakMarkedFilter === 'marked',
         page,
         pageSize: PAGE_SIZE,
       });
       setKps(result.items);
       setTotal(result.total);
     } catch (err) {
       logger.error('加载知识点失败', err);
       toast.error('加载知识点失败');
     } finally {
       setLoading(false);
     }
   }, [subjectId, status, keyword, weakMarkedFilter, page, reloadToken]);

  useEffect(() => {
    if (kpTab !== 'list') return;
    load();
  }, [load, kpTab]);

  const handleSearch = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (val === '') {
      setKeyword('');
      setPage(1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
     if (e.key === 'Enter') {
       handleSearch();
     }
   };

  const toggleWeakMark = async (id: string, isCurrentlyMarked: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      const result = isCurrentlyMarked
        ? await api.knowledgePoints.unmarkWeak(id)
        : await api.knowledgePoints.markWeak(id, 'unfamiliar');
      setKps((prev) =>
        prev.map((kp) => (kp.id === id ? result : kp)),
      );
      emitWeakMarkChanged();
      toast.success(isCurrentlyMarked ? '已取消薄弱标记' : '已标记为薄弱');
      if (weakMarkedFilter !== '') {
        load();
      }
    } catch (err) {
      logger.error('切换薄弱标记失败', err);
      toast.error('操作失败，请重试');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // 高频榜搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHighFreqKeyword(highFreqKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [highFreqKeyword]);

  // 高频榜：知识点榜
  useEffect(() => {
    if (kpTab !== 'high-freq') return;
    const load = async () => {
      setHighFreqLoading(true);
      try {
        const result = await api.examQuestions.getHighFreq({
          subjectId: highFreqSubjectId || undefined,
          year: highFreqYear ? Number(highFreqYear) : undefined,
          questionType: highFreqQuestionType || undefined,
          keyword: debouncedHighFreqKeyword || undefined,
          limit: 30,
        });
        setHighFreqItems(result);
      } catch (err) {
        logger.error('加载高频榜失败', err);
        toast.error('加载高频榜失败');
      } finally {
        setHighFreqLoading(false);
      }
    };
    load();
  }, [
    kpTab,
    highFreqSubjectId,
    highFreqYear,
    highFreqQuestionType,
    debouncedHighFreqKeyword,
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]));

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 md:mb-6 flex-wrap">
        <h1 className="text-xl md:text-2xl font-semibold">知识点中心</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          新增知识点
        </Button>
      </div>

      <Tabs value={kpTab} onValueChange={(v) => setKpTab(v as KpTabValue)}>
        <div className="overflow-x-auto scrollbar-none -mx-3 px-3 md:mx-0 md:px-0">
           <TabsList className="mb-4">
             <TabsTrigger value="high-freq" className="whitespace-nowrap flex-shrink-0">
               <TrendingUp className="h-3.5 w-3.5 mr-1" />
               高频榜
             </TabsTrigger>
             <TabsTrigger value="list" className="whitespace-nowrap flex-shrink-0">知识点列表</TabsTrigger>
           </TabsList>
        </div>

        {/* 知识点列表 tab */}
        <TabsContent value="list">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                 <div className="w-full sm:w-auto sm:w-40">
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      setPage(1);
                    }}
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
                 <div className="w-full sm:w-auto sm:w-36">
                   <Select
                     value={status}
                    onValueChange={(v) => {
                      setStatus(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="掌握状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部状态</SelectItem>
                      {Object.entries(KP_STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                 <div className="w-full sm:w-auto sm:w-36">
                    <Select
                      value={weakMarkedFilter}
                     onValueChange={(v) => {
                       setWeakMarkedFilter(v);
                       setPage(1);
                     }}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="薄弱标记" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="">全部</SelectItem>
                       <SelectItem value="marked">已标记</SelectItem>
                       <SelectItem value="unmarked">未标记</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                  <div className="flex-1 min-w-0 sm:min-w-64 w-full">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索知识点..."
                      value={searchInput}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(PAGE_SIZE)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : kps.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无数据
                </div>
               ) : (
                 <>
                   {/* 桌面端表格 */}
                   <div className="hidden md:block overflow-x-auto">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>知识点</TableHead>
                         <TableHead className="w-28">科目</TableHead>
                         <TableHead className="w-24">大纲</TableHead>
                         <TableHead className="w-20">考频</TableHead>
                         <TableHead className="w-36">掌握度</TableHead>
                         <TableHead className="w-28">下次复习</TableHead>
                          <TableHead className="w-24">状态</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                       {kps.map((kp) => {
                         const overdue = isOverdue(kp.nextReviewAt);
                         return (
                           <TableRow
                             key={kp.id}
                             className="cursor-pointer hover:bg-muted/30"
                             onClick={() => navigate(`/knowledge-points/${kp.id}`)}
                           >
                             <TableCell>
                                 <div className="flex items-center gap-1.5 flex-wrap">
                                   <Link
                                     to={`/knowledge-points/${kp.id}`}
                                     className="font-medium hover:underline"
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     {kp.title}
                                   </Link>
                                   {kp.examFrequency >= 3 && (
                                      <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                        高频
                                      </span>
                                    )}
                                 </div>
                                 {kp.chapterPaths && (kp.chapterPaths.examSyllabus.length > 0 || kp.chapterPaths.textbook.length > 0) && (
                                   <div className="flex flex-wrap gap-1.5 mt-1">
                                     {kp.chapterPaths.examSyllabus.length > 0 && (
                                       <span className="text-[10px] px-1.5 py-px rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
                                         考纲·{kp.chapterPaths.examSyllabus[kp.chapterPaths.examSyllabus.length - 1].title}
                                       </span>
                                     )}
                                     {kp.chapterPaths.textbook.length > 0 && (
                                       <span className="text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium">
                                         教材·{kp.chapterPaths.textbook[kp.chapterPaths.textbook.length - 1].title}
                                       </span>
                                     )}
                                   </div>
                                 )}
                              </TableCell>
                             <TableCell className="text-sm text-muted-foreground">
                               {subjectNameMap.get(kp.subjectId) || '-'}
                             </TableCell>
                             <TableCell>
                               <span
                                 className={`text-[11px] px-1.5 py-0.5 rounded border ${requirementBorderClass(kp.requirementLevel)}`}
                               >
                                 {REQUIREMENT_LEVEL_LABEL[kp.requirementLevel]}
                               </span>
                             </TableCell>
                             <TableCell className="text-sm">{kp.examFrequency}</TableCell>
                             <TableCell>
                               <div className="flex items-center gap-2">
                                 <div className="w-20">
                                   <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                     <div
                                       className={`h-full rounded-full ${masteryColor(kp.masteryScore)}`}
                                       style={{ width: `${kp.masteryScore}%` }}
                                     />
                                   </div>
                                 </div>
                                 <span className="text-xs font-medium w-8">
                                   {kp.masteryScore}%
                                 </span>
                               </div>
                             </TableCell>
                             <TableCell
                               className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
                             >
                               {kp.nextReviewAt
                                 ? formatDate(kp.nextReviewAt) + (overdue ? '（逾期）' : '')
                                 : '未安排'}
                             </TableCell>
                               <TableCell>
                                 <Badge
                                   variant="outline"
                                   className={statusBadgeClass(kp.status) + ' text-xs'}
                                 >
                                   {KP_STATUS_LABEL[kp.status]}
                                 </Badge>
                               </TableCell>
                               <TableCell>
                                 <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleWeakMark(kp.id, kp.isWeakMarked);
                                  }}
                                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                                  aria-label={kp.isWeakMarked ? '取消薄弱标记' : '标记为薄弱'}
                                  disabled={togglingIds.has(kp.id)}
                                >
                                  <Flag
                                    className={`h-4 w-4 transition-colors ${
                                      kp.isWeakMarked
                                        ? 'text-red-500 fill-red-500'
                                        : 'text-muted-foreground hover:text-red-500'
                                    } ${togglingIds.has(kp.id) ? 'opacity-50' : ''}`}
                                  />
                                </button>
                              </TableCell>
                           </TableRow>
                        );
                       })}
                     </TableBody>
                   </Table>
                   </div>

                   {/* 手机端卡片列表 */}
                   <div className="md:hidden space-y-2 p-3">
                     {kps.map((kp) => {
                       const overdue = isOverdue(kp.nextReviewAt);
                       return (
                         <Link
                           key={kp.id}
                           to={`/knowledge-points/${kp.id}`}
                           className="block border rounded-md p-3 hover:bg-muted/30 transition-colors min-h-[44px]"
                         >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className="font-medium text-sm">{kp.title}</span>
                                   {kp.examFrequency >= 3 && (
                                      <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                        高频
                                      </span>
                                    )}
                                  {kp.isWeakMarked && (
                                    <span className="text-[10px] px-1 py-px rounded border border-red-300 text-red-600 bg-red-50 font-medium flex-shrink-0">
                                      薄弱
                                    </span>
                                  )}
                                </div>
                               {kp.chapterPaths && (kp.chapterPaths.examSyllabus.length > 0 || kp.chapterPaths.textbook.length > 0) && (
                                 <div className="flex flex-wrap gap-1 mb-2">
                                   {kp.chapterPaths.examSyllabus.length > 0 && (
                                     <span className="text-[10px] px-1.5 py-px rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
                                       考纲·{kp.chapterPaths.examSyllabus[kp.chapterPaths.examSyllabus.length - 1].title}
                                     </span>
                                   )}
                                   {kp.chapterPaths.textbook.length > 0 && (
                                     <span className="text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium">
                                       教材·{kp.chapterPaths.textbook[kp.chapterPaths.textbook.length - 1].title}
                                     </span>
                                   )}
                                 </div>
                               )}
                               <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-2">
                                 <span
                                   className={`text-[11px] px-1.5 py-0.5 rounded border ${requirementBorderClass(kp.requirementLevel)}`}
                                 >
                                   {REQUIREMENT_LEVEL_LABEL[kp.requirementLevel]}
                                 </span>
                                 <span>考频 {kp.examFrequency}</span>
                               </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${masteryColor(kp.masteryScore)}`}
                                        style={{ width: `${kp.masteryScore}%` }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-xs font-medium w-10 text-right flex-shrink-0">
                                    {kp.masteryScore}%
                                  </span>
                                   <Badge
                                     variant="outline"
                                     className={statusBadgeClass(kp.status) + ' text-[10px]'}
                                   >
                                     {KP_STATUS_LABEL[kp.status]}
                                   </Badge>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleWeakMark(kp.id, kp.isWeakMarked);
                                    }}
                                    className="p-1 rounded hover:bg-muted/50 transition-colors flex-shrink-0"
                                    aria-label={kp.isWeakMarked ? '取消薄弱标记' : '标记为薄弱'}
                                    disabled={togglingIds.has(kp.id)}
                                  >
                                    <Flag
                                      className={`h-4 w-4 ${
                                        kp.isWeakMarked
                                          ? 'text-red-500 fill-red-500'
                                          : 'text-muted-foreground'
                                      } ${togglingIds.has(kp.id) ? 'opacity-50' : ''}`}
                                    />
                                  </button>
                                </div>
                             </div>
                           </div>
                         </Link>
                       );
                     })}
                   </div>
                   {/* 分页 */}
                   {totalPages > 1 && (
                     <div className="flex items-center justify-between px-3 md:px-4 py-3 border-t flex-col sm:flex-row gap-2 sm:gap-0">
                       <div className="text-xs sm:text-sm text-muted-foreground">
                         共 {total} 条，第 {page} / {totalPages} 页
                       </div>
                       <div className="flex items-center gap-1">
                         <Button
                           variant="outline"
                           size="sm"
                           disabled={page <= 1}
                           onClick={() => setPage((p) => Math.max(1, p - 1))}
                           className="h-9 min-h-[36px]"
                         >
                           <ChevronLeft className="h-4 w-4" />
                         </Button>
                         {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (page <= 3) {
                            pageNum = i + 1;
                          } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = page - 2 + i;
                          }
                          return (
                             <Button
                               key={pageNum}
                               variant={pageNum === page ? 'default' : 'outline'}
                               size="sm"
                               onClick={() => setPage(pageNum)}
                               className="h-9 min-h-[36px] w-9"
                             >
                               {pageNum}
                             </Button>
                          );
                        })}
                         <Button
                           variant="outline"
                           size="sm"
                           disabled={page >= totalPages}
                           onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                           className="h-9 min-h-[36px]"
                         >
                           <ChevronRight className="h-4 w-4" />
                         </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 高频榜 tab */}
        <TabsContent value="high-freq">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                <div className="w-full sm:w-auto">
                  <Select
                    value={highFreqSubjectId}
                    onValueChange={setHighFreqSubjectId}
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
                <div className="w-full sm:w-auto">
                  <Select value={highFreqYear} onValueChange={setHighFreqYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择年份" />
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
                </div>
                <div className="w-full sm:w-auto">
                  <Select
                    value={highFreqQuestionType}
                    onValueChange={setHighFreqQuestionType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择题型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部题型</SelectItem>
                      {Object.entries(QUESTION_TYPE_LABEL).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                 <div className="flex-1 min-w-0 sm:min-w-64">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索关键词..."
                      value={highFreqKeyword}
                      onChange={(e) => setHighFreqKeyword(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>
               <div className="text-xs text-muted-foreground mt-4 pt-4 border-t">
                 共 {highFreqItems.length} 个高频知识点
               </div>
            </CardContent>
          </Card>

          <Card>
             <>
                 <CardContent className="p-0 overflow-x-auto hidden md:block">
                  {highFreqLoading ? (
                    <div className="p-4 space-y-2">
                      {[...Array(10)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : highFreqItems.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      暂无数据
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">排名</TableHead>
                          <TableHead>知识点名称</TableHead>
                          <TableHead className="w-24 text-center">考察次数</TableHead>
                          <TableHead className="w-24 text-center">最近年份</TableHead>
                          <TableHead className="w-40">所属科目</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {highFreqItems.map((item) => (
                          <TableRow
                            key={item.knowledgePointId}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() =>
                              navigate(`/knowledge-points/${item.knowledgePointId}`)
                            }
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
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                <div>{item.title}</div>
                                {item.sourceSchools && item.sourceSchools.length > 0 && (
                                  <div className="text-[10px] text-sky-600 mt-0.5">
                                    {item.sourceSchools.slice(0, 2).join('、')}
                                    {item.sourceSchools.length > 2 &&
                                      ` +${item.sourceSchools.length - 2} 所`}
                                  </div>
                                )}
                                <ChapterPathBadges chapterPaths={item.chapterPaths} size="xs" />
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs">
                                {item.count} 次
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {item.latestYear}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.subjectName}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
                <CardContent className="p-0 md:hidden">
                  {highFreqLoading ? (
                    <div className="p-4 space-y-2">
                      {[...Array(10)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : highFreqItems.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      暂无数据
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {highFreqItems.map((item) => (
                        <div
                          key={item.knowledgePointId}
                          className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer flex gap-3"
                          onClick={() =>
                            navigate(`/knowledge-points/${item.knowledgePointId}`)
                          }
                        >
                          <div className="flex-shrink-0">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                                item.rank <= 3
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {item.rank}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">
                              {item.title}
                            </div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <ChapterPathBadges chapterPaths={item.chapterPaths} size="xs" />
                              <Badge variant="secondary" className="text-xs">
                                {item.count} 次
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.subjectName} · 最近 {item.latestYear} 年
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                 </CardContent>
             </>
           </Card>
        </TabsContent>
      </Tabs>

      <CreateKnowledgePointDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultSubjectId={subjectId}
        onCreated={() => {
          setReloadToken((n) => n + 1);
          setPage(1);
        }}
      />
    </div>
  );
};

export default KnowledgePointsPage;
