import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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
import {
  ChevronDown,
  ChevronRight,
  Play,
  Search,
  TrendingUp,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import type {
  ExamQuestion,
  HighFreqQuestion,
  QuestionType,
  Subject,
  YearQuestionOverview,
  SchoolQuestionOverview,
  SubjectQuestionOverview,
  ExamQuestionBrief,
} from '@shared/api.interface';
import { QUESTION_TYPE_LABEL, getQuestionStatus, QUESTION_STATUS_LABEL } from '@shared/api.interface';
import QuestionAnswerDialog from './QuestionAnswerDialog';
import { QuestionTags } from '@/components/question-tags';
import { QuestionDifficultyStars } from '@/components/question-difficulty';
import { statusBadgeClass } from '@/utils/mastery';
import { useNavigate, useSearchParams } from 'react-router-dom';

type TabValue = 'year' | 'subject' | 'school' | 'high-freq' | 'all';

const QuestionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabValue>('high-freq');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  // 全部真题 tab
  const [allQuestions, setAllQuestions] = useState<ExamQuestion[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allLoading, setAllLoading] = useState(false);
  const [allPage, setAllPage] = useState(1);
  const [allPageSize] = useState(20);
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterSchool, setFilterSchool] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  // 按年份 tab
  const [yearGroups, setYearGroups] = useState<YearQuestionOverview[]>([]);
  const [yearLoading, setYearLoading] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [yearQuestions, setYearQuestions] = useState<ExamQuestionBrief[]>([]);
  const [yearQuestionsTotal, setYearQuestionsTotal] = useState(0);
  const [yearQuestionsPage, setYearQuestionsPage] = useState(1);
  const [yearQuestionsLoading, setYearQuestionsLoading] = useState(false);
  const yearQuestionsPageSize = 20;

  // 按科目 tab
  const [subjectGroups, setSubjectGroups] = useState<SubjectQuestionOverview[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  const [subjectQuestions, setSubjectQuestions] = useState<ExamQuestionBrief[]>([]);
  const [subjectQuestionsTotal, setSubjectQuestionsTotal] = useState(0);
  const [subjectQuestionsPage, setSubjectQuestionsPage] = useState(1);
  const [subjectQuestionsLoading, setSubjectQuestionsLoading] = useState(false);
  const subjectQuestionsPageSize = 20;

  // 高频榜
  const [highFreqSource, setHighFreqSource] = useState<string>('all');
  const [highFreqSubjectId, setHighFreqSubjectId] = useState<string>('');
  const [highFreqYear, setHighFreqYear] = useState<string>('');
  const [highFreqType, setHighFreqType] = useState<string>('');
  const [highFreqKeyword, setHighFreqKeyword] = useState('');
  const [debouncedHighFreqKeyword, setDebouncedHighFreqKeyword] = useState('');
  const [highFreqQuestions, setHighFreqQuestions] = useState<HighFreqQuestion[]>([]);
  const [highFreqQuestionsTotal, setHighFreqQuestionsTotal] = useState(0);
  const [highFreqQuestionsPage, setHighFreqQuestionsPage] = useState(1);
  const [highFreqQuestionsLoading, setHighFreqQuestionsLoading] = useState(false);
  const [allSources, setAllSources] = useState<string[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // 按院校 tab
  const [schoolGroups, setSchoolGroups] = useState<SchoolQuestionOverview[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolKeyword, setSchoolKeyword] = useState('');
  const [debouncedSchoolKeyword, setDebouncedSchoolKeyword] = useState('');
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [schoolQuestions, setSchoolQuestions] = useState<ExamQuestionBrief[]>([]);
  const [schoolQuestionsTotal, setSchoolQuestionsTotal] = useState(0);
  const [schoolQuestionsPage, setSchoolQuestionsPage] = useState(1);
  const [schoolQuestionsLoading, setSchoolQuestionsLoading] = useState(false);
  const schoolQuestionsPageSize = 20;

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );

  const [yearOverviewList, setYearOverviewList] = useState<YearQuestionOverview[]>([]);
  const [yearOverviewLoading, setYearOverviewLoading] = useState(true);

  // 所有年份（从年份概览接口 + 全部分页数据派生，供全部 tab 筛选用）
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    allQuestions.forEach((q) => years.add(q.year));
    yearOverviewList.forEach((g) => years.add(g.year));
    yearGroups.forEach((g) => years.add(g.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [allQuestions, yearOverviewList, yearGroups]);

  // 加载科目
  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.subjects.getAll();
        setSubjects(result);
      } catch (err) {
        logger.error('加载科目失败', err);
        toast.error('加载科目失败');
      } finally {
        setSubjectsLoading(false);
      }
    };
    load();
  }, []);

  // 加载年份概览（供全部 tab 的年份筛选下拉使用）
  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.examQuestions.getByYear();
        setYearOverviewList(result);
      } catch (err) {
        logger.error('加载年份概览失败', err);
      } finally {
        setYearOverviewLoading(false);
      }
    };
    load();
  }, []);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 院校搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSchoolKeyword(schoolKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [schoolKeyword]);

  // 高频榜搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHighFreqKeyword(highFreqKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [highFreqKeyword]);

  // 全部真题：筛选条件或关键词变更时回到第1页
  useEffect(() => {
    if (activeTab !== 'all') return;
    setAllPage(1);
  }, [activeTab, filterSubjectId, filterYear, filterType, filterSchool, debouncedKeyword]);

  // 全部真题列表
  useEffect(() => {
    if (activeTab !== 'all') return;
    const load = async () => {
      setAllLoading(true);
      try {
        const result = await api.examQuestions.list({
          page: allPage,
          pageSize: allPageSize,
          subjectId: filterSubjectId || undefined,
          year: filterYear ? Number(filterYear) : undefined,
          questionType: filterType || undefined,
          school: filterSchool || undefined,
          keyword: debouncedKeyword || undefined,
        });
        setAllQuestions(result.items);
        setAllTotal(result.total);
      } catch (err) {
        logger.error('加载真题失败', err);
        toast.error('加载真题失败');
      } finally {
        setAllLoading(false);
      }
    };
    load();
  }, [
    activeTab,
    allPage,
    allPageSize,
    filterSubjectId,
    filterYear,
    filterType,
    filterSchool,
    debouncedKeyword,
  ]);

  // 按年份：加载概览
  useEffect(() => {
    if (activeTab !== 'year') return;
    const load = async () => {
      setYearLoading(true);
      try {
        const result = await api.examQuestions.getByYear();
        setYearGroups(result);
      } catch (err) {
        logger.error('加载年份真题失败', err);
        toast.error('加载年份真题失败');
      } finally {
        setYearLoading(false);
      }
    };
    load();
  }, [activeTab]);

  // 按年份：展开时加载该年题目分页
  useEffect(() => {
    if (expandedYear === null) return;
    const load = async () => {
      setYearQuestionsLoading(true);
      try {
        const result = await api.examQuestions.getYearQuestions(
          expandedYear,
          yearQuestionsPage,
          yearQuestionsPageSize,
        );
        setYearQuestions(result.items);
        setYearQuestionsTotal(result.total);
      } catch (err) {
        logger.error('加载年份题目失败', err);
        toast.error('加载题目失败');
      } finally {
        setYearQuestionsLoading(false);
      }
    };
    load();
  }, [expandedYear, yearQuestionsPage]);

  // 按科目：加载概览
  useEffect(() => {
    if (activeTab !== 'subject') return;
    const load = async () => {
      setSubjectLoading(true);
      try {
        const result = await api.examQuestions.getBySubject();
        setSubjectGroups(result);
      } catch (err) {
        logger.error('加载科目分组失败', err);
        toast.error('加载失败');
      } finally {
        setSubjectLoading(false);
      }
    };
    load();
  }, [activeTab]);

  // 按科目：展开时加载该科目题目分页
  useEffect(() => {
    if (expandedSubjectId === null) return;
    const load = async () => {
      setSubjectQuestionsLoading(true);
      try {
        const result = await api.examQuestions.getSubjectQuestions(
          expandedSubjectId,
          subjectQuestionsPage,
          subjectQuestionsPageSize,
        );
        setSubjectQuestions(result.items);
        setSubjectQuestionsTotal(result.total);
      } catch (err) {
        logger.error('加载科目题目失败', err);
        toast.error('加载失败');
      } finally {
        setSubjectQuestionsLoading(false);
      }
    };
    load();
  }, [expandedSubjectId, subjectQuestionsPage]);

  // 高频榜：真题榜分页
  useEffect(() => {
    if (activeTab !== 'high-freq') return;
    const load = async () => {
      if (!sourcesLoaded) {
        try {
          const srcs = await api.examQuestions.getAllSources();
          setAllSources(srcs);
        } catch (err) {
          logger.error('加载院校列表失败', err);
        } finally {
          setSourcesLoaded(true);
        }
      }
      setHighFreqQuestionsLoading(true);
      try {
        const result = await api.examQuestions.getHighFreqQuestions({
          source: highFreqSource === 'all' ? undefined : highFreqSource,
          subjectId: highFreqSubjectId || undefined,
          year: highFreqYear ? Number(highFreqYear) : undefined,
          questionType: highFreqType || undefined,
          keyword: debouncedHighFreqKeyword || undefined,
          page: highFreqQuestionsPage,
          pageSize: 20,
        });
        setHighFreqQuestions(result.items);
        setHighFreqQuestionsTotal(result.total);
      } catch (err) {
        logger.error('加载高频真题榜失败', err);
        toast.error('加载高频真题榜失败');
      } finally {
        setHighFreqQuestionsLoading(false);
      }
    };
    load();
  }, [
    activeTab,
    highFreqSource,
    highFreqSubjectId,
    highFreqYear,
    highFreqType,
    debouncedHighFreqKeyword,
    highFreqQuestionsPage,
    sourcesLoaded,
  ]);

  // 高频榜筛选变化回到第1页
  useEffect(() => {
    if (activeTab !== 'high-freq') return;
    setHighFreqQuestionsPage(1);
  }, [
    activeTab,
    highFreqSource,
    highFreqSubjectId,
    highFreqYear,
    highFreqType,
    debouncedHighFreqKeyword,
  ]);

  // 按院校：加载概览
  useEffect(() => {
    if (activeTab !== 'school') return;
    const load = async () => {
      setSchoolLoading(true);
      try {
        const result = await api.examQuestions.getBySchool(
          debouncedSchoolKeyword || undefined,
        );
        setSchoolGroups(result);
        setExpandedSchool(null);
        setSchoolQuestions([]);
        setSchoolQuestionsTotal(0);
        setSchoolQuestionsPage(1);
      } catch (err) {
        logger.error('加载院校真题失败', err);
        toast.error('加载院校真题失败');
      } finally {
        setSchoolLoading(false);
      }
    };
    load();
  }, [activeTab, debouncedSchoolKeyword]);

  // 按院校：展开时加载该院校题目分页
  useEffect(() => {
    if (expandedSchool === null) return;
    const load = async () => {
      setSchoolQuestionsLoading(true);
      try {
        const result = await api.examQuestions.getSchoolQuestions(
          expandedSchool,
          schoolQuestionsPage,
          schoolQuestionsPageSize,
        );
        setSchoolQuestions(result.items);
        setSchoolQuestionsTotal(result.total);
      } catch (err) {
        logger.error('加载院校题目失败', err);
        toast.error('加载题目失败');
      } finally {
        setSchoolQuestionsLoading(false);
      }
    };
    load();
  }, [expandedSchool, schoolQuestionsPage]);

  const handleExpandedYear = (year: number) => {
    if (expandedYear === year) {
      setExpandedYear(null);
      setYearQuestions([]);
      setYearQuestionsTotal(0);
      setYearQuestionsPage(1);
    } else {
      setExpandedYear(year);
      setYearQuestionsPage(1);
      setYearQuestions([]);
    }
  };

  const handleExpandedSchool = (school: string) => {
    if (expandedSchool === school) {
      setExpandedSchool(null);
      setSchoolQuestions([]);
      setSchoolQuestionsTotal(0);
      setSchoolQuestionsPage(1);
    } else {
      setExpandedSchool(school);
      setSchoolQuestionsPage(1);
      setSchoolQuestions([]);
    }
  };

  const handleExpandedSubject = (subjectId: string) => {
    if (expandedSubjectId === subjectId) {
      setExpandedSubjectId(null);
      setSubjectQuestions([]);
      setSubjectQuestionsTotal(0);
      setSubjectQuestionsPage(1);
    } else {
      setExpandedSubjectId(subjectId);
      setSubjectQuestionsPage(1);
      setSubjectQuestions([]);
    }
  };

  const [searchParams] = useSearchParams();

  const openAnswerDialog = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setDialogOpen(true);
  };

  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && idFromUrl !== selectedQuestionId) {
      openAnswerDialog(idFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSubmitted = () => {
    // 刷新当前 tab 数据
    if (activeTab === 'all') {
      setAllPage(1);
    }
  };

  const groupByType = (qs: ExamQuestionBrief[]) => {
    const map = new Map<QuestionType, ExamQuestionBrief[]>();
    const order: QuestionType[] = [
      'noun_explanation',
      'short_answer',
      'essay',
      'multiple_choice',
      'fill_blank',
      'other',
    ];
    for (const q of qs) {
      const arr = map.get(q.questionType) ?? [];
      arr.push(q);
      map.set(q.questionType, arr);
    }
    return order
      .filter((t) => map.has(t))
      .map((t) => ({ type: t, questions: map.get(t)! }));
  };

  const getSubjectName = (subjectId: string) =>
    subjects.find((s) => s.id === subjectId)?.name ?? subjectId;

  return (
    <div className="p-3 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">真题中心</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <div className="overflow-x-auto scrollbar-none -mx-3 px-3 md:mx-0 md:px-0">
          <TabsList className="mb-4">
            <TabsTrigger value="high-freq" className="whitespace-nowrap flex-shrink-0">
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              高频榜
            </TabsTrigger>
            <TabsTrigger value="all" className="whitespace-nowrap flex-shrink-0">全部真题</TabsTrigger>
            <TabsTrigger value="year" className="whitespace-nowrap flex-shrink-0">按年份</TabsTrigger>
            <TabsTrigger value="subject" className="whitespace-nowrap flex-shrink-0">按科目</TabsTrigger>
            <TabsTrigger value="school" className="whitespace-nowrap flex-shrink-0">按院校</TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: 按年份 */}
        <TabsContent value="year">
          <Card>
            <CardContent className="p-0">
              {yearLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : yearGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              ) : (
                <div className="divide-y">
                  {yearGroups.map((group) => {
                    const { year, questionCount, subjectCount, typeDistribution } = group;
                    const isExpanded = expandedYear === year;
                    const typeLabels = Object.entries(typeDistribution)
                      .filter(([, v]) => v > 0)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([type, count]) => ({
                        type: type as QuestionType,
                        count,
                      }));
                    return (
                      <div key={year}>
                        <button
                          type="button"
                          onClick={() => handleExpandedYear(year)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="text-base font-medium">
                              {year} 年
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {questionCount} 题
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {subjectCount} 个科目
                            </span>
                            <div className="flex gap-1 flex-wrap">
                              {typeLabels.map(({ type, count }) => (
                                <span
                                  key={type}
                                  className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
                                >
                                  {QUESTION_TYPE_LABEL[type]} {count}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (questionCount > 0) {
                                handleExpandedYear(year);
                              }
                            }}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            展开练习
                          </Button>
                        </button>
                        {isExpanded && (
                          <>
                            {yearQuestionsLoading ? (
                              <div className="border-t bg-muted/20 p-4 space-y-2">
                                {[...Array(5)].map((_, i) => (
                                  <Skeleton key={i} className="h-10 w-full" />
                                ))}
                              </div>
                            ) : yearQuestions.length === 0 ? (
                              <div className="border-t py-10 text-center text-sm text-muted-foreground">
                                暂无题目
                              </div>
                            ) : (
                              <>
                                {/* 桌面端 Table */}
                                <div className="hidden md:block border-t bg-muted/20 overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-28">题型</TableHead>
                                        <TableHead>题目</TableHead>
                                        <TableHead className="w-32">科目</TableHead>
                                        <TableHead className="w-28">难度/作答</TableHead>
                                        <TableHead className="w-24 text-right">
                                          操作
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {yearQuestions.map((q) => (
                                         <TableRow
                                           key={q.id}
                                           className="cursor-pointer hover:bg-muted/40"
                                           onClick={() => openAnswerDialog(q.id)}
                                         >
                                          <TableCell>
                                            <Badge
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {QUESTION_TYPE_LABEL[q.questionType]}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-sm max-w-xl">
                                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                                               <QuestionTags
                                                 year={q.year}
                                                 source={q.source}
                                                 yearVariant="muted"
                                                 sourceVariant="normal"
                                               />
                                               <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                               >
                                                 {
                                                   QUESTION_STATUS_LABEL[
                                                     getQuestionStatus(q.answered, q.masteryScore)
                                                   ]
                                                 }
                                               </Badge>
                                               {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                                 <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                                   高频
                                                 </span>
                                               )}
                                             </div>
                                             <div className="line-clamp-2">
                                               {q.questionText}
                                             </div>
                                           </TableCell>
                                           <TableCell className="text-sm text-muted-foreground">
                                             {q.subjectName}
                                           </TableCell>
                                           <TableCell className="text-sm">
                                              <div className="flex items-center gap-2">
                                                <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                                <span className="text-xs text-muted-foreground">
                                                  {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                                </span>
                                              </div>
                                            </TableCell>
                                          <TableCell className="text-right">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() =>
                                                openAnswerDialog(q.id)
                                              }
                                            >
                                              作答
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                {/* 移动端卡片列表 */}
                                <div className="md:hidden border-t bg-muted/20 p-3 space-y-2">
                                  {yearQuestions.map((q) => (
                                     <div
                                       key={q.id}
                                       className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer"
                                       onClick={() => openAnswerDialog(q.id)}
                                     >
                                       <div className="flex items-center gap-2 mb-2 flex-wrap">
                                         <QuestionTags
                                           year={q.year}
                                           source={q.source}
                                           yearVariant="muted"
                                           sourceVariant="normal"
                                         />
                                         <Badge
                                           variant="secondary"
                                           className="text-xs"
                                         >
                                           {QUESTION_TYPE_LABEL[q.questionType]}
                                         </Badge>
                                         <Badge
                                       variant="outline"
                                       className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                         >
                                           {
                                             QUESTION_STATUS_LABEL[
                                               getQuestionStatus(q.answered, q.masteryScore)
                                             ]
                                           }
                                         </Badge>
                                         {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                           <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                             高频
                                           </span>
                                         )}
                                          <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                       </div>
                                      <div className="text-sm line-clamp-2 mb-2">
                                        {q.questionText}
                                      </div>
                                      <div className="text-xs text-muted-foreground mb-2">
                                        {q.subjectName}
                                      </div>
                                           <span className="text-xs text-muted-foreground">
                                             {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                           </span>
                                      <div className="flex justify-end">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            openAnswerDialog(q.id)
                                          }
                                        >
                                          作答
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {/* 分页 */}
                                <div className="border-t bg-muted/10 px-4 py-3 flex items-center justify-between text-sm text-muted-foreground">
                                  <span>
                                    共 {yearQuestionsTotal} 条，第 {yearQuestionsPage} /{' '}
                                    {Math.max(1, Math.ceil(yearQuestionsTotal / yearQuestionsPageSize))} 页
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={yearQuestionsPage <= 1 || yearQuestionsLoading}
                                      onClick={() => setYearQuestionsPage((p) => p - 1)}
                                    >
                                      上一页
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        yearQuestionsPage >= Math.ceil(yearQuestionsTotal / yearQuestionsPageSize) || yearQuestionsLoading
                                      }
                                      onClick={() => setYearQuestionsPage((p) => p + 1)}
                                    >
                                      下一页
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: 按科目 */}
        <TabsContent value="subject">
          <Card>
            <CardContent className="p-0">
              {subjectLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : subjectGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  暂无数据
                </div>
              ) : (
                <div className="divide-y">
                  {subjectGroups.map(({ subjectId, subjectName, questionCount, yearCount, schoolCount, typeDistribution }) => {
                    const isExpanded = expandedSubjectId === subjectId;
                    const typeLabels = Object.entries(typeDistribution)
                      .filter(([, v]) => v > 0)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([type, count]) => ({
                        type: type as QuestionType,
                        count,
                      }));
                    return (
                      <div key={subjectId}>
                        <button
                          type="button"
                          onClick={() => handleExpandedSubject(subjectId)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="text-base font-medium">
                              {subjectName}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {questionCount} 题
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {yearCount} 个年份 · {schoolCount} 所院校
                            </span>
                            <div className="flex gap-1 flex-wrap">
                              {typeLabels.map(({ type, count }) => (
                                <span
                                  key={type}
                                  className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
                                >
                                  {QUESTION_TYPE_LABEL[type]} {count}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (questionCount > 0) {
                                handleExpandedSubject(subjectId);
                              }
                            }}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            展开练习
                          </Button>
                        </button>
                        {isExpanded && (
                          <>
                            {subjectQuestionsLoading ? (
                              <div className="border-t bg-muted/20 p-4 space-y-2">
                                {[...Array(5)].map((_, i) => (
                                  <Skeleton key={i} className="h-10 w-full" />
                                ))}
                              </div>
                            ) : subjectQuestions.length === 0 ? (
                              <div className="border-t py-10 text-center text-sm text-muted-foreground">
                                暂无题目
                              </div>
                            ) : (
                              <>
                                {/* 桌面端 Table */}
                                <div className="hidden md:block border-t bg-muted/20 overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-28">题型</TableHead>
                                        <TableHead>题目</TableHead>
                                        <TableHead className="w-24">年份</TableHead>
                                        <TableHead className="w-20">难度</TableHead>
                                        <TableHead className="w-24">作答</TableHead>
                                        <TableHead className="w-24 text-right">
                                          操作
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {subjectQuestions.map((q) => (
                                         <TableRow
                                           key={q.id}
                                           className="cursor-pointer hover:bg-muted/40"
                                           onClick={() => openAnswerDialog(q.id)}
                                         >
                                          <TableCell>
                                            <Badge
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {QUESTION_TYPE_LABEL[q.questionType]}
                                            </Badge>
                                          </TableCell>
                                           <TableCell className="text-sm max-w-xl">
                                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                                               <QuestionTags
                                                 year={q.year}
                                                 source={q.source}
                                                 yearVariant="muted"
                                                 sourceVariant="normal"
                                               />
                                               <Badge
                                          variant="outline"
                                          className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                               >
                                                 {
                                                   QUESTION_STATUS_LABEL[
                                                     getQuestionStatus(q.answered, q.masteryScore)
                                                   ]
                                                 }
                                               </Badge>
                                               {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                                 <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                                   高频
                                                 </span>
                                               )}
                                             </div>
                                             <div className="line-clamp-2">
                                               {q.questionText}
                                             </div>
                                           </TableCell>
                                           <TableCell className="text-sm text-muted-foreground">
                                             {q.year}
                                           </TableCell>
                                           <TableCell className="text-sm">
                                             <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                           </TableCell>
                                           <TableCell className="text-sm text-muted-foreground">
                                             {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                           </TableCell>
                                           <TableCell className="text-right">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() =>
                                                openAnswerDialog(q.id)
                                              }
                                            >
                                              作答
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                {/* 移动端卡片列表 */}
                                 <div className="md:hidden border-t bg-muted/20 p-3 space-y-2">
                                   {subjectQuestions.map((q) => (
                                      <div
                                        key={q.id}
                                        className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer"
                                        onClick={() => openAnswerDialog(q.id)}
                                      >
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                          <QuestionTags
                                            year={q.year}
                                            source={q.source}
                                            yearVariant="muted"
                                            sourceVariant="normal"
                                          />
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {QUESTION_TYPE_LABEL[q.questionType]}
                                          </Badge>
                                          <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                          >
                                            {
                                              QUESTION_STATUS_LABEL[
                                                getQuestionStatus(q.answered, q.masteryScore)
                                              ]
                                            }
                                          </Badge>
                                          {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                            <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                              高频
                                            </span>
                                          )}
                                           <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                        </div>
                                      <div className="text-sm line-clamp-2 mb-2">
                                        {q.questionText}
                                      </div>
                                           <span className="text-xs text-muted-foreground">
                                             {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                           </span>
                                       <div className="flex justify-end">
                                         <Button
                                           size="sm"
                                           variant="outline"
                                           onClick={() =>
                                             openAnswerDialog(q.id)
                                           }
                                         >
                                           作答
                                         </Button>
                                       </div>
                                     </div>
                                   ))}
                                </div>
                                {/* 分页 */}
                                <div className="border-t bg-muted/10 px-4 py-3 flex items-center justify-between text-sm text-muted-foreground">
                                  <span>
                                    共 {subjectQuestionsTotal} 条，第 {subjectQuestionsPage} /{' '}
                                    {Math.max(1, Math.ceil(subjectQuestionsTotal / subjectQuestionsPageSize))} 页
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={subjectQuestionsPage <= 1 || subjectQuestionsLoading}
                                      onClick={() => setSubjectQuestionsPage((p) => p - 1)}
                                    >
                                      上一页
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        subjectQuestionsPage >= Math.ceil(subjectQuestionsTotal / subjectQuestionsPageSize) || subjectQuestionsLoading
                                      }
                                      onClick={() => setSubjectQuestionsPage((p) => p + 1)}
                                    >
                                      下一页
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: 按院校 */}
        <TabsContent value="school">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索学校名称..."
                  value={schoolKeyword}
                  onChange={(e) => setSchoolKeyword(e.target.value)}
                  className="pl-8"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {schoolLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : schoolGroups.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {schoolKeyword ? '未找到匹配的学校' : '暂无数据'}
                </div>
              ) : (
                <div className="divide-y">
                  {schoolGroups.map((group) => {
                    const isExpanded = expandedSchool === group.school;
                    return (
                      <div key={group.school}>
                        <button
                          type="button"
                          onClick={() => handleExpandedSchool(group.school)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="text-base font-medium">
                              {group.school}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {group.questionCount} 题
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {group.earliestYear} — {group.latestYear} 年
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {group.subjectCount} 个科目
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (group.questionCount > 0) {
                                handleExpandedSchool(group.school);
                              }
                            }}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            展开练习
                          </Button>
                        </button>
                        {isExpanded && (
                          <>
                            {schoolQuestionsLoading ? (
                              <div className="border-t bg-muted/20 p-4 space-y-2">
                                {[...Array(5)].map((_, i) => (
                                  <Skeleton key={i} className="h-10 w-full" />
                                ))}
                              </div>
                            ) : schoolQuestions.length === 0 ? (
                              <div className="border-t py-10 text-center text-sm text-muted-foreground">
                                暂无题目
                              </div>
                            ) : (
                              <>
                                {/* 桌面端 Table */}
                                <div className="hidden md:block border-t bg-muted/20 overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-20">年份</TableHead>
                                        <TableHead className="w-28">题型</TableHead>
                                        <TableHead>题目</TableHead>
                                         <TableHead className="w-24">科目</TableHead>
                                         <TableHead className="w-32">知识点</TableHead>
                                         <TableHead className="w-32">难度/作答</TableHead>
                                         <TableHead className="w-24 text-right">
                                          操作
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {schoolQuestions.map((q) => (
                                        <TableRow
                                          key={q.id}
                                          className="cursor-pointer hover:bg-muted/40"
                                          onClick={() => openAnswerDialog(q.id)}
                                        >
                                          <TableCell className="text-sm">
                                            <QuestionTags
                                              year={q.year}
                                              source={q.source}
                                              yearVariant="normal"
                                              sourceVariant="muted"
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Badge
                                              variant="secondary"
                                              className="text-xs"
                                            >
                                              {QUESTION_TYPE_LABEL[q.questionType]}
                                            </Badge>
                                          </TableCell>
                                           <TableCell className="text-sm max-w-xl">
                                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                                               <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                               >
                                                 {
                                                   QUESTION_STATUS_LABEL[
                                                     getQuestionStatus(q.answered, q.masteryScore)
                                                   ]
                                                 }
                                               </Badge>
                                               {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                                 <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                                   高频
                                                 </span>
                                               )}
                                             </div>
                                             <div className="line-clamp-2">
                                               {q.questionText}
                                             </div>
                                           </TableCell>
                                           <TableCell className="text-sm text-muted-foreground">
                                             {q.subjectName}
                                           </TableCell>
                                           <TableCell className="text-sm text-muted-foreground">
                                             {q.knowledgePointCount} 个
                                           </TableCell>
                                           <TableCell className="text-sm">
                                             <div className="flex flex-col gap-1">
                                               <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                               <span className="text-xs text-muted-foreground">
                                                 {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                               </span>
                                             </div>
                                           </TableCell>
                                           <TableCell className="text-right">
                                            <Button size="sm" variant="ghost">
                                              作答
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                {/* 移动端卡片列表 */}
                                <div className="md:hidden border-t bg-muted/20 p-3 space-y-2">
                                  {schoolQuestions.map((q) => (
                                    <div
                                      key={q.id}
                                      className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer"
                                      onClick={() => openAnswerDialog(q.id)}
                                    >
                                       <div className="flex items-center gap-2 mb-2 flex-wrap">
                                         <QuestionTags
                                           year={q.year}
                                           source={q.source}
                                           yearVariant="normal"
                                           sourceVariant="muted"
                                         />
                                         <Badge
                                           variant="secondary"
                                           className="text-xs"
                                         >
                                           {QUESTION_TYPE_LABEL[q.questionType]}
                                         </Badge>
                                          <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                          >
                                            {
                                              QUESTION_STATUS_LABEL[
                                                getQuestionStatus(q.answered, q.masteryScore)
                                              ]
                                            }
                                          </Badge>
                                          {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                            <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                              高频
                                            </span>
                                          )}
                                        </div>
                                       <div className="text-sm line-clamp-2 mb-2">
                                          {q.questionText}
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                         <span className="text-xs text-muted-foreground">
                                           {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                         </span>
                                       </div>
                                       <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">
                                          {q.knowledgePointCount} 个知识点
                                        </span>
                                        <Button size="sm" variant="outline">
                                          作答
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {/* 分页 */}
                                <div className="border-t bg-muted/10 px-4 py-3 flex items-center justify-between text-sm text-muted-foreground">
                                  <span>
                                    共 {schoolQuestionsTotal} 条，第 {schoolQuestionsPage} /{' '}
                                    {Math.max(1, Math.ceil(schoolQuestionsTotal / schoolQuestionsPageSize))} 页
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={schoolQuestionsPage <= 1 || schoolQuestionsLoading}
                                      onClick={() => setSchoolQuestionsPage((p) => p - 1)}
                                    >
                                      上一页
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        schoolQuestionsPage >= Math.ceil(schoolQuestionsTotal / schoolQuestionsPageSize) || schoolQuestionsLoading
                                      }
                                      onClick={() => setSchoolQuestionsPage((p) => p + 1)}
                                    >
                                      下一页
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

         {/* Tab 4: 高频榜 */}
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
                   <Select value={highFreqType} onValueChange={setHighFreqType}>
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
                 <div className="w-full sm:w-auto">
                   <Select
                     value={highFreqSource}
                     onValueChange={setHighFreqSource}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="选择院校" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">全部院校</SelectItem>
                       {allSources.map((s) => (
                         <SelectItem key={s} value={s}>
                           {s}
                         </SelectItem>
                       ))}
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
                  共 {highFreqQuestionsTotal} 道高频真题
                </div>
             </CardContent>
           </Card>

             <Card>
               <>
                   <CardContent className="p-0 overflow-x-auto hidden md:block">
                    {highFreqQuestionsLoading ? (
                      <div className="p-4 space-y-2">
                        {[...Array(10)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : highFreqQuestions.length === 0 ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        暂无数据
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">排名</TableHead>
                            <TableHead>题目</TableHead>
                            <TableHead className="w-20 text-center">考频</TableHead>
                             <TableHead className="w-20 text-center">年份</TableHead>
                             <TableHead className="w-28">题型</TableHead>
                             <TableHead className="w-40">院校</TableHead>
                             <TableHead className="w-32">难度/作答</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {highFreqQuestions.map((q) => (
                            <TableRow
                              key={q.id}
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => {
                                setSelectedQuestionId(q.id);
                                setDialogOpen(true);
                              }}
                            >
                              <TableCell>
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-medium ${
                                    q.rank <= 3
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {q.rank}
                                </span>
                              </TableCell>
                               <TableCell className="font-medium">
                                 <div className="max-w-xl">
                                   <div className="flex items-center gap-2 mb-1 flex-wrap">
                                     <div className="line-clamp-1 flex-1 min-w-0">{q.questionText}</div>
                                     {q.frequency >= 3 && (
                                       <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                         高频
                                       </span>
                                     )}
                                   </div>
                                   <div className="mt-1 flex flex-wrap gap-1">
                                     <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                     >
                                      {
                                        QUESTION_STATUS_LABEL[
                                          getQuestionStatus(q.answered, q.masteryScore)
                                        ]
                                      }
                                    </Badge>
                                  </div>
                                  {q.knowledgePoints && q.knowledgePoints.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {q.knowledgePoints.slice(0, 2).map((kp) => (
                                        <span
                                          key={kp.id}
                                          className="text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded"
                                        >
                                          {kp.title}
                                        </span>
                                      ))}
                                      {q.knowledgePoints.length > 2 && (
                                        <span className="text-[10px] text-muted-foreground">
                                          +{q.knowledgePoints.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="text-xs">
                                  {q.frequency} 次
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {q.year}
                              </TableCell>
                              <TableCell className="text-sm">
                                {QUESTION_TYPE_LABEL[q.questionType] || q.questionType}
                              </TableCell>
                               <TableCell className="text-sm text-muted-foreground">
                                 {q.source || '-'}
                               </TableCell>
                               <TableCell>
                                 <div className="flex flex-col gap-1">
                                   <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                   <span className="text-xs text-muted-foreground">
                                     {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                   </span>
                                 </div>
                               </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                  <CardContent className="p-0 md:hidden">
                    {highFreqQuestionsLoading ? (
                      <div className="p-4 space-y-2">
                        {[...Array(10)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : highFreqQuestions.length === 0 ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        暂无数据
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {highFreqQuestions.map((q) => (
                          <div
                            key={q.id}
                            className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer flex gap-3"
                            onClick={() => {
                              setSelectedQuestionId(q.id);
                              setDialogOpen(true);
                            }}
                          >
                            <div className="flex-shrink-0">
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                                  q.rank <= 3
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {q.rank}
                              </span>
                            </div>
                             <div className="flex-1 min-w-0">
                               <div className="font-medium text-sm mb-1 line-clamp-2 flex items-center gap-2">
                                 <span className="flex-1 min-w-0">{q.questionText}</span>
                                 {q.frequency >= 3 && (
                                   <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                     高频
                                   </span>
                                 )}
                               </div>
                               <div className="flex items-center gap-2 mb-1 flex-wrap">
                                 <Badge variant="secondary" className="text-xs">
                                   考频 {q.frequency}
                                 </Badge>
                                <Badge
                                       variant="outline"
                                       className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                                >
                                  {
                                    QUESTION_STATUS_LABEL[
                                      getQuestionStatus(q.answered, q.masteryScore)
                                    ]
                                  }
                                </Badge>
                                 <span className="text-xs text-muted-foreground">
                                   {q.year} · {q.source || '未知院校'}
                                 </span>
                               </div>
                               <div className="flex items-center gap-2">
                                 <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                                 <span className="text-xs text-muted-foreground">
                                   {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                                 </span>
                               </div>
                              {q.knowledgePoints && q.knowledgePoints.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {q.knowledgePoints.slice(0, 2).map((kp) => (
                                    <span
                                      key={kp.id}
                                      className="text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded"
                                    >
                                      {kp.title}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                   {highFreqQuestionsTotal > 0 && (
                     <CardFooter className="flex justify-center py-3 border-t">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={highFreqQuestionsPage <= 1}
                          onClick={() =>
                            setHighFreqQuestionsPage((p) => Math.max(1, p - 1))
                          }
                        >
                          上一页
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          第 {highFreqQuestionsPage} / {Math.ceil(highFreqQuestionsTotal / 20)} 页
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            highFreqQuestionsPage * 20 >= highFreqQuestionsTotal
                          }
                          onClick={() =>
                            setHighFreqQuestionsPage((p) => p + 1)
                          }
                        >
                          下一页
                        </Button>
                      </div>
                    </CardFooter>
                   )}
                 </>
             </Card>
           </TabsContent>

         {/* Tab 5: 全部真题 */}
        <TabsContent value="all">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                <div className="w-full sm:w-auto">
                  <Select
                    value={filterSubjectId}
                    onValueChange={setFilterSubjectId}
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
                  <Select value={filterYear} onValueChange={setFilterYear}>
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
                  <Select value={filterType} onValueChange={setFilterType}>
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
                <div className="w-full sm:w-auto">
                  <Select
                    value={filterSchool}
                    onValueChange={setFilterSchool}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择院校" />
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
                 <div className="flex-1 min-w-0 sm:min-w-64">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索题目关键词..."
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
           </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto hidden md:block">
               {allLoading ? (
                 <div className="p-4 space-y-2">
                   {[...Array(8)].map((_, i) => (
                     <Skeleton key={i} className="h-12 w-full" />
                   ))}
                 </div>
               ) : allQuestions.length === 0 ? (
                 <div className="py-12 text-center text-sm text-muted-foreground">
                   暂无数据
                 </div>
               ) : (
                 <Table>
                   <TableHeader>
                     <TableRow>
                       <TableHead className="w-20">年份</TableHead>
                       <TableHead className="w-28">题型</TableHead>
                       <TableHead>题目</TableHead>
                        <TableHead className="w-40">所属科目</TableHead>
                        <TableHead className="w-32">难度/作答</TableHead>
                        <TableHead className="w-24 text-right">操作</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {allQuestions.map((q) => (
                        <TableRow
                          key={q.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => openAnswerDialog(q.id)}
                        >
                          <TableCell className="text-sm">{q.year}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {QUESTION_TYPE_LABEL[q.questionType]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-xl">
                             <div className="flex items-center gap-2 mb-1 flex-wrap">
                               <QuestionTags
                                 year={null}
                                 source={q.source}
                                 sourceVariant="normal"
                               />
                               <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                               >
                                 {
                                   QUESTION_STATUS_LABEL[
                                     getQuestionStatus(q.answered, q.masteryScore)
                                   ]
                                 }
                               </Badge>
                               {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                                 <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                                   高频
                                 </span>
                               )}
                             </div>
                             <div className="line-clamp-2">{q.questionText}</div>
                           </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {q.knowledgePoints && q.knowledgePoints.length > 0
                              ? q.knowledgePoints
                                  .slice(0, 2)
                                  .map((kp) => kp.title)
                                  .join('、')
                              : getSubjectName(q.subjectId)}
                          </TableCell>
                         <TableCell className="text-sm">
                           <div className="flex flex-col gap-1">
                             <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                             <span className="text-xs text-muted-foreground">
                               {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                             </span>
                           </div>
                         </TableCell>
                         <TableCell className="text-right">
                           <Button size="sm" variant="ghost">
                             作答
                           </Button>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
             </CardContent>
             {/* 移动端卡片列表 */}
             <CardContent className="p-0 md:hidden">
               {allLoading ? (
                 <div className="p-4 space-y-2">
                   {[...Array(8)].map((_, i) => (
                     <Skeleton key={i} className="h-12 w-full" />
                   ))}
                 </div>
               ) : allQuestions.length === 0 ? (
                 <div className="py-12 text-center text-sm text-muted-foreground">
                   暂无数据
                 </div>
               ) : (
                 <div className="p-3 space-y-2">
                   {allQuestions.map((q) => (
                     <div
                       key={q.id}
                       className="border rounded-md p-3 bg-background hover:bg-muted/30 cursor-pointer"
                       onClick={() => openAnswerDialog(q.id)}
                     >
                         <div className="flex items-center gap-2 mb-2 flex-wrap">
                           <span className="text-[11px] px-1.5 py-px rounded font-normal bg-slate-100 text-slate-600">
                             {q.year}
                           </span>
                           <Badge variant="secondary" className="text-xs">
                             {QUESTION_TYPE_LABEL[q.questionType]}
                           </Badge>
                           <Badge
                                        variant="outline"
                                        className={statusBadgeClass(getQuestionStatus(q.answered, q.masteryScore)) + ' text-xs'}
                           >
                             {
                               QUESTION_STATUS_LABEL[
                                 getQuestionStatus(q.answered, q.masteryScore)
                               ]
                             }
                           </Badge>
                           {q.examFrequency !== undefined && q.examFrequency >= 3 && (
                             <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                               高频
                             </span>
                           )}
                         </div>
                        <div className="text-sm line-clamp-2 mb-2">
                         {q.questionText}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <QuestionDifficultyStars difficulty={q.difficulty} size="sm" />
                          <span className="text-xs text-muted-foreground">
                            {q.answerCount > 0 ? `已答${q.answerCount}次` : '未答'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                            {q.knowledgePoints && q.knowledgePoints.length > 0
                              ? q.knowledgePoints
                                  .slice(0, 2)
                                  .map((kp) => kp.title)
                                  .join('、')
                              : getSubjectName(q.subjectId)}
                          </div>
                          <Button size="sm" variant="outline" className="flex-shrink-0">
                            作答
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

           {allTotal > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <div>
                共 {allTotal} 条，第 {allPage} /{' '}
                {Math.max(1, Math.ceil(allTotal / allPageSize))} 页
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={allPage <= 1 || allLoading}
                  onClick={() => setAllPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    allPage >= Math.ceil(allTotal / allPageSize) || allLoading
                  }
                  onClick={() => setAllPage((p) => p + 1)}
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
        onSubmitted={handleSubmitted}
      />
    </div>
  );
};

export default QuestionsPage;
