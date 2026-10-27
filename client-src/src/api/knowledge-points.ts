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
   /** 连同下级章节一起筛选（大纲地图点「篇 / 章」时需要） */
   includeDescendants?: boolean;
   status?: string;
   keyword?: string;
   source?: SyllabusMode;
   weakMarked?: boolean;
 }

/**
 * 各章节的知识点数量（服务端已按父子关系向上汇总），用于大纲地图树上的数字角标。
 */
export async function getChapterCounts(
  subjectId: string,
  source: SyllabusMode,
): Promise<Record<string, number>> {
  const { data } = await axiosForBackend.get<Record<string, number>>(
    '/api/knowledge-points/chapter-counts',
    { params: { subjectId, source } },
  );
  return data ?? {};
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

export interface CreateKnowledgePointData {
  subjectId: string;
  chapterId: string;
  title: string;
  requirementLevel?: string;
  importanceScore?: number;
  cardData?: KnowledgePointCardData;
}

export async function create(
  data: CreateKnowledgePointData,
): Promise<KnowledgePoint> {
  const { data: result } = await axiosForBackend.post<KnowledgePoint>(
    '/api/knowledge-points',
    data,
  );
  return result;
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
