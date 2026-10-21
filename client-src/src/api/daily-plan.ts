import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  DailyPlan,
  DailyPlanItem,
  ExamQuestionBrief,
  KnowledgePoint,
  PaginatedResponse,
} from '@shared/api.interface';

export interface TodayPlanResponse extends DailyPlan {
  items: DailyPlanItem[];
}

export async function getTodayPlan(): Promise<TodayPlanResponse> {
  const { data } = await axiosForBackend.get<TodayPlanResponse>(
    '/api/daily-plan/today',
  );
  return data;
}

export async function generateToday(): Promise<TodayPlanResponse> {
  const { data } = await axiosForBackend.post<TodayPlanResponse>(
    '/api/daily-plan/generate',
  );
  return data;
}

export interface UpdateItemData {
  completed?: boolean;
  completedAt?: string;
  notes?: string;
}

export async function updateItem(
  id: string,
  data: UpdateItemData,
): Promise<DailyPlanItem> {
  const { data: result } = await axiosForBackend.patch<DailyPlanItem>(
    `/api/daily-plan/items/${id}`,
    data,
  );
  return result;
}

export interface AddManualItemsData {
  knowledgePointIds?: string[];
  questionIds?: string[];
}

export async function addManualItems(
  data: AddManualItemsData,
): Promise<TodayPlanResponse> {
  const { data: result } = await axiosForBackend.post<TodayPlanResponse>(
    '/api/daily-plan/manual-items',
    data,
  );
  return result;
}

export interface CandidatesParams {
  itemType: 'knowledge_point' | 'question';
  page?: number;
  pageSize?: number;
  keyword?: string;
  subjectId?: string;
  year?: number;
  questionType?: string;
  school?: string;
}

export async function getCandidates(
  params: CandidatesParams,
): Promise<PaginatedResponse<KnowledgePoint | ExamQuestionBrief>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<KnowledgePoint | ExamQuestionBrief>
  >('/api/daily-plan/candidates', { params });
  return data;
}
