import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ReviewRecord,
  KnowledgePoint,
} from '@shared/api.interface';

export interface GetQueueParams {
  limit?: number;
  type?: 'due' | 'overdue' | 'all';
}

export async function getQueue(
  params: GetQueueParams = {},
): Promise<KnowledgePoint[]> {
  const { data } = await axiosForBackend.get<KnowledgePoint[]>(
    '/api/review/queue',
    { params },
  );
  return data;
}

export interface KnowledgePointReviewData {
  selfRating: string;
  recallScore: number;
  notes?: string;
}

export interface KnowledgePointReviewResult {
  knowledgePoint: KnowledgePoint;
  reviewRecord: ReviewRecord;
}

export async function submitKnowledgePointReview(
  id: string,
  data: KnowledgePointReviewData,
): Promise<KnowledgePointReviewResult> {
  const { data: result } = await axiosForBackend.post<KnowledgePointReviewResult>(
    `/api/review/knowledge-points/${id}`,
    data,
  );
  return result;
}

export interface QuestionResultData {
  score: number;
  selfRating?: 'again' | 'hard' | 'good' | 'easy';
  userAnswer?: string;
  knowledgePointIds?: string[];
}

export async function submitQuestionResult(
  id: string,
  data: QuestionResultData,
): Promise<ReviewRecord> {
  const { data: result } = await axiosForBackend.post<ReviewRecord>(
    `/api/review/questions/${id}`,
    data,
  );
  return result;
}
