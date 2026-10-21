import { useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as api from '@/api';
import type { DailyPlanItem } from '@shared/api.interface';
import {
  DAILY_ITEM_TYPE_LABEL,
  REQUIREMENT_LEVEL_LABEL,
  SELF_RATING_LABEL,
} from '@shared/api.interface';
import { requirementBorderClass, masteryTextColor } from '@/utils/mastery';
import { Check, Play } from 'lucide-react';

interface TodayTaskCardProps {
  item: DailyPlanItem;
  onComplete?: (itemId: string) => void;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '从未复习';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '今天已复习';
  if (diffDays === 1) return '昨天复习';
  return `${diffDays} 天前复习`;
}

const TodayTaskCard: React.FC<TodayTaskCardProps> = ({ item, onComplete }) => {
  const navigate = useNavigate();

  const title = useMemo(() => {
    if (item.itemType === 'question_test' || item.itemType === 'wrong_question') {
      const text = item.questionText ?? '';
      return text.length > 50 ? text.slice(0, 50) + '...' : text;
    }
    return item.knowledgePointTitle || '未命名';
  }, [item.itemType, item.questionText, item.knowledgePointTitle]);

  const isHighFreq = (item.examFrequency ?? 0) >= 3;

  const handleClick = useCallback(() => {
    if (item.itemType === 'question_test' && item.questionId) {
      navigate(`/questions?q=${item.questionId}`);
    } else if (item.knowledgePointId) {
      navigate(`/knowledge-points/${item.knowledgePointId}?tab=recall`);
    }
  }, [item.itemType, item.questionId, item.knowledgePointId, navigate]);

  const handleComplete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await api.dailyPlan.updateItem(item.id, { completed: true });
        toast.success('已标记完成');
        onComplete?.(item.id);
      } catch (err) {
        logger.error('标记完成失败', err);
        toast.error('标记失败，请重试');
      }
    },
    [item.id, onComplete],
  );

  const examSyllabusChapter = useMemo(() => {
    if (!item.chapterPaths?.examSyllabus || item.chapterPaths.examSyllabus.length === 0) return '';
    const nodes = item.chapterPaths.examSyllabus;
    return nodes[nodes.length - 1].title;
  }, [item.chapterPaths?.examSyllabus]);

  const textbookChapter = useMemo(() => {
    if (!item.chapterPaths?.textbook || item.chapterPaths.textbook.length === 0) return '';
    const nodes = item.chapterPaths.textbook;
    const skipRoot = nodes.length >= 2 && nodes[0].title === item.subjectName;
    const display = skipRoot ? nodes.slice(1) : nodes;
    return display[display.length - 1]?.title ?? '';
  }, [item.chapterPaths?.textbook, item.subjectName]);

  const examTrace = useMemo(() => {
    if (item.itemType === 'question_test' || item.itemType === 'wrong_question') {
      return item.latestExamYear ? `${item.latestExamYear} 年真题` : '真题';
    }
    const freq = item.examFrequency ?? 0;
    if (freq === 0) return '暂无真题';
    const years = item.examYears ?? [];
    const latest = item.latestExamYear ?? (years.length > 0 ? years[0] : null);
    let text = `历年真题 ${freq} 次`;
    if (latest) text += ` · 最近考查 ${latest}`;
    if (years.length > 0) text += ` · ${years.join(' / ')}`;
    return text;
  }, [item.itemType, item.latestExamYear, item.examFrequency, item.examYears]);

  const reviewLine = useMemo(() => {
    if (item.itemType === 'question_test' || item.itemType === 'wrong_question') {
      return item.reason || '真题练习';
    }
    const rating = item.lastReviewRating
      ? SELF_RATING_LABEL[item.lastReviewRating]
      : null;
    const ago = timeAgo(item.lastReviewedAt);
    if (rating) return `自我评价：${rating} · ${ago}`;
    return ago;
  }, [item.itemType, item.reason, item.lastReviewRating, item.lastReviewedAt]);

  const typeLabel = DAILY_ITEM_TYPE_LABEL[item.itemType];
  const isKnowledgePointTask =
    item.itemType === 'scheduled_review' ||
    item.itemType === 'new_learning' ||
    item.itemType === 'manual';
  const hasChapterBadge = isKnowledgePointTask && (examSyllabusChapter || textbookChapter);

   if (item.completed) {
     return (
       <div
         className="rounded-md border border-border bg-background px-4 py-3"
         onClick={handleClick}
       >
         <div className="flex items-center gap-2 mb-1.5">
           <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
           <span className="text-sm font-medium line-clamp-2 sm:line-clamp-1">
             {title}
           </span>
           <span className="text-[10px] px-1.5 py-px rounded border border-slate-200 text-slate-400 flex-shrink-0">
             {typeLabel}
           </span>
           {isHighFreq && (
              <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                高频
              </span>
            )}
            {isKnowledgePointTask && item.isWeakMarked && (
              <span className="text-[10px] px-1.5 py-px rounded border border-red-300 text-red-600 bg-red-50 flex-shrink-0 font-medium">
                薄弱
              </span>
            )}
          </div>
         {hasChapterBadge && (
           <div className="flex flex-wrap gap-1.5 mb-1">
             {examSyllabusChapter && (
               <span className="text-[10px] px-1.5 py-px rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
                 考纲·{examSyllabusChapter}
               </span>
             )}
             {textbookChapter && (
               <span className="text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium">
                 教材·{textbookChapter}
               </span>
             )}
           </div>
         )}
         <div className="text-[11px] text-muted-foreground truncate mb-1">
           {examTrace}
         </div>
         <div className="text-[11px] text-muted-foreground truncate">
           {item.completedAt &&
             `完成于 ${new Date(item.completedAt).toLocaleTimeString('zh-CN', {
               hour: '2-digit',
               minute: '2-digit',
             })}`}
         </div>
       </div>
     );
   }

  return (
    <div
      className="rounded-md border border-border px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={handleClick}
    >
       <div className="flex items-center gap-2 mb-1.5">
         <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />
          <span className="text-sm font-medium line-clamp-2 sm:line-clamp-1 flex-1 min-w-0">
             {title}
           </span>
         {isHighFreq && (
            <span className="bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0">
              高频
            </span>
          )}
          {isKnowledgePointTask && item.isWeakMarked && (
            <span className="text-[10px] px-1.5 py-px rounded border border-red-300 text-red-600 bg-red-50 flex-shrink-0 font-medium">
              薄弱
            </span>
          )}
          <span className="text-[10px] px-1.5 py-px rounded border border-slate-200 text-slate-500 bg-slate-50 flex-shrink-0">
            今日计划
          </span>
       </div>

      {hasChapterBadge && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {examSyllabusChapter && (
            <span className="text-[10px] px-1.5 py-px rounded border border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0 font-medium">
              考纲·{examSyllabusChapter}
            </span>
          )}
          {textbookChapter && (
            <span className="text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 flex-shrink-0 font-medium">
              教材·{textbookChapter}
            </span>
          )}
        </div>
      )}

      <div className="text-[11px] text-slate-500 truncate mb-1">
        {examTrace}
      </div>

      {isKnowledgePointTask &&
      ((item.examFrequency ?? 0) > 0 || (item.pendingWrongCount ?? 0) > 0) ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2 mb-1">
          {(item.examFrequency ?? 0) > 0 && (
            <span>历年考查 {item.examFrequency} 年</span>
          )}
          {(item.pendingWrongCount ?? 0) > 0 && (
            <span>· {item.pendingWrongCount} 道错题</span>
          )}
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1.5">
        <div className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
          <span>{reviewLine}</span>
          {item.masteryScore !== undefined &&
            item.itemType !== 'question_test' &&
            item.itemType !== 'wrong_question' && (
              <span
                className={`ml-2 font-medium ${masteryTextColor(item.masteryScore)}`}
              >
                掌握度 {item.masteryScore}%
              </span>
            )}
          {item.itemType !== 'question_test' &&
            item.itemType !== 'wrong_question' &&
            item.requirementLevel &&
            item.requirementLevel !== 'unmarked' && (
              <span
                className={`ml-2 text-[10px] px-1 py-px rounded border ${requirementBorderClass(item.requirementLevel)}`}
              >
                {REQUIREMENT_LEVEL_LABEL[item.requirementLevel]}
              </span>
            )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 sm:justify-end">
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs px-3 min-h-[32px]"
            onClick={handleClick}
          >
            <Play className="h-3 w-3 mr-1" />
            {item.itemType === 'question_test' || item.itemType === 'wrong_question'
              ? '开始作答'
              : '开始复习'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs px-3 min-h-[32px]"
            onClick={handleComplete}
          >
            <Check className="h-3 w-3 mr-1" />
            完成
          </Button>
        </div>
      </div>
    </div>
  );
};

export default memo(TodayTaskCard);
