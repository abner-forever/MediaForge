import { get, post, del } from './base';
import type { HealthStatus, DashboardStats, RunInfo, OperationsResponse } from '../types';

export const dashboardApi = {
  health: () => get<HealthStatus>('/api/dashboard/health'),
  stats: () => get<DashboardStats>('/api/dashboard/stats'),
  runs: () => get<RunInfo[]>('/api/dashboard/runs'),
  deleteRun: (runId: string) => del<{ success: boolean }>(`/api/dashboard/runs/${runId}`),
  operations: (page = 1, pageSize = 10) => get<OperationsResponse>(`/api/dashboard/operations?page=${page}&page_size=${pageSize}`),
  deleteOperations: (ids: string[]) => post<{ success: boolean; deleted: number }>('/api/dashboard/operations/delete', { ids }),
  clearOperations: () => post<{ success: boolean; deleted: number }>('/api/dashboard/operations/delete', { clear: true }),
};
