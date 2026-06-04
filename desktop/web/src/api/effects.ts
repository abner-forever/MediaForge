import { get, post, del } from './base';
import { sseGet } from './sse';
import type { PublishEffect, EffectSummary, EffectTrendPoint, EffectCompareData, MpArticlesResponse, TopArticle, ImageAnalysisItem, AiAnalysisEvent } from '../types';

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

  funnel: (days: number = 0, itemId: string = '') =>
    get<{ total_reads: number; total_likes: number; total_shares: number; total_favorites: number; total_comments: number; total_new_followers: number }>(
      `/api/effects/funnel?days=${days}&item_id=${itemId}`,
    ),

  articleOptions: () =>
    get<{ articles: Array<{ item_id: string; title: string; publish_time: string }> }>('/api/effects/article-options'),

  topArticles: (limit: number = 10) =>
    get<{ articles: TopArticle[] }>(`/api/effects/top-articles?limit=${limit}`),

  imageAnalysis: () =>
    get<{ items: ImageAnalysisItem[] }>('/api/effects/image-analysis'),

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

  /** AI 智能分析：流式返回公众号运营建议 */
  aiAnalysis: (days: number = 0, onEvent: (evt: AiAnalysisEvent) => void, signal?: AbortSignal) =>
    sseGet<AiAnalysisEvent>(`/api/effects/ai-analysis?days=${days}`, onEvent, { signal }),

  exportCsv: async () => {
    const { effects } = await get<{ effects: Record<string, PublishEffect> }>('/api/effects');
    const fields = [
      'item_id', 'title', 'account_id', 'publish_time',
      'reads', 'likes', 'shares', 'favorites',
      'comments', 'content_type',
      'source_platform', 'celebrity', 'image_count', 'updated_at',
    ] as const;
    const headers = [
      '文章ID', '标题', '账号ID', '发布时间',
      '阅读量', '点赞数', '转发数', '收藏数',
      '评论数', '内容类型',
      '来源平台', '艺人', '图片数', '更新时间',
    ];
    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [headers.map(csvEscape).join(',')];
    for (const [key, item] of Object.entries(effects)) {
      rows.push(
        [key, ...fields.slice(1).map(f => csvEscape(item[f]))].join(','),
      );
    }
    const bom = '﻿';
    const csvContent = bom + rows.join('\n');

    if (window.pywebview?.api) {
      // PyWebView 环境：弹出原生文件保存对话框
      const encoded = btoa(unescape(encodeURIComponent(csvContent)));
      await window.pywebview.api.save_file('effects_export.csv', encoded, 'text/csv');
    } else {
      // 普通浏览器：blob 下载
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'effects_export.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  },
};
