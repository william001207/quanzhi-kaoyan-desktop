import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Printer } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as api from '@/api';
import type {
   ExamPaperDetail,
   QuestionType,
   ExamQuestion,
 } from '@shared/api.interface';
import { QUESTION_TYPE_LABEL } from '@shared/api.interface';
import { Badge } from '@/components/ui/badge';

const PaperPrintPage: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const [paper, setPaper] = useState<ExamPaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!paperId) return;
      setLoading(true);
      try {
        const data = await api.mockExam.getPaperDetail(paperId);
        setPaper(data);
      } catch (err: unknown) {
        logger.error('加载试卷详情失败', err);
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message || '加载试卷失败，请重试';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [paperId]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const isSubjective = (qType: QuestionType): boolean => {
    return (
      qType === 'noun_explanation' ||
      qType === 'short_answer' ||
      qType === 'essay' ||
      qType === 'other'
    );
  };

  const TYPE_ORDER: QuestionType[] = [
    'noun_explanation',
    'short_answer',
    'essay',
    'multiple_choice',
    'fill_blank',
    'other',
  ];

  const groupedQuestions = useMemo(() => {
    if (!paper) return [];
    const groups: Array<{
      type: QuestionType;
      questions: ExamQuestion[];
      score: number;
      startIndex: number;
    }> = [];
    let index = 0;
    for (const t of TYPE_ORDER) {
      const qs = paper.questions.filter((q) => q.questionType === t);
      if (qs.length > 0) {
        const score =
          (paper.scoreConfig as Record<string, number>)[t] ?? 0;
        groups.push({
          type: t,
          questions: qs,
          score,
          startIndex: index,
        });
        index += qs.length;
      }
    }
    return groups;
  }, [paper]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-12 text-muted-foreground">
        试卷不存在或加载失败
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @media print {
          body {
            background: white !important;
          }
          .print-actions,
          header,
          .sidebar,
          nav,
          .no-print {
            display: none !important;
          }
          .print-content {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-question {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-answer-space {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @page {
            size: A4;
            margin: 2cm;
          }
          body {
            font-size: 12pt;
            line-height: 1.6;
          }
          .print-title {
            font-size: 18pt !important;
          }
        }
      `}</style>

      {/* 操作栏 */}
      <div className="print-actions sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/mock-exam">
              <Button variant="ghost" size="sm" aria-label="返回">
                <ArrowLeft className="h-4 w-4 mr-1" />
                返回
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              value={showAnswer ? 'answer' : 'question'}
              onValueChange={(v: string) => {
                if (v === 'answer') setShowAnswer(true);
                else if (v === 'question') setShowAnswer(false);
              }}
            >
              <ToggleGroupItem value="question">题目版</ToggleGroupItem>
              <ToggleGroupItem value="answer">答案版</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />
              打印
            </Button>
          </div>
        </div>
      </div>

      {/* 打印内容区 */}
      <div className="print-content max-w-3xl mx-auto px-6 py-8">
        <div className="no-print mb-6">
          <h1 className="text-2xl font-semibold">试卷详情</h1>
        </div>
        <h1 className="print-title text-2xl font-semibold text-center mb-4">
          {paper.title}
        </h1>

        <div className="text-sm text-muted-foreground border-b pb-3 mb-6 flex flex-wrap gap-x-6 gap-y-1 justify-center">
          <span>总分：{paper.totalScore} 分</span>
          <span>题数：{paper.totalQuestions} 题</span>
          <span>建议时长：{paper.estimatedMinutes} 分钟</span>
          <span>创建时间：{formatDate(paper.createdAt)}</span>
        </div>

        <div className="space-y-10">
          {groupedQuestions.map((group) => (
            <div key={group.type} className="space-y-6">
              <div className="flex items-baseline gap-3 border-b pb-2">
                <h2 className="text-lg font-semibold">
                  {QUESTION_TYPE_LABEL[group.type] || group.type}
                </h2>
                <span className="text-sm text-muted-foreground">
                  （共 {group.questions.length} 题，每题 {group.score} 分，共{' '}
                  {group.questions.length * group.score} 分）
                </span>
              </div>

              {group.questions.map((q, idx) => {
                const globalIndex = group.startIndex + idx + 1;
                return (
                  <div key={q.id} className="print-question">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="font-medium">{globalIndex}.</span>
                      <span className="text-sm text-muted-foreground">
                        （{group.score} 分）
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap text-base leading-relaxed pl-6">
                      {q.questionText}
                    </div>

                    {isSubjective(q.questionType) && !showAnswer && (
                      <div className="print-answer-space mt-4 ml-6">
                        <div className="border-b border-dashed border-muted-foreground/30 h-24"></div>
                      </div>
                    )}

                    {showAnswer && (
                      <div className="mt-4 ml-6 space-y-3">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">
                            参考答案
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 p-3 rounded">
                            {q.answer || '暂无答案'}
                          </div>
                        </div>

                        {q.cardData?.summary && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1">
                              考点总结
                            </div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 p-3 rounded">
                              {q.cardData.summary}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaperPrintPage;
