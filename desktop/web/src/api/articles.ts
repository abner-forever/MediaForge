import { get, post, put, del } from './base';
import { ssePost } from './sse';
import type {
  ArticleItem,
  ArticleListResponse,
  ArticleResponse,
  ArticleContentResponse,
  TitleCandidate,
  QueueItem,
  InspirationResponse,
  CoverImage,
  ChatStreamEvent,
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
  saveToMaterials: (id: string) =>
    post<{ success: boolean; path: string; cover_path?: string }>(
      `/api/articles/${id}/save-to-materials`,
    ),
  generate: (
    id: string,
    params: {
      topic?: string;
      title?: string;
      article_type?: string;
      tone?: string;
      word_count?: string;
      with_subtitles?: boolean;
      gallery_friendly?: boolean;
      template_prompt?: string;
    },
  ) => post<ArticleContentResponse>(`/api/articles/${id}/generate`, params),
  polish: (id: string) => post<ArticleContentResponse>(`/api/articles/${id}/polish`),
  deAi: (id: string) => post<ArticleContentResponse>(`/api/articles/${id}/de-ai`),
  generateTitle: (id: string) => post<ArticleContentResponse>(`/api/articles/${id}/generate-title`),
  titleCandidates: (id: string) =>
    post<{ success: boolean; candidates: TitleCandidate[] }>(
      `/api/articles/${id}/title-candidates`,
    ),
  optimizeLayout: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/optimize-layout`),
  publish: (id: string, opts: { save_draft?: boolean; dry_run?: boolean; account_id?: string }) =>
    post<{ success: boolean; started?: boolean; message: string }>(
      `/api/articles/${id}/publish`,
      opts,
    ),
  addToQueue: (id: string) =>
    post<{ success: boolean; queue: QueueItem[] }>(`/api/articles/${id}/queue`),
  inspiration: (keyword: string) =>
    get<InspirationResponse>(`/api/articles/inspiration?keyword=${encodeURIComponent(keyword)}`),
  coverSearch: (keyword: string) =>
    get<{ images: CoverImage[] }>(
      `/api/articles/cover-search?keyword=${encodeURIComponent(keyword)}`,
    ),
  coverDownload: (url: string) =>
    post<{ success: boolean; path: string }>('/api/articles/cover-download', { url }),
  chat: (
    id: string,
    instruction: string,
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks?: {
      onMessage?: (token: string) => void;
      onContent?: (token: string) => void;
    },
    signal?: AbortSignal,
    writeMode?: boolean,
  ): Promise<{ content: string }> =>
    ssePost<ChatStreamEvent, { content: string }>(
      `/api/articles/${id}/chat`,
      {
        instruction,
        messages: messages?.length ? messages : undefined,
        write_mode: writeMode ?? true,
      },
      (evt) => {
        if (evt.type === 'message' && callbacks?.onMessage) {
          callbacks.onMessage(evt.content);
        }
        if (evt.type === 'content' && callbacks?.onContent) {
          callbacks.onContent(evt.content);
        }
        if (evt.type === 'token' && callbacks?.onMessage) {
          callbacks.onMessage(evt.content);
        }
      },
      {
        signal,
        extractResult: (evt) => {
          if (evt.type === 'done' && evt.content) {
            return { content: evt.content };
          }
          return null;
        },
      },
    ),
};
