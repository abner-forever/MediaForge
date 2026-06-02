/* ── 文章类型 ──────────────────────────────────── */

export interface ArticleItem {
  id: string;
  title: string;
  content: string;
  summary: string;
  cover: string;
  images: string[];
  tags: string[];
  celebrity?: string;
  source?: string;
  ai_generated: boolean;
  status: 'draft' | 'reviewing' | 'queued' | 'saved_to_wechat' | 'published' | 'failed';
  account_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  contentUpdated?: boolean;
}

export interface InspirationTopic {
  text: string;
  source: string;
  celebrity?: string;
  screen_name?: string;
}

export interface ArticleListResponse {
  articles: ArticleItem[];
}

export interface ArticleResponse {
  article: ArticleItem;
}

export interface ArticleContentResponse {
  success: boolean;
  content?: string;
  title?: string;
}

export interface TitleCandidate {
  type: string;
  title: string;
}

export interface InspirationResponse {
  topics: InspirationTopic[];
}

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'message'; content: string }
  | { type: 'content'; content: string }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };
