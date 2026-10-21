import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { Subject } from '@shared/api.interface';

export async function getAll(): Promise<Subject[]> {
  const { data } = await axiosForBackend.get<Subject[]>('/api/subjects');
  return data;
}

export async function getById(id: string): Promise<Subject> {
  const { data } = await axiosForBackend.get<Subject>(`/api/subjects/${id}`);
  return data;
}
