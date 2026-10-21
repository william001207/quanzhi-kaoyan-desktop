import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { UserSetting, ClearDataResult, ClearDataType, ClearDataRange } from '@shared/api.interface';

export async function get(): Promise<UserSetting> {
  const { data } = await axiosForBackend.get<UserSetting>('/api/settings');
  return data;
}

export type UpdateSettingsData = Partial<UserSetting>;

export async function update(data: UpdateSettingsData): Promise<UserSetting> {
  const { data: result } = await axiosForBackend.patch<UserSetting>(
    '/api/settings',
    data,
  );
  return result;
}

export async function clearLearningData(
  type: ClearDataType,
  range: ClearDataRange,
): Promise<ClearDataResult> {
  const { data } = await axiosForBackend.post<ClearDataResult>(
    '/api/settings/clear-data',
    { type, range },
  );
  return data;
}
