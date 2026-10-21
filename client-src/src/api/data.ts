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

export interface LearningExportResult {
  /** 备份文件名（learning-data-时间戳.json） */
  fileName: string;
  /** 服务端同时备份到的路径 */
  path: string;
  size: number;
  counts: Record<string, number>;
  /** 完整学习数据，前端用它触发浏览器下载 */
  data: Record<string, unknown>;
}

/** 导出学习数据（掌握度 / 错题 / 复习记录 / 试卷 / 设置等个人进度） */
export async function exportLearning(): Promise<LearningExportResult> {
  const { data } = await axiosForBackend.post<LearningExportResult>(
    '/api/data/export-learning',
  );
  return data;
}

export interface ImportLearningResult {
  /** 导入前自动备份的文件路径 */
  backupFile: string;
  applied: Record<string, number>;
  skipped: Record<string, number>;
}

/** 导入学习数据（合并模式，不删除本机已有记录） */
export async function importLearning(
  payload: Record<string, unknown>,
): Promise<ImportLearningResult> {
  const { data } = await axiosForBackend.post<ImportLearningResult>(
    '/api/data/import-learning',
    payload,
  );
  return data;
}

export interface ImportContentResult {
  applied: Record<string, number>;
}

/** 导入内容数据（4 个导出文件的文件名 → 内容映射） */
export async function importContent(
  files: Record<string, unknown>,
): Promise<ImportContentResult> {
  const { data } = await axiosForBackend.post<ImportContentResult>(
    '/api/data/import-content',
    { files },
  );
  return data;
}
