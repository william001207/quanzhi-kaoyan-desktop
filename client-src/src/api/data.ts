import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

export interface ExportResult {
  /** 导出目录（userData/export/） */
  dir: string;
  files: { name: string; size: number }[];
}

/**
 * 把当前内容数据（题库 / 知识点 / 章节 / 科目）导出成文件。
 * 导出后覆盖到仓库 server/data-export/ 即成为下一版的数据源。
 */
export async function exportContent(): Promise<ExportResult> {
  const { data } = await axiosForBackend.post<ExportResult>('/api/data/export');
  return data;
}
