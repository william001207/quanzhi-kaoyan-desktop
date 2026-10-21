import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
   KnowledgePoint,
   KnowledgePointCardData,
   ExamQuestion,
   ReviewRecord,
   PaginatedResponse,
   SyllabusMode,
   WeakMarkReason,
 } from '@shared/api.interface';

export interface ListParams {
   page?: number;
   pageSize?: number;
   subjectId?: string;
   chapterId?: string;
   status?: string;
   keyword?: string;
   source?: SyllabusMode;
   weakMarked?: boolean;
 }

export async function list(
  params: ListParams = {},
): Promise<PaginatedResponse<KnowledgePoint>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<KnowledgePoint>>(
    '/api/knowledge-points',
    { params },
  );
  return data;
}

export async function getById(id: string): Promise<KnowledgePoint> {
  const { data } = await axiosForBackend.get<KnowledgePoint>(
    `/api/knowledge-points/${id}`,
  );
  return data;
}

export async function getQuestions(id: string): Promise<ExamQuestion[]> {
  const { data } = await axiosForBackend.get<ExamQuestion[]>(
    `/api/knowledge-points/${id}/questions`,
  );
  return data;
}

export async function getReviewRecords(id: string): Promise<ReviewRecord[]> {
  const { data } = await axiosForBackend.get<ReviewRecord[]>(
    `/api/knowledge-points/${id}/review-records`,
  );
  return data;
}

export interface UpdateKnowledgePointData {
  title?: string;
  content?: string;
  summary?: string;
  keywords?: string[];
  requirementLevel?: string;
  importanceScore?: number;
}

export async function update(
  id: string,
  data: UpdateKnowledgePointData,
): Promise<KnowledgePoint> {
  const { data: result } = await axiosForBackend.patch<KnowledgePoint>(
    `/api/knowledge-points/${id}`,
    data,
  );
  return result;
}

export async function pin(id: string): Promise<KnowledgePoint> {
  const { data } = await axiosForBackend.post<KnowledgePoint>(
    `/api/knowledge-points/${id}/pin`,
  );
  return data;
}

export async function unpin(id: string): Promise<KnowledgePoint> {
  const { data } = await axiosForBackend.post<KnowledgePoint>(
    `/api/knowledge-points/${id}/unpin`,
  );
  return data;
}

export async function updateCardData(
   id: string,
   cardData: KnowledgePointCardData,
 ): Promise<KnowledgePoint> {
   const { data } = await axiosForBackend.patch<KnowledgePoint>(
     `/api/knowledge-points/${id}`,
     { cardData },
   );
   return data;
 }

export async function markWeak(
  id: string,
  reason?: WeakMarkReason,
): Promise<KnowledgePoint> {
  const { data } = await axiosForBackend.post<KnowledgePoint>(
    `/api/knowledge-points/${id}/weak-mark`,
    reason ? { reason } : {},
  );
  return data;
}

export async function unmarkWeak(
  id: string,
): Promise<KnowledgePoint> {
  const { data } = await axiosForBackend.delete<KnowledgePoint>(
    `/api/knowledge-points/${id}/weak-mark`,
  );
  return data;
}

export async function addQuestion(
  knowledgePointId: string,
  questionId: string,
): Promise<ExamQuestion[]> {
  const { data } = await axiosForBackend.post<ExamQuestion[]>(
    `/api/knowledge-points/${knowledgePointId}/questions`,
    { questionId },
  );
  return data;
}

export async function removeQuestion(
  knowledgePointId: string,
  questionId: string,
): Promise<ExamQuestion[]> {
  const { data } = await axiosForBackend.delete<ExamQuestion[]>(
    `/api/knowledge-points/${knowledgePointId}/questions/${questionId}`,
  );
  return data;
}
