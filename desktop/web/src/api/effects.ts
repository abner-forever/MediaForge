import { get, post, del } from './base';
import type { PublishEffect, EffectSummary, EffectTrendPoint, EffectCompareData, MpArticlesResponse } from '../types';

export const effectsApi = {
  list: () => get<{ effects: Record<string, PublishEffect> }>('/api/effects'),
  get: (itemId: string) => get<{ effect: PublishEffect | null }>(`/api/effects/${itemId}`),
  save: (itemId: string, data: Partial<PublishEffect>) =>
    post<{ success: boolean; effect: PublishEffect }>(`/api/effects/${itemId}`, data),

  summary: () => get<EffectSummary>('/api/effects/summary'),
  trend: (days: number = 30) => get<{ trend: EffectTrendPoint[] }>(`/api/effects/trend?days=${days}`),
  compare: () => get<EffectCompareData>('/api/effects/compare'),

  celebrityRank: (days: number = 0) =>
    get<{ celebrities: Array<{ name: string; avg_reads: number; count: number }> }>(
      `/api/effects/celebrity-rank?days=${days}`,
    ),

  mpArticles: (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    celebrity?: string;
    sort_key?: string;
    sort_dir?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));
    if (params?.search) q.set('search', params.search);
    if (params?.celebrity) q.set('celebrity', params.celebrity);
    if (params?.sort_key) q.set('sort_key', params.sort_key);
    if (params?.sort_dir) q.set('sort_dir', params.sort_dir);
    const qs = q.toString();
    return get<MpArticlesResponse>(`/api/effects/mp-articles${qs ? '?' + qs : ''}`);
  },

  clearMpArticles: () => del<{ success: boolean; deleted: number }>('/api/effects/mp-articles'),

  exportCsv: async () => {
    const res = await fetch('/api/effects/export?format=csv');
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'effects_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};
