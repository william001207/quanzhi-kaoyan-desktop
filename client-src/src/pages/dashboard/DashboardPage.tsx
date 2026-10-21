import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChapterPathBadges from '@/components/ChapterPathBadges';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import { useStatsRefresh } from '@/hooks/use-stats-refresh';
import type {
   StatsOverview,
   MasteryDistribution,
   SubjectStats,
   ReviewLoadDay,
   FreqMasteryPoint,
   HighFreqItem,
   WrongQuestionStats,
 } from '@shared/api.interface';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CheckCircle2,
  Target,
  TrendingUp,
  Trophy,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';

type TimePerspective = 'today' | 'custom' | 'all';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  description?: string;
  loading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  loading,
}) => (
  <Card>
    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
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

const MASTERY_COLORS = ['#94a3b8', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
const MASTERY_LABELS = ['未开始', '薄弱', '巩固中', '熟悉', '掌握'];

const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [masteryDist, setMasteryDist] = useState<MasteryDistribution | null>(
    null,
  );
  const [subjectStats, setSubjectStats] = useState<SubjectStats[]>([]);
  const [reviewLoad, setReviewLoad] = useState<ReviewLoadDay[]>([]);
  const [freqMastery, setFreqMastery] = useState<FreqMasteryPoint[]>([]);
   const [highFreq, setHighFreq] = useState<HighFreqItem[]>([]);
   const [wrongStats, setWrongStats] = useState<WrongQuestionStats | null>(null);

  const statsVersion = useStatsRefresh();

  const [perspective, setPerspective] = useState<TimePerspective>('all');
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);

  const dateRangeParams = useMemo(() => {
    if (perspective === 'all') return { startDate: undefined, endDate: undefined };
    if (perspective === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      return { startDate: todayStr, endDate: todayStr };
    }
    // custom
    if (!customStart || !customEnd) return { startDate: undefined, endDate: undefined };
    const startStr = customStart.toISOString().slice(0, 10);
    const endStr = customEnd.toISOString().slice(0, 10);
    return { startDate: startStr, endDate: endStr };
  }, [perspective, customStart, customEnd]);

  const hasCustomRange = perspective === 'custom' && customStart && customEnd;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled([
        api.stats.getOverview(dateRangeParams),
        api.stats.getMasteryDistribution(dateRangeParams),
        api.stats.getBySubject(dateRangeParams),
        api.stats.getReviewLoad(30),
        api.stats.getFreqMastery(),
        api.stats.getHighFreq(10),
        api.wrongQuestions.getStats(),
      ]);
      const [
        overviewRes,
        masteryRes,
        subjectRes,
        loadRes,
        freqRes,
        highFreqRes,
        wrongStatsRes,
      ] = results;
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (masteryRes.status === 'fulfilled') setMasteryDist(masteryRes.value);
      if (subjectRes.status === 'fulfilled') setSubjectStats(subjectRes.value);
      if (loadRes.status === 'fulfilled') setReviewLoad(loadRes.value);
      if (freqRes.status === 'fulfilled') setFreqMastery(freqRes.value);
      if (highFreqRes.status === 'fulfilled') setHighFreq(highFreqRes.value);
      if (wrongStatsRes.status === 'fulfilled') setWrongStats(wrongStatsRes.value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        const failedNames = ['概览', '掌握度分布', '按科目统计', '复习负荷', '高频掌握', '高频考点', '错题统计']
          .filter((_, i) => results[i].status === 'rejected')
          .join('、');
        logger.error(`加载统计数据部分失败: ${failedNames}`);
        if (failedCount === results.length) {
          setError('加载统计数据失败');
          toast.error('加载统计数据失败');
        } else {
          toast.error(`部分数据加载失败: ${failedNames}`);
        }
      }
      setLoading(false);
    };
    load();
  }, [dateRangeParams, statsVersion]);

  const masteryPieData = useMemo(() => {
    if (!masteryDist) return [];
    return [
      { name: '未开始', value: masteryDist.notStarted },
      { name: '薄弱', value: masteryDist.weak },
      { name: '巩固中', value: masteryDist.medium },
      { name: '熟悉', value: masteryDist.familiar },
      { name: '掌握', value: masteryDist.mastered },
    ];
  }, [masteryDist]);

  const subjectChartData = useMemo(() => {
     return subjectStats.map((s) => ({
       subject: s.subjectName,
       平均掌握度: s.avgMasteryScore,
       真题正确率: s.questionAccuracy,
     }));
   }, [subjectStats]);

  const wrongSubjectData = useMemo(() => {
    if (!wrongStats) return [];
    return wrongStats.bySubject
      .slice(0, 5)
      .map((s) => ({ subject: s.subjectName, 未解决错题: s.unresolvedCount }));
  }, [wrongStats]);

  const wrongMasteryRate = wrongStats?.overview.masteryRate ?? 0;

  const reviewLoadChartData = useMemo(() => {
    return reviewLoad.map((d) => ({
      date: d.date.slice(5),
      复习项: d.count,
      逾期: d.overdue,
    }));
  }, [reviewLoad]);

  const freqMasteryChartData = useMemo(() => {
    return freqMastery.map((p) => ({
      x: p.examFrequency,
      y: p.masteryScore,
      name: p.title,
      subject: p.subjectName,
      z: 1,
    }));
  }, [freqMastery]);

  const maxFreq = useMemo(() => {
    if (freqMastery.length === 0) return 10;
    return Math.max(...freqMastery.map((p) => p.examFrequency), 1);
  }, [freqMastery]);

  const isTodayEmpty =
    perspective === 'today' &&
    !loading &&
    overview &&
    overview.doneQuestions === 0 &&
    overview.startedKnowledgePoints === 0;

  if (error) {
    return (
      <div className="p-3 md:p-6">
        <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">数据看板</h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isTodayEmpty) {
    return (
      <div className="p-3 md:p-6">
        <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">数据看板</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">📚</div>
            <p className="text-base font-medium mb-2">今日还没有学习数据</p>
            <p className="text-sm text-muted-foreground mb-6">
              快去开始今天的学习吧，完成后数据会自动同步到这里
            </p>
            <Button asChild>
              <Link to="/">去今日学习 →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6">
      <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">数据看板</h1>

      {/* 时间视角切换 */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs
          value={perspective}
          onValueChange={(v) => setPerspective(v as TimePerspective)}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="today">当日</TabsTrigger>
            <TabsTrigger value="custom">自定义</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
          </TabsList>
        </Tabs>

        {perspective === 'custom' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'justify-start text-left font-normal w-[140px]',
                    !customStart && 'text-muted-foreground',
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {customStart ? customStart.toISOString().slice(0, 10) : '开始日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customStart}
                  onSelect={(d) => setCustomStart(d ?? undefined)}
                  initialFocus
                  disabled={(d) => (customEnd ? d > customEnd : false)}
                />
              </PopoverContent>
            </Popover>

            <span className="text-muted-foreground text-sm">至</span>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'justify-start text-left font-normal w-[140px]',
                    !customEnd && 'text-muted-foreground',
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {customEnd ? customEnd.toISOString().slice(0, 10) : '结束日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customEnd}
                  onSelect={(d) => setCustomEnd(d ?? undefined)}
                  initialFocus
                  disabled={(d) => (customStart ? d < customStart : false)}
                />
              </PopoverContent>
            </Popover>

            {!hasCustomRange && (
              <span className="text-xs text-muted-foreground">请选择日期范围</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="大纲覆盖率"
          value={overview ? `${(overview.syllabusCoverage * 100).toFixed(1)}%` : '--'}
          icon={Target}
          description={`${overview?.startedKnowledgePoints ?? 0} / ${overview?.totalKnowledgePoints ?? 0} 个知识点`}
          loading={loading}
        />
        <StatCard
          title="知识点掌握率"
          value={overview ? `${(overview.masteryRate * 100).toFixed(1)}%` : '--'}
          icon={TrendingUp}
          description={`${overview?.masteredKnowledgePoints ?? 0} 个已熟练`}
          loading={loading}
        />
        <StatCard
          title="历年真题完成率"
          value={overview ? `${(overview.questionCompletionRate * 100).toFixed(1)}%` : '--'}
          icon={BookOpen}
          description={`${overview?.doneQuestions ?? 0} / ${overview?.totalQuestions ?? 0} 道`}
          loading={loading}
        />
        <StatCard
          title="真题正确率"
          value={overview ? `${(overview.questionAccuracy * 100).toFixed(1)}%` : '--'}
          icon={CheckCircle2}
          description={`${overview?.correctQuestions ?? 0} 道正确`}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* 掌握度分布 - 饼图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">掌握度分布</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-40 w-40 rounded-full" />
              </div>
            ) : masteryPieData.length > 0 &&
              masteryPieData.reduce((a, b) => a + b.value, 0) > 0 ? (
              <ChartContainer
                config={{
                  未开始: { color: MASTERY_COLORS[0] },
                  薄弱: { color: MASTERY_COLORS[1] },
                  巩固中: { color: MASTERY_COLORS[2] },
                  熟悉: { color: MASTERY_COLORS[3] },
                  掌握: { color: MASTERY_COLORS[4] },
                }}
                className="h-full"
              >
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={masteryPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={1}
                  >
                    {masteryPieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={MASTERY_COLORS[index % MASTERY_COLORS.length]}
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

        {/* 按科目统计 - 横向柱状图 */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-medium">按科目统计</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                ))}
              </div>
            ) : subjectChartData.length > 0 ? (
              <ChartContainer
                config={{
                  平均掌握度: { color: '#3b82f6' },
                  真题正确率: { color: '#22c55e' },
                }}
                className="h-full"
              >
                   <BarChart data={subjectChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="subject"
                      tick={{ fontSize: 12 }}
                      width={100}
                      interval={0}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="平均掌握度" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                    <Bar dataKey="真题正确率" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* 真题频率 × 掌握度散点图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              真题频率 × 掌握度
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : freqMasteryChartData.length > 0 ? (
              <ChartContainer
                config={{
                  points: { color: '#6366f1' },
                }}
                className="h-full"
              >
                 <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="真题频率"
                      tick={{ fontSize: 12 }}
                      label={{ value: '真题频率', position: 'insideBottom', offset: -8, fontSize: 12, fill: 'currentColor' }}
                    />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="掌握度"
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                     label={{ value: '掌握度', angle: -90, position: 'insideLeft', offset: 10, fontSize: 12, fill: 'currentColor' }}
                  />
                  <ZAxis type="number" range={[20, 60]} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    cursor={{ strokeDasharray: '3 3' }}
                  />
                  <ReferenceLine
                      y={40}
                      stroke="#ef4444"
                      strokeDasharray="3 3"
                      label={{ value: '薄弱线', position: 'insideRight', fontSize: 11, fill: '#ef4444', angle: 0 }}
                    />
                    <ReferenceLine
                       x={maxFreq * 0.6}
                       stroke="#f59e0b"
                       strokeDasharray="3 3"
                       label={{ value: '高频线', position: 'insideTopLeft', fontSize: 11, fill: '#f59e0b', angle: 0 }}
                     />
                  <Scatter name="知识点" data={freqMasteryChartData} fill="#6366f1">
                    {freqMasteryChartData.map((entry, index) => {
                      const isHighRisk =
                        entry.x >= maxFreq * 0.6 && entry.y < 40;
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isHighRisk ? '#ef4444' : '#6366f1'}
                          fillOpacity={isHighRisk ? 0.9 : 0.6}
                          stroke={isHighRisk ? '#ef4444' : '#6366f1'}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* 未来 30 天复习负荷 */}
         <Card>
           <CardHeader>
             <CardTitle className="text-base font-medium">
               未来 30 天复习负荷
             </CardTitle>
           </CardHeader>
           <CardContent className="h-64">
             {loading ? (
               <div className="flex items-center justify-center h-full">
                 <Skeleton className="h-40 w-full" />
               </div>
             ) : reviewLoadChartData.length > 0 ? (
               <ChartContainer
                 config={{
                   复习项: { color: '#3b82f6' },
                   逾期: { color: '#ef4444' },
                 }}
                 className="h-full"
               >
                  <BarChart data={reviewLoadChartData} margin={{ top: 20 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis
                     dataKey="date"
                     tick={{ fontSize: 10 }}
                     interval={Math.floor(reviewLoadChartData.length / 6)}
                   />
                   <YAxis tick={{ fontSize: 12 }} />
                   <ChartTooltip content={<ChartTooltipContent />} />
                   <Bar dataKey="复习项" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                   <Bar dataKey="逾期" fill="#ef4444" radius={[4, 4, 0, 0]} />
                 </BarChart>
               </ChartContainer>
             ) : (
               <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                 暂无数据
               </div>
             )}
           </CardContent>
         </Card>

        {/* 错题分析 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <CardTitle className="text-base font-medium">
                错题分析
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : wrongSubjectData.length > 0 ? (
              <ChartContainer
                config={{
                  未解决错题: { color: '#ef4444' },
                }}
                className="h-full"
              >
                <BarChart data={wrongSubjectData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
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
                    dataKey="未解决错题"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    barSize={12}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
                暂无错题
                {wrongStats && wrongStats.overview.totalCount > 0 && (
                  <div className="text-xs">
                    已掌握率 {(wrongMasteryRate * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 高频榜 TOP 10 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base font-medium">
              高频考点 TOP 10
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 px-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : highFreq.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              暂无数据
            </div>
           ) : (
             <div className="overflow-x-auto">
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">排名</TableHead>
                  <TableHead>知识点</TableHead>
                  <TableHead className="w-24">出现次数</TableHead>
                  <TableHead className="w-24">最近年份</TableHead>
                  <TableHead className="w-32">科目</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {highFreq.map((item) => (
                  <TableRow key={item.knowledgePointId}>
                    <TableCell>
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
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
                    <TableCell>{item.count}</TableCell>
                    <TableCell>{item.latestYear}</TableCell>
                    <TableCell className="text-muted-foreground">
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
  );
};

export default DashboardPage;
