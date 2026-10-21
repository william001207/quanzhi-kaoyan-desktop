import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
 import type {
     WrongQuestionWithDetail,
     TopWrongItem,
     PaginatedResponse,
     WrongQuestionStats,
     WeakMarkKnowledgePoint,
     ErrorTag,
   } from '@shared/api.interface';

export interface ListParams {
    page?: number;
    pageSize?: number;
    subjectId?: string;
    resolved?: boolean;
    mistakeReason?: string;
    keyword?: string;
    errorTags?: string[];
  }

export async function list(
  params: ListParams = {},
): Promise<PaginatedResponse<WrongQuestionWithDetail>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<WrongQuestionWithDetail>
  >('/api/wrong-questions', { params });
  return data;
}

export interface UpdateWrongQuestionData {
   resolved?: boolean;
   mistakeReason?: string;
   userAnswer?: string;
   notes?: string;
   errorTags?: ErrorTag[];
 }

export async function update(
  id: string,
  data: UpdateWrongQuestionData,
): Promise<WrongQuestionWithDetail> {
  const { data: result } = await axiosForBackend.patch<WrongQuestionWithDetail>(
    `/api/wrong-questions/${id}`,
    data,
  );
  return result;
}

export async function getTop(limit: number = 10): Promise<TopWrongItem[]> {
  const { data } = await axiosForBackend.get<TopWrongItem[]>(
    '/api/wrong-questions/top',
    { params: { limit } },
  );
  return data;
}

export async function remove(id: string): Promise<{ success: true; id: string }> {
  const { data } = await axiosForBackend.delete<{ success: true; id: string }>(
    `/api/wrong-questions/${id}`,
  );
  return data;
}

export async function getByQuestionId(
  questionId: string,
): Promise<WrongQuestionWithDetail | null> {
  const { data } = await axiosForBackend.get<WrongQuestionWithDetail | null>(
    `/api/wrong-questions/by-question/${questionId}`,
  );
  return data;
}

export interface AddWrongQuestionData {
  questionId: string;
  mistakeReason?: string;
  userAnswer?: string;
}

export async function add(
  data: AddWrongQuestionData,
): Promise<WrongQuestionWithDetail> {
  const { data: result } = await axiosForBackend.post<WrongQuestionWithDetail>(
    '/api/wrong-questions/add',
    data,
  );
  return result;
}

export interface RedoResultData {
  score: number;
  mastered?: boolean;
  userAnswer?: string;
}

export async function submitRedo(
   id: string,
   data: RedoResultData,
 ): Promise<WrongQuestionWithDetail> {
   const { data: result } = await axiosForBackend.post<WrongQuestionWithDetail>(
     `/api/wrong-questions/${id}/redo`,
     data,
   );
   return result;
 }

export async function getStats(): Promise<WrongQuestionStats> {
  const { data } = await axiosForBackend.get<WrongQuestionStats>(
    '/api/wrong-questions/stats',
  );
  return data;
}

export interface BatchRemoveData {
  ids?: string[];
  onlyUnresolved?: boolean;
}

export async function batchRemove(
   data: BatchRemoveData,
 ): Promise<{ success: true; deletedCount: number }> {
   const { data: result } = await axiosForBackend.post<{
     success: true;
     deletedCount: number;
   }>('/api/wrong-questions/batch-remove', data);
   return result;
 }

export interface WeakKnowledgePointsParams {
  page?: number;
  pageSize?: number;
  subjectId?: string;
  search?: string;
}

export async function getWeakKnowledgePoints(
  params: WeakKnowledgePointsParams = {},
): Promise<PaginatedResponse<WeakMarkKnowledgePoint>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<WeakMarkKnowledgePoint>
  >('/api/wrong-questions/weak-knowledge-points', { params });
  return data;
}
