import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

export interface SyllabusPreview {
  subjectCount: number;
  chapterCount: number;
  itemCount: number;
  duplicateCount: number;
  preview: Array<{
    subject: string;
    chapter: string;
    title: string;
    requirementLevel: string;
  }>;
}

export interface UnmatchedKnowledgePointItem {
  questionText: string;
  unmatchedKeywords: string[];
}

export interface QuestionPreview {
  yearCount: number;
  subjectCount: number;
  questionCount: number;
  duplicateCount: number;
  preview: Array<{
    year: number;
    questionType: string;
    questionText: string;
    knowledgePoints: string[];
  }>;
  unmatchedKnowledgePoints: UnmatchedKnowledgePointItem[];
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  inserted: number;
  skipped: number;
  message?: string;
  unmatchedKnowledgePoints?: UnmatchedKnowledgePointItem[];
  errors?: string[];
}

export async function previewSyllabus(data: unknown): Promise<SyllabusPreview> {
  const { data: result } = await axiosForBackend.post<SyllabusPreview>(
    '/api/import/syllabus/preview',
    data,
  );
  return result;
}

export async function executeSyllabus(data: unknown): Promise<ImportResult> {
  const { data: result } = await axiosForBackend.post<ImportResult>(
    '/api/import/syllabus',
    data,
  );
  return result;
}

export async function previewQuestions(data: unknown): Promise<QuestionPreview> {
  const { data: result } = await axiosForBackend.post<QuestionPreview>(
    '/api/import/questions/preview',
    data,
  );
  return result;
}

export async function executeQuestions(data: unknown): Promise<ImportResult> {
  const { data: result } = await axiosForBackend.post<ImportResult>(
    '/api/import/questions',
    data,
  );
  return result;
}
