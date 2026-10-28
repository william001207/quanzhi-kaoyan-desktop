import StudyAnswer from '@/components/knowledge-card/StudyAnswer';
import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Eye, CheckCircle2 } from 'lucide-react';
import * as api from '@/api';
import type { ExamQuestion, DailyPlanItem } from '@shared/api.interface';
import { QUESTION_TYPE_LABEL } from '@shared/api.interface';
import { QuestionDifficultyStars } from '@/components/question-difficulty';

interface QuestionBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DailyPlanItem[];
  subjectName: string;
  onItemCompleted?: (itemId: string) => void;
  onAllCompleted?: () => void;
}

type SelfRatingKey = 'again' | 'partial' | 'basic' | 'perfect';

const SELF_RATING_OPTIONS: Array<{
  key: SelfRatingKey;
  label: string;
  score: number;
  className: string;
}> = [
  {
    key: 'again',
    label: '完全不会',
    score: 0,
    className:
      'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-600 data-[active=true]:bg-red-100 data-[active=true]:border-red-300',
  },
  {
    key: 'partial',
    label: '部分正确',
    score: 40,
    className:
      'border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-600 data-[active=true]:bg-amber-100 data-[active=true]:border-amber-300',
  },
  {
    key: 'basic',
    label: '基本正确',
    score: 70,
    className:
      'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600 data-[active=true]:bg-emerald-100 data-[active=true]:border-emerald-300',
  },
  {
    key: 'perfect',
    label: '完全正确',
    score: 100,
    className:
      'border-green-600 text-green-700 hover:bg-green-50 hover:text-green-700 data-[active=true]:bg-green-600 data-[active=true]:text-white',
  },
];

const QuestionBatchDialog: React.FC<QuestionBatchDialogProps> = ({
  open,
  onOpenChange,
  items,
  subjectName,
  onItemCompleted,
  onAllCompleted,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState<ExamQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedRating, setSelectedRating] = useState<SelfRatingKey | null>(null);
  const [allDone, setAllDone] = useState(false);

  const currentItem = items[currentIndex];
  const total = items.length;

  // 重置状态当打开/题目变化
  useEffect(() => {
    if (!open || items.length === 0) {
      return;
    }
    setCurrentIndex(0);
    setAllDone(false);
  }, [open, items.length]);

  // 加载当前题目
  useEffect(() => {
    if (!open || !currentItem?.questionId) {
      return;
    }
    const load = async () => {
      setLoading(true);
      setQuestion(null);
      setUserAnswer('');
      setShowAnswer(false);
      setSelectedRating(null);
      try {
        const data = await api.examQuestions.getById(currentItem.questionId!);
        setQuestion(data);
      } catch (err) {
        logger.error('加载题目详情失败', err);
        toast.error('加载题目详情失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, currentItem?.questionId]);

  const handleSubmit = useCallback(
    async (rating: SelfRatingKey) => {
      if (!question || !currentItem) return;
      const option = SELF_RATING_OPTIONS.find((o) => o.key === rating);
      if (!option) return;

      setSelectedRating(rating);

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
        // 1. 提交答题结果
        await api.review.submitQuestionResult(question.id, {
          score: option.score,
          selfRating,
          userAnswer: userAnswer || undefined,
          knowledgePointIds: question.knowledgePoints?.map((kp) => kp.id),
        });

        // 2. 标记 daily plan item 为完成
        if (!currentItem.completed) {
          try {
            await api.dailyPlan.updateItem(currentItem.id, { completed: true });
            onItemCompleted?.(currentItem.id);
          } catch (err) {
            logger.error('标记每日计划项失败', err);
          }
        }

        // 3. 进入下一题或完成
        if (currentIndex >= total - 1) {
          setAllDone(true);
          onAllCompleted?.();
          toast.success('本科目真题默写已完成 🎉');
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      } catch (err) {
        logger.error('提交答题结果失败', err);
        toast.error('提交失败，请重试');
      } finally {
        setSubmitting(false);
      }
    },
    [
      question,
      currentItem,
      userAnswer,
      currentIndex,
      total,
      onItemCompleted,
      onAllCompleted,
    ],
  );

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-none sm:max-w-2xl m-0 sm:m-4 h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {allDone ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>完成</span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full gap-4">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge
                    variant="outline"
                    className="text-xs font-normal text-amber-600 border-amber-200 bg-amber-50"
                  >
                    真题
                  </Badge>
                  <span className="text-sm font-normal text-muted-foreground truncate">
                    {subjectName}
                  </span>
                </div>
                <span className="text-sm font-normal text-muted-foreground flex-shrink-0">
                  第 {currentIndex + 1} 题 / 共 {total} 题
                </span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {allDone ? (
          <div className="py-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <div className="text-lg font-medium">本科目真题默写已完成</div>
            <div className="text-sm text-muted-foreground">
              共完成 {total} 道真题，继续加油！
            </div>
            <Button onClick={handleClose} className="mt-4">
              关闭
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : question ? (
          <div className="space-y-5">
            {/* 题干 */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {question.year} 年
                </span>
                <Badge variant="secondary" className="text-xs">
                  {QUESTION_TYPE_LABEL[question.questionType]}
                </Badge>
                <QuestionDifficultyStars
                  difficulty={question.difficulty}
                  size="sm"
                />
                <span className="text-xs text-muted-foreground">
                  {question.answerCount > 0
                    ? `已答${question.answerCount}次`
                    : '未答'}
                </span>
              </div>
              <div className="text-base leading-relaxed whitespace-pre-wrap">
                {question.questionText}
              </div>
            </div>

            {/* 作答区 */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                我的答案
              </h3>
              <Textarea
                placeholder="在这里写下你的答案..."
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                className="min-h-[120px] sm:min-h-28 resize-y"
              />
            </div>

            {/* 显示答案按钮 */}
            {!showAnswer ? (
              <Button
                variant="outline"
                onClick={() => setShowAnswer(true)}
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                显示参考答案
              </Button>
            ) : (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  参考答案
                </h3>
                <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm whitespace-pre-wrap leading-relaxed">
                  <StudyAnswer>{question.answer || '暂无参考答案'}</StudyAnswer>
                </div>
              </div>
            )}

            {/* 自评按钮 */}
            {showAnswer && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  自我评价
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SELF_RATING_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      disabled={submitting}
                      data-active={selectedRating === option.key}
                      onClick={() => handleSubmit(option.key)}
                      className={`px-3 py-3 text-sm rounded-md border transition-colors ${option.className}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default QuestionBatchDialog;
