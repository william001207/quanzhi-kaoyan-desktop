import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { Chapter, SyllabusMode } from '@shared/api.interface';

export interface ChapterTree extends Chapter {
  children: ChapterTree[];
}

export async function getBySubject(
  subjectId: string,
  source: SyllabusMode = 'exam_syllabus',
): Promise<Chapter[]> {
  const { data } = await axiosForBackend.get<Chapter[]>(`/api/chapters`, {
    params: { subjectId, source },
  });
  return data;
}

export async function getTree(
  subjectId: string,
  source: SyllabusMode = 'exam_syllabus',
): Promise<ChapterTree[]> {
  const { data } = await axiosForBackend.get<ChapterTree[]>(`/api/chapters/tree`, {
    params: { subjectId, source },
  });
  return data;
}

export async function createChapter(params: {
  title: string;
  subjectId: string;
  parentChapterId?: string | null;
  source?: SyllabusMode;
}): Promise<Chapter> {
  const { data } = await axiosForBackend.post<Chapter>(`/api/chapters`, params);
  return data;
}

export async function updateChapter(
  id: string,
  params: { title?: string; sortOrder?: number },
): Promise<Chapter> {
  const { data } = await axiosForBackend.patch<Chapter>(`/api/chapters/${id}`, params);
  return data;
}

export async function moveChapter(
  id: string,
  direction: 'up' | 'down',
): Promise<Chapter> {
  const { data } = await axiosForBackend.post<Chapter>(`/api/chapters/${id}/move`, {
    direction,
  });
  return data;
}

export async function deleteChapter(id: string): Promise<void> {
  await axiosForBackend.delete(`/api/chapters/${id}`);
}
