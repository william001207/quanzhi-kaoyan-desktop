import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  StatsOverview,
  SubjectStats,
  MasteryDistribution,
  ReviewLoadDay,
  FreqMasteryPoint,
  HighFreqItem,
} from '@shared/api.interface';

export async function getOverview(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<StatsOverview> {
  const { data } = await axiosForBackend.get<StatsOverview>(
    '/api/stats/overview',
    { params },
  );
  return data;
}

export async function getBySubject(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<SubjectStats[]> {
  const { data } = await axiosForBackend.get<SubjectStats[]>(
    '/api/stats/by-subject',
    { params },
  );
  return data;
}

export async function getMasteryDistribution(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<MasteryDistribution> {
  const { data } = await axiosForBackend.get<MasteryDistribution>(
    '/api/stats/mastery-distribution',
    { params },
  );
  return data;
}

export async function getFreqMastery(): Promise<FreqMasteryPoint[]> {
  const { data } = await axiosForBackend.get<FreqMasteryPoint[]>(
    '/api/stats/freq-mastery',
  );
  return data;
}

export async function getReviewLoad(days: number = 14): Promise<ReviewLoadDay[]> {
  const { data } = await axiosForBackend.get<ReviewLoadDay[]>(
    '/api/stats/review-load',
    { params: { days } },
  );
  return data;
}

export async function getHighFreq(limit: number = 10): Promise<HighFreqItem[]> {
  const { data } = await axiosForBackend.get<HighFreqItem[]>(
    '/api/stats/high-freq',
    { params: { limit } },
  );
  return data;
}
