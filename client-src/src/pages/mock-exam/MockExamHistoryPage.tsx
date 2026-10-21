import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import * as api from '@/api';
import type { ExamRecordListItem } from '@shared/api.interface';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '未交卷';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MockExamHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<ExamRecordListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.mockExam.getRecords({ page, pageSize });
        setRecords(data.items);
        setTotal(data.total);
      } catch (err) {
        logger.error('加载历史记录失败', err);
        toast.error('加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">考试历史</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看历次模拟考试记录与成绩报告
          </p>
        </div>
        <Button onClick={() => navigate('/mock-exam')}>
          <FileText className="h-4 w-4 mr-2" />
          开始新考试
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            全部记录
            <span className="text-muted-foreground font-normal text-sm ml-2">
              共 {total} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <div className="text-sm">暂无考试记录</div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate('/mock-exam')}
              >
                去组卷
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <Link
                  key={record.id}
                  to={`/mock-exam/${record.id}?review=1`}
                  className="block border rounded-lg p-4 hover:border-primary/30 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {record.title}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span>{formatDate(record.submittedAt)}</span>
                        <span>共 {record.totalQuestions} 题</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {record.status === 'submitted' ? (
                        <>
                          <div
                            className={`text-lg font-semibold ${
                              record.earnedScore / record.totalScore >= 0.6
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                          >
                            {record.earnedScore}
                            <span className="text-sm text-muted-foreground font-normal">
                              {' '}
                              / {record.totalScore}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className="mt-1 text-xs font-normal"
                          >
                            已交卷
                          </Badge>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-semibold text-amber-600">
                            进行中
                          </div>
                          <Badge
                            variant="outline"
                            className="mt-1 text-xs font-normal text-amber-600 border-amber-200 bg-amber-50"
                          >
                            未交卷
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-2">
                    <span className="text-xs text-primary flex items-center">
                      {record.status === 'submitted' ? '查看详情' : '继续答题'}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      disabled={loading}
                      className="w-8 h-8 p-0"
                    >
                      {p}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={page === totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MockExamHistoryPage;
