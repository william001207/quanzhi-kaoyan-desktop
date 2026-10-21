import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { Eye, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';
import * as api from '@/api';
import type { QuestionReviewDetail } from '@shared/api.interface';
import { QUESTION_TYPE_LABEL } from '@shared/api.interface';
import { QuestionDifficultyStars } from '@/components/question-difficulty';

interface QuestionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string;
  questionTitle?: string;
  subjectName?: string;
  onRetry?: () => void;
}

const SELF_RATING_LABEL: Record<string, { label: string; className: string }> = {
  again: { label: '完全不会', className: 'text-red-600 bg-red-50 border-red-200' },
  hard: { label: '部分正确', className: 'text-amber-600 bg-amber-50 border-amber-200' },
  good: { label: '基本正确', className: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  easy: { label: '完全正确', className: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
};

export const QuestionReviewDialog: React.FC<QuestionReviewDialogProps> = ({
  open,
  onOpenChange,
  questionId,
  questionTitle,
  subjectName,
  onRetry,
}) => {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<QuestionReviewDetail | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    if (!open || !questionId) return;
    setLoading(true);
    setDetail(null);
    setShowAnswer(false);
    api.examQuestions
      .getReviewDetail(questionId)
      .then((res) => {
        setDetail(res);
      })
      .catch((err) => {
        logger.error('加载题目作答详情失败', err);
        toast.error('加载失败，请重试');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, questionId]);

  const q = detail?.question;
  const ratingInfo = detail?.latestReview
    ? SELF_RATING_LABEL[detail.latestReview.selfRating] ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-none sm:max-w-2xl m-0 sm:m-4 h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold pr-8">
            <div className="flex items-center justify-between w-full gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <Badge
                  variant="outline"
                  className="text-xs font-normal text-emerald-600 border-emerald-200 bg-emerald-50"
                >
                  已完成
                </Badge>
                <span className="text-sm font-normal text-muted-foreground truncate">
                  {subjectName ?? '真题'}
                </span>
              </div>
              {detail?.latestReview?.questionScore !== null &&
                detail?.latestReview?.questionScore !== undefined && (
                  <span className="text-sm font-medium text-emerald-600 flex-shrink-0">
                    得分 {detail.latestReview.questionScore}
                  </span>
                )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : q ? (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-normal">
                  {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
                </Badge>
                {q.year && (
                  <span className="text-xs text-muted-foreground">{q.year} 年</span>
                )}
                {q.source && (
                  <span className="text-xs text-muted-foreground">{q.source}</span>
                )}
                <QuestionDifficultyStars
                  difficulty={q.difficulty}
                  size="sm"
                />
                <span className="text-xs text-muted-foreground">
                  {q.answerCount > 0
                    ? `已答${q.answerCount}次`
                    : '未答'}
                </span>
                {ratingInfo && (
                  <Badge
                    variant="outline"
                    className={`text-xs font-normal ${ratingInfo.className}`}
                  >
                    {ratingInfo.label}
                  </Badge>
                )}
                {detail?.wrongQuestion && (
                  <Badge
                    variant="outline"
                    className="text-xs font-normal text-red-600 bg-red-50 border-red-200"
                  >
                    错题 · 错 {detail.wrongQuestion.wrongCount} 次
                  </Badge>
                )}
              </div>
              <div className="text-base leading-relaxed whitespace-pre-wrap">
                {q.questionText}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                我这次的作答
              </div>
              <div className="rounded-md border bg-slate-50 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {detail.latestReview?.userAnswer
                  ? detail.latestReview.userAnswer
                  : '（未保存作答内容）'}
              </div>
            </div>

            {detail.wrongQuestion?.mistakeReason && (
              <div className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  错因分析
                </div>
                <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-sm text-red-700 whitespace-pre-wrap leading-relaxed">
                  {detail.wrongQuestion.mistakeReason}
                </div>
              </div>
            )}

            {showAnswer ? (
              <>
                <div className="space-y-2">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    参考答案
                  </div>
                  <div className="rounded-md border bg-blue-50/40 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                    {q.answer ?? '（暂无参考答案）'}
                  </div>
                </div>

                {q.answerKeywords && q.answerKeywords.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">考点总结</div>
                    <div className="flex flex-wrap gap-2">
                      {q.answerKeywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnswer(true)}
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                查看参考答案与考点
              </Button>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                关闭
              </Button>
              {onRetry && (
                <Button onClick={onRetry} className="flex-1">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  再答一次
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
