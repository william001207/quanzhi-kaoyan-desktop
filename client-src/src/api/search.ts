import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { SearchResult } from '@shared/api.interface';

export async function globalSearch(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const { data } = await axiosForBackend.get<SearchResult>('/api/search', {
    params: { q: query },
    signal,
  });
  return data;
}
