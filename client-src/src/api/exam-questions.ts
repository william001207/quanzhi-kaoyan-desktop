import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { ExamQuestion, ExamQuestionBrief, HighFreqItem, HighFreqQuestion, KnowledgePointCardData, PaginatedResponse, QuestionReviewDetail, SchoolQuestionGroup, SchoolQuestionOverview, SubjectQuestionOverview, YearQuestionGroup, YearQuestionOverview, CreateExamQuestionPayload } from '@shared/api.interface';

export interface ListParams {
  page?: number;
  pageSize?: number;
  subjectId?: string;
  year?: number;
  questionType?: string;
  keyword?: string;
  knowledgePointId?: string;
  school?: string;
}

export async function list(
  params: ListParams = {},
): Promise<PaginatedResponse<ExamQuestion>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<ExamQuestion>>(
    '/api/exam-questions',
    { params },
  );
  return data;
}

export async function getById(id: string): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.get<ExamQuestion>(
    `/api/exam-questions/${id}`,
  );
  return data;
}

export async function getReviewDetail(id: string): Promise<QuestionReviewDetail> {
  const { data } = await axiosForBackend.get<QuestionReviewDetail>(
    `/api/exam-questions/${id}/review-detail`,
  );
  return data;
}

export interface HighFreqParams {
  subjectId?: string;
  source?: string;
  school?: string;
  year?: number;
  questionType?: string;
  keyword?: string;
  limit?: number;
}

export async function getHighFreq(
  params: HighFreqParams = {},
): Promise<HighFreqItem[]> {
  const { data } = await axiosForBackend.get<HighFreqItem[]>(
    '/api/exam-questions/high-freq',
    { params },
  );
  return data;
}

export async function getHighFreqQuestions(
  params: HighFreqParams & { page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<HighFreqQuestion>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<HighFreqQuestion>>(
    '/api/exam-questions/high-freq-questions',
    { params },
  );
  return data;
}

export async function getAllSources(): Promise<string[]> {
  const { data } = await axiosForBackend.get<string[]>(
    '/api/exam-questions/sources',
  );
  return data;
}

export interface SubmitAnswerData {
  userAnswer: string;
  isCorrect?: boolean;
  score?: number;
}

export interface SubmitAnswerResult {
  questionId: string;
  isCorrect: boolean;
  score: number;
  masteryChange: number;
}

export async function submitAnswer(
  id: string,
  data: SubmitAnswerData,
): Promise<SubmitAnswerResult> {
  const { data: result } = await axiosForBackend.post<SubmitAnswerResult>(
    `/api/exam-questions/${id}/submit`,
    data,
  );
  return result;
}

export async function updateCardData(
  id: string,
  cardData: KnowledgePointCardData,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.patch<ExamQuestion>(
    `/api/exam-questions/${id}/card-data`,
    { cardData },
  );
  return data;
}

export async function updateAnswer(
  id: string,
  answer: string,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.patch<ExamQuestion>(
    `/api/exam-questions/${id}/answer`,
    { answer },
  );
  return data;
}

export async function updateQuestionText(
  id: string,
  questionText: string,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.patch<ExamQuestion>(
    `/api/exam-questions/${id}/question-text`,
    { questionText },
  );
  return data;
}

export async function getBySchool(
  keyword?: string,
): Promise<SchoolQuestionOverview[]> {
  const { data } = await axiosForBackend.get<SchoolQuestionOverview[]>(
    '/api/exam-questions/by-school',
    { params: keyword ? { keyword } : undefined },
  );
  return data;
}

export async function getSchoolQuestions(
  school: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<ExamQuestionBrief>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<ExamQuestionBrief>>(
    `/api/exam-questions/by-school/${encodeURIComponent(school)}/questions`,
    { params: { page, pageSize } },
  );
  return data;
}

export async function getByYear(
  subjectId?: string,
): Promise<YearQuestionOverview[]> {
  const { data } = await axiosForBackend.get<YearQuestionOverview[]>(
    '/api/exam-questions/by-year',
    { params: subjectId ? { subjectId } : undefined },
  );
  return data;
}

export async function getYearQuestions(
  year: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<ExamQuestionBrief>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<ExamQuestionBrief>>(
    `/api/exam-questions/by-year/${year}/questions`,
    { params: { page, pageSize } },
  );
  return data;
}

export async function getBySubject(): Promise<SubjectQuestionOverview[]> {
  const { data } = await axiosForBackend.get<SubjectQuestionOverview[]>(
    '/api/exam-questions/by-subject',
  );
  return data;
}

export async function getSubjectQuestions(
  subjectId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<ExamQuestionBrief>> {
  const { data } = await axiosForBackend.get<PaginatedResponse<ExamQuestionBrief>>(
    `/api/exam-questions/by-subject/${subjectId}/questions`,
    { params: { page, pageSize } },
  );
  return data;
}

export async function addKnowledgePoint(
  questionId: string,
  knowledgePointId: string,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.post<ExamQuestion>(
    `/api/exam-questions/${questionId}/knowledge-points`,
    { knowledgePointId },
  );
  return data;
}

export async function removeKnowledgePoint(
  questionId: string,
  knowledgePointId: string,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.delete<ExamQuestion>(
    `/api/exam-questions/${questionId}/knowledge-points/${knowledgePointId}`,
  );
  return data;
}

export async function updateAnswerKeywords(
  id: string,
  answerKeywords: string[],
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.patch<ExamQuestion>(
    `/api/exam-questions/${id}/answer-keywords`,
    { answerKeywords },
  );
  return data;
}

export async function create(
  payload: CreateExamQuestionPayload,
): Promise<ExamQuestion> {
  const { data } = await axiosForBackend.post<ExamQuestion>(
    '/api/exam-questions',
    payload,
  );
  return data;
}
