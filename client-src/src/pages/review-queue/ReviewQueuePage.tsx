import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import { onWeakMarkChanged } from '@/utils/weak-mark-bus';
import type { KnowledgePoint, Subject } from '@shared/api.interface';
import { masteryTextColor, formatDate, daysUntil } from '@/utils/mastery';
import {
  Clock,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Play,
  BookOpen,
} from 'lucide-react';

type TabType = 'today' | 'overdue' | 'tomorrow' | 'week7' | 'month30';

const REVIEW_STAGES = ['D0', 'D1', 'D3', 'D7', 'D14', 'D30', 'D60'];

const stageLabel = (stage: number): string => {
  return REVIEW_STAGES[Math.min(stage, REVIEW_STAGES.length - 1)] || 'D0';
};

const ReviewQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgePoint[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('today');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 拉取全部未来复习任务（最多 200 条），前端按时间分组
        const result = await api.review.getQueue({
          type: 'all',
          limit: 200,
        });
        setItems(result.filter((kp) => kp.nextReviewAt !== null));
        // 加载科目用于展示科目名
        try {
          const subjResult = await api.subjects.getAll();
          setSubjects(subjResult);
        } catch {
          // 科目加载失败不影响主数据展示
        }
      } catch (err) {
        logger.error('加载复习队列失败', err);
        setError('加载复习队列失败');
        toast.error('加载复习队列失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    return onWeakMarkChanged(() => {
      api.review
        .getQueue({ type: 'all', limit: 200 })
        .then((result) => {
          setItems(result.filter((kp) => kp.nextReviewAt !== null));
        })
        .catch(() => {});
    });
  }, []);

  const getSubjectName = (subjectId: string): string => {
    return subjects.find((s) => s.id === subjectId)?.name ?? '';
  };

  const filteredItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const week7 = new Date(today);
    week7.setDate(week7.getDate() + 7);
    const month30 = new Date(today);
    month30.setDate(month30.getDate() + 30);

    return items.filter((item) => {
      if (!item.nextReviewAt) return false;
      const dueDate = new Date(item.nextReviewAt);
      dueDate.setHours(0, 0, 0, 0);

      switch (activeTab) {
        case 'today':
          return dueDate.getTime() === today.getTime();
        case 'overdue':
          return dueDate < today;
        case 'tomorrow':
          return dueDate.getTime() === tomorrow.getTime();
        case 'week7':
          return dueDate > today && dueDate <= week7;
        case 'month30':
          return dueDate > today && dueDate <= month30;
        default:
          return true;
      }
    });
  }, [items, activeTab]);

  const tabCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const week7 = new Date(today);
    week7.setDate(week7.getDate() + 7);
    const month30 = new Date(today);
    month30.setDate(month30.getDate() + 30);

    const counts = {
      today: 0,
      overdue: 0,
      tomorrow: 0,
      week7: 0,
      month30: 0,
    };

    for (const item of items) {
      if (!item.nextReviewAt) continue;
      const dueDate = new Date(item.nextReviewAt);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) counts.overdue++;
      else if (dueDate.getTime() === today.getTime()) counts.today++;
      else if (dueDate.getTime() === tomorrow.getTime()) counts.tomorrow++;
      if (dueDate > today && dueDate <= week7) counts.week7++;
      if (dueDate > today && dueDate <= month30) counts.month30++;
    }

    return counts;
  }, [items]);

  const handleStartReview = (id: string) => {
    navigate(`/knowledge-points/${id}`);
  };

  const handleCardClick = (id: string) => {
    navigate(`/knowledge-points/${id}`);
  };

  const renderList = (listItems: KnowledgePoint[]) => (
    <div className="space-y-3">
      {listItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无复习任务
          </CardContent>
        </Card>
      ) : (
        listItems.map((item) => {
          if (!item.nextReviewAt) return null;
          const overdue = new Date(item.nextReviewAt) < new Date();
          const daysLeft = daysUntil(item.nextReviewAt);
          const subjectName = getSubjectName(item.subjectId);
          return (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => handleCardClick(item.id)}
            >
              <CardContent className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="flex-1 min-w-0 w-full">
                   <div className="font-medium truncate flex items-center gap-2">
                     <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                     <span className="truncate">{item.title}</span>
                     {item.isWeakMarked && (
                       <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                         薄弱
                       </Badge>
                     )}
                     {item.examFrequency >= 3 && (
                        <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                          高频
                        </span>
                      )}
                   </div>
                  {item.examSources && item.examSources.length > 0 && (
                    <div
                      className="text-[10px] text-sky-600 mt-0.5 truncate"
                      title={item.examSources.join('、')}
                    >
                      {item.examSources.slice(0, 2).join('、')}
                      {item.examSources.length > 2 &&
                        ` +${item.examSources.length - 2}`}
                    </div>
                  )}
                  {item.chapterPaths && (item.chapterPaths.examSyllabus.length > 0 || item.chapterPaths.textbook.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {item.chapterPaths.examSyllabus.length > 0 && (
                        <span className="text-[10px] px-1.5 py-px rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
                          考纲·{item.chapterPaths.examSyllabus[item.chapterPaths.examSyllabus.length - 1].title}
                        </span>
                      )}
                      {item.chapterPaths.textbook.length > 0 && (
                        <span className="text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium">
                          教材·{item.chapterPaths.textbook[item.chapterPaths.textbook.length - 1].title}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                    {subjectName && (
                      <Badge variant="outline" className="text-xs">
                        {subjectName}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {stageLabel(item.reviewStage)}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12">
                        掌握度
                      </span>
                      <div className="w-24">
                        <Progress
                          value={item.masteryScore}
                          className={`h-1.5 ${
                            item.masteryScore >= 85
                              ? '[&>div]:bg-emerald-500'
                              : item.masteryScore >= 70
                                ? '[&>div]:bg-green-500'
                                : item.masteryScore >= 40
                                  ? '[&>div]:bg-amber-500'
                                  : '[&>div]:bg-red-500'
                          }`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">
                        {item.masteryScore}%
                      </span>
                    </div>
                    <span
                      className={`text-xs flex items-center gap-1 ${
                        overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      {overdue
                        ? `逾期 ${Math.abs(daysLeft ?? 0)} 天`
                        : daysLeft === 0
                          ? '今日到期'
                          : daysLeft === 1
                            ? '明日到期'
                            : `${daysLeft} 天后`}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      下次复习：{formatDate(item.nextReviewAt)}
                    </span>
                  </div>
                </div>
                <div className="w-full flex justify-end md:w-auto">
                  <Button
                    size="sm"
                    className="h-9 min-h-[36px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartReview(item.id);
                    }}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    开始复习
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  if (error) {
    return (
      <div className="p-3 md:p-6">
        <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">复习队列</h1>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6">
      <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">复习队列</h1>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabType)}
      >
        <div className="overflow-x-auto scrollbar-none -mx-3 px-3 md:mx-0 md:px-0">
        <TabsList className="mb-6 w-max md:w-auto">
          <TabsTrigger value="today" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
            <Clock className="h-4 w-4" />
            今日到期
            {!loading && tabCounts.today > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                {tabCounts.today}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
            已逾期
            {!loading && tabCounts.overdue > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                {tabCounts.overdue}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tomorrow" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
            <CalendarClock className="h-4 w-4" />
            明日
          </TabsTrigger>
          <TabsTrigger value="week7" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
            <CalendarDays className="h-4 w-4" />
            未来 7 天
          </TabsTrigger>
          <TabsTrigger value="month30" className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
            <CalendarRange className="h-4 w-4" />
            未来 30 天
          </TabsTrigger>
        </TabsList>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <TabsContent value="today">{renderList(filteredItems)}</TabsContent>
            <TabsContent value="overdue">
              {renderList(filteredItems)}
            </TabsContent>
            <TabsContent value="tomorrow">
              {renderList(filteredItems)}
            </TabsContent>
            <TabsContent value="week7">{renderList(filteredItems)}</TabsContent>
            <TabsContent value="month30">
              {renderList(filteredItems)}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default ReviewQueuePage;
