import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  GeneratePaperDto,
  GenerateByYearDto,
  GeneratePaperResult,
  ExamRecordDetail,
  ExamRecordListItem,
  ExamPaperListItem,
  StartExamResult,
  SelfRateResult,
  PaginatedResponse,
   ExamPaperTemplate,
   CreateTemplateDto,
   UpdateTemplateDto,
   ExamPaperDetail,
 } from '@shared/api.interface';

export async function generatePaper(
  dto: GeneratePaperDto,
): Promise<GeneratePaperResult> {
  const { data } = await axiosForBackend.post<GeneratePaperResult>(
    '/api/mock-exam/paper/generate',
    dto,
  );
  return data;
}

export async function generatePaperByYear(
  dto: GenerateByYearDto,
): Promise<GeneratePaperResult> {
  const { data } = await axiosForBackend.post<GeneratePaperResult>(
    '/api/mock-exam/paper/generate-by-year',
    dto,
  );
  return data;
}

export async function startExam(paperId: string): Promise<StartExamResult> {
  const { data } = await axiosForBackend.post<StartExamResult>(
    '/api/mock-exam/record/start',
    { paperId },
  );
  return data;
}

export async function saveAnswer(
  recordId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  await axiosForBackend.patch(
    `/api/mock-exam/record/${recordId}/answer`,
    { questionId, answer },
  );
}

export async function submitExam(
  recordId: string,
  answers: Record<string, string>,
  durationSeconds: number,
): Promise<ExamRecordDetail> {
  const { data } = await axiosForBackend.post<ExamRecordDetail>(
    `/api/mock-exam/record/${recordId}/submit`,
    { answers, durationSeconds },
  );
  return data;
}

export interface SelfRateParams {
  questionId: string;
  rating: 'again' | 'partial' | 'basic' | 'full';
  addToWrong: boolean;
  knowledgePointIds?: string[];
}

export async function selfRate(
  recordId: string,
  params: SelfRateParams,
): Promise<SelfRateResult> {
  const { data } = await axiosForBackend.post<SelfRateResult>(
    `/api/mock-exam/record/${recordId}/self-rate`,
    params,
  );
  return data;
}

export async function getRecords(params: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ExamRecordListItem>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<ExamRecordListItem>
  >('/api/mock-exam/records', { params });
  return data;
}

export async function getRecord(id: string): Promise<ExamRecordDetail> {
  const { data } = await axiosForBackend.get<ExamRecordDetail>(
    `/api/mock-exam/record/${id}`,
  );
  return data;
}

export async function getPapers(params: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ExamPaperListItem>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<ExamPaperListItem>
  >('/api/mock-exam/papers', { params });
  return data;
}

export async function getPaperDetail(paperId: string): Promise<ExamPaperDetail> {
  const { data } = await axiosForBackend.get<ExamPaperDetail>(
    `/api/mock-exam/paper/${paperId}`,
  );
  return data;
}

export async function deletePaper(id: string): Promise<{ ok: boolean }> {
  const { data } = await axiosForBackend.delete<{ ok: boolean }>(
    `/api/mock-exam/papers/${id}`,
  );
  return data;
}

export async function getTemplates(params: {
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ExamPaperTemplate>> {
  const { data } = await axiosForBackend.get<
    PaginatedResponse<ExamPaperTemplate>
  >('/api/mock-exam/templates', { params });
  return data;
}

export async function createTemplate(
  dto: CreateTemplateDto,
): Promise<ExamPaperTemplate> {
  const { data } = await axiosForBackend.post<ExamPaperTemplate>(
    '/api/mock-exam/templates',
    dto,
  );
  return data;
}

export async function updateTemplate(
  id: string,
  dto: UpdateTemplateDto,
): Promise<ExamPaperTemplate> {
  const { data } = await axiosForBackend.patch<ExamPaperTemplate>(
    `/api/mock-exam/templates/${id}`,
    dto,
  );
  return data;
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  const { data } = await axiosForBackend.delete<{ ok: boolean }>(
    `/api/mock-exam/templates/${id}`,
  );
  return data;
}
