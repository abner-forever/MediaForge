import { get, post, del } from './base';
import { sseGet } from './sse';
import type { Post, ScoreInfo, DiscoveryResult, DownloadStreamEvent, SearchStreamEvent } from '../types';

export const discoveryApi = {
  get: () => get<{ posts: Post[] }>('/api/discovery'),
  search: (params: {
    platform: string;
    mode: string;
    celebrities: string[];
    search_tags: string[];
    super_topics: string[];
    max_pages: number;
    post_limit: number;
  }) => post<DiscoveryResult>('/api/discovery/search', params),
  download: (post_indices?: number[]) =>
    post<{ success: boolean; posts: Post[]; total_downloaded: number }>('/api/discovery/download', { post_indices }),
  removePost: (index: number) => del<{ success: boolean }>(`/api/discovery/post/${index}`),
  score: (use_vision = true) =>
    post<{ success: boolean; scores: Record<string, ScoreInfo>; vision_count: number; heuristic_count: number }>(
      '/api/discovery/score', { use_vision }
    ),
  checkWatermark: (paths: string[]) =>
    post<{ watermarked: string[] }>('/api/discovery/check-watermark', paths),
  trendingCelebrities: () => get<{ celebrities: string[] }>('/api/discovery/trending-celebrities'),
};

export async function downloadStream(
  indices: string,
  onEvent: (evt: DownloadStreamEvent) => void,
  filterWatermark?: boolean,
): Promise<void> {
  let url = `/api/discovery/download-stream?indices=${encodeURIComponent(indices)}`;
  if (filterWatermark !== undefined) url += `&filter_watermark=${filterWatermark}`;
  await sseGet<DownloadStreamEvent>(url, onEvent, { flushBuffer: false });
}

export async function searchStream(
  params: {
    platform: string;
    mode: string;
    celebrities: string[];
    search_tags: string[];
    super_topics: string[];
    max_pages: number;
    post_limit: number;
    page?: number;
  },
  onEvent: (evt: SearchStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const q = new URLSearchParams({
    platform: params.platform,
    mode: params.mode,
    celebrities: params.celebrities.join(','),
    search_tags: params.search_tags.join(','),
    super_topics: params.super_topics.join(','),
    max_pages: String(params.max_pages),
    post_limit: String(params.post_limit),
  });
  if (params.page) q.set('page', String(params.page));
  await sseGet<SearchStreamEvent>(`/api/discovery/search-stream?${q}`, onEvent, { signal, flushBuffer: false });
}
