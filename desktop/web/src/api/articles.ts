import { get, post, put, del } from './base';
import type {
  ArticleItem, ArticleListResponse, ArticleResponse, ArticleContentResponse,
  TitleCandidate, QueueItem, InspirationResponse, CoverImage,
} from '../types';

export const articleApi = {
  list: (status?: string) => {
    const q = status ? `?status=${status}` : '';
    return get<ArticleListResponse>(`/api/articles${q}`);
  },
  get: (id: string) => get<ArticleResponse>(`/api/articles/${id}`),
  create: (data: Partial<ArticleItem>) =>
    post<{ success: boolean; article: ArticleItem }>('/api/articles', data),
  update: (id: string, data: Partial<ArticleItem>) =>
    put<{ success: boolean; article: ArticleItem }>(`/api/articles/${id}`, data),
  delete: (id: string) => del<{ success: boolean }>(`/api/articles/${id}`),
  generate: (id: string, params: {
    topic?: string;
    title?: string;
    article_type?: string;
    tone?: string;
    word_count?: string;
    with_subtitles?: boolean;
    gallery_friendly?: boolean;
    template_prompt?: string;
  }) =>
    post<ArticleContentResponse>(`/api/articles/${id}/generate`, params),
  polish: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/polish`),
  deAi: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/de-ai`),
  generateTitle: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/generate-title`),
  titleCandidates: (id: string) =>
    post<{ success: boolean; candidates: TitleCandidate[] }>(`/api/articles/${id}/title-candidates`),
  optimizeLayout: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/optimize-layout`),
  publish: (id: string, opts: { save_draft?: boolean; dry_run?: boolean; account_id?: string }) =>
    post<{ success: boolean; started?: boolean; message: string }>(`/api/articles/${id}/publish`, opts),
  addToQueue: (id: string) =>
    post<{ success: boolean; queue: QueueItem[] }>(`/api/articles/${id}/queue`),
  inspiration: (keyword: string) =>
    get<InspirationResponse>(`/api/articles/inspiration?keyword=${encodeURIComponent(keyword)}`),
  coverSearch: (keyword: string) =>
    get<{ images: CoverImage[] }>(`/api/articles/cover-search?keyword=${encodeURIComponent(keyword)}`),
  coverDownload: (url: string) =>
    post<{ success: boolean; path: string }>('/api/articles/cover-download', { url }),
  chat: (id: string, instruction: string, messages?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    post<ArticleContentResponse>(`/api/articles/${id}/chat`, { instruction, messages: messages?.length ? messages : undefined }),
};
