/* ── API Client ─────────────────────────────── */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b);
const put = <T>(p: string, b?: unknown) => request<T>('PUT', p, b);
const del = <T>(p: string, b?: unknown) => request<T>('DELETE', p, b);

/* ── Types ───────────────────────────────────── */

export interface HealthStatus {
  platform: string;
  platform_name: string;
  platform_auth: boolean;
  weibo_cookie: boolean;
  weibo_uid_or_celebrities: boolean;
  ai_api_key: boolean;
  ai_base_url: boolean;
}

export interface DashboardStats {
  local_images: number;
  queue_size: number;
  selected_count: number;
  discovery_count: number;
}

export interface RunInfo {
  run_id: string;
  status: string;
  processed: number;
  failed: number;
  payload: Record<string, unknown>;
}

export interface Post {
  id?: string | number;
  celebrity: string;
  scene: string;
  text?: string;
  images: string[];
  local_images?: string[];
  dropped_count?: number;
  screen_name?: string;
  created_at?: string;
}

export interface ScoreInfo {
  score: number;
  reason: string;
  method: string;
}

export interface DiscoveryResult {
  success: boolean;
  posts: Post[];
  total_posts: number;
  total_images: number;
}

export interface QueueItem {
  title: string;
  desc: string;
  images: string[];
  cover: string;
  celebrity?: string;
  publish_logs?: string[];
  status?: 'saved' | 'published';
  time?: string;
  /** 文章类型队列项 */
  type?: 'image' | 'article';
  article_id?: string;
  content?: string;
  tags?: string[];
  account_id?: string;
}

export interface MaterialsGroup {
  celebrity: string;
  scenes: {
    scene: string;
    posts: { post_id: string; images: string[] }[];
    total: number;
  }[];
  total: number;
}

export interface MaterialsData {
  groups: MaterialsGroup[];
  total_images: number;
}

/* ── 文件夹管理类型 ─────────────────────────── */

export interface TreeNode {
  name: string;
  path: string;
  type: 'folder';
  item_count: number;
  children: TreeNode[];
}

export interface BrowseFolder {
  name: string;
  path: string;
  type: 'folder';
  item_count: number;
}

export interface BrowseFile {
  name: string;
  path: string;
  type: 'file';
  size: number;
}

export interface BrowseResult {
  folders: BrowseFolder[];
  files: BrowseFile[];
  breadcrumb: { name: string; path: string }[];
}

export interface TreeResult {
  tree: TreeNode[];
}

export interface SettingsData {
  platform: string;
  ai_provider: string;
  ai_model: string;
  ai_base_url: string;
  ai_api_key_set: boolean;
  ai_api_key_masked: string;
  ai_api_keys: Record<string, string>;
  weibo_cookie_set: boolean;
  weibo_cookie: string;
  weibo_uid: string;
  weibo_screen_name: string;
  weibo_avatar: string;
  weibo_fetch_mode: string;
  weibo_celebrities: string;
  weibo_search_tags: string;
  weibo_scene_extra_tags: string;
  weibo_super_topics: string;
  toutiao_cookie_set: boolean;
  toutiao_user_id: string;
  toutiao_fetch_mode: string;
  toutiao_search_tags: string;
  post_limit: number;
  weibo_pages: number;
  publish_interval: number;
  request_timeout: number;
  retry_times: number;
  require_confirm: boolean;
  watermark_filter: boolean;
  watermark_strict_mode: boolean;
  min_clean_images: number;
  watermark_corner_ratio: number;
  watermark_bottom_ratio: number;
  allow_watermark_fallback: boolean;
  materials_path: string;
  download_dir: string;
  wechat_accounts: WeChatAccount[];
}

export interface OperationItem {
  id: string;
  time: string;
  action: string;
  detail: string;
}

export interface OperationsResponse {
  items: OperationItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface DownloadStreamEvent {
  type: 'start' | 'progress' | 'done';
  total?: number;
  current?: number;
  celebrity?: string;
  scene?: string;
  downloaded?: number;
  dropped?: number;
}

export interface SearchStreamEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  total_posts?: number;
  total_images?: number;
}

export interface WeiboLoginEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
  cookie?: string;
  uid?: string;
  screen_name?: string;
  avatar?: string;
}

export interface WeiboVerifyResult {
  valid: boolean;
  uid?: string;
  screen_name?: string;
  avatar?: string;
  message?: string;
}

export interface PlatformMeta {
  id: string;
  name: string;
  auth_fields: string[];
  fetch_modes: Record<string, string>;
  default_fetch_mode: string;
  search_params_description: string;
}

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
  status: 'draft' | 'queued' | 'published';
  created_at: string;
  updated_at: string;
}

export interface InspirationTopic {
  text: string;
  source: string;
  celebrity?: string;
  screen_name?: string;
}

export interface CoverImage {
  path: string;
  name: string;
  source: 'local' | 'web';
  celebrity: string;
}

/* ── Platform API ─────────────────────────────── */

export const platformApi = {
  list: () => get<{ platforms: Record<string, PlatformMeta>; default: string }>('/api/platforms'),
};

/* ── WeChat Account API ──────────────────────────── */

export interface WeChatAccount {
  account_id: string;
  name: string;
  created_at?: string;
  last_used?: string;
  logged_in: boolean;
  is_default?: boolean;
}

export interface WeChatLoginEvent {
  type: 'progress' | 'done' | 'error';
  message?: string;
}

export const wechatAccountApi = {
  list: () => get<{ accounts: WeChatAccount[] }>('/api/wechat/accounts'),
  add: (name: string) => post<{ success: boolean; account: WeChatAccount }>('/api/wechat/accounts', { name }),
  remove: (id: string) => del<{ success: boolean }>(`/api/wechat/accounts/${id}`),
  status: (id: string) => get<{ logged_in: boolean; name: string }>(`/api/wechat/accounts/${id}/status`),
  logout: (id: string) => post<{ success: boolean }>(`/api/wechat/accounts/${id}/logout`),
  setDefault: (id: string) => post<{ success: boolean }>(`/api/wechat/accounts/${id}/default`),
  login: (id: string, onEvent: (evt: WeChatLoginEvent) => void): Promise<void> => {
    return fetch(`/api/wechat/accounts/${id}/login`).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch { /* ignore */ }
        }
      }
    });
  },
};

/* ── Dashboard API ────────────────────────────── */

export const dashboardApi = {
  health: () => get<HealthStatus>('/api/dashboard/health'),
  stats: () => get<DashboardStats>('/api/dashboard/stats'),
  runs: () => get<RunInfo[]>('/api/dashboard/runs'),
  operations: (page = 1, pageSize = 10) => get<OperationsResponse>(`/api/dashboard/operations?page=${page}&page_size=${pageSize}`),
  deleteOperations: (ids: string[]) => post<{ success: boolean; deleted: number }>('/api/dashboard/operations/delete', { ids }),
  clearOperations: () => post<{ success: boolean; deleted: number }>('/api/dashboard/operations/delete', { clear: true }),
};

/* ── Settings API ─────────────────────────────── */

export const settingsApi = {
  get: () => get<SettingsData>('/api/settings'),
  save: (data: Record<string, string>) => post<{ success: boolean }>('/api/settings', data),
  getKey: (provider?: string) => get<{ key: string }>(`/api/settings/api-key${provider ? `?provider=${provider}` : ''}`),
  getTheme: () => get<{ theme: string; accent: string }>('/api/settings/theme'),
  testAiConnection: (params: { provider?: string; model?: string; base_url?: string; api_key?: string }) =>
    post<{ success: boolean; message: string }>('/api/settings/ai-test', params),
  verifyWeibo: (cookie?: string) => post<WeiboVerifyResult>('/api/settings/weibo-verify', { cookie }),
  clearWeibo: () => post<{ success: boolean }>('/api/settings/weibo-clear'),
  weiboLogin: (onEvent: (evt: WeiboLoginEvent) => void): Promise<void> => {
    return fetch('/api/settings/weibo-login-stream').then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch { /* ignore */ }
        }
      }
    });
  },
};

/* ── Discovery API ────────────────────────────── */

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
};

/* ── Discovery SSE Download ───────────────────── */

export async function downloadStream(
  indices: string,
  onEvent: (evt: DownloadStreamEvent) => void,
  filterWatermark?: boolean,
): Promise<void> {
  let url = `/api/discovery/download-stream?indices=${encodeURIComponent(indices)}`;
  if (filterWatermark !== undefined) url += `&filter_watermark=${filterWatermark}`;
  const res = await fetch(url);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* ignore */ }
    }
  }
}

/* ── Search SSE Stream ────────────────────────── */

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
  const res = await fetch(`/api/discovery/search-stream?${q}`, { signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* ignore */ }
    }
  }
}

/* ── Selection API ────────────────────────────── */

export const selectionApi = {
  get: () => get<{ selected: string[]; scores: Record<string, ScoreInfo> }>('/api/selection'),
  add: (path: string) => post('/api/selection/add', { path }),
  remove: (path: string) => post('/api/selection/remove', { path }),
  clear: () => post('/api/selection/clear'),
};

/* ── Materials API ────────────────────────────── */

export const materialsApi = {
  list: () => get<MaterialsData>('/api/materials'),
  delete: (paths: string[]) => del<{ success: boolean; deleted: number }>('/api/materials', { paths }),

  // 文件夹管理
  tree: () => get<TreeResult>('/api/materials/tree'),
  browse: (path: string) => get<BrowseResult>(`/api/materials/browse?path=${encodeURIComponent(path)}`),
  createFolder: (parentPath: string, name: string) =>
    post<{ success: boolean; path: string }>('/api/materials/folder', { parent_path: parentPath, name }),
  renameFolder: (path: string, newName: string) =>
    put<{ success: boolean; path: string }>('/api/materials/folder', { path, new_name: newName }),
  deleteFolder: (path: string) => del<{ success: boolean }>(`/api/materials/folder?path=${encodeURIComponent(path)}`),
  moveItems: (items: string[], destination: string) =>
    post<{ success: boolean; moved: number }>('/api/materials/move', { items, destination }),
};

/* ── Publish Log Polling ──────────────────────── */

export interface PublishLogsResponse {
  logs: string[];
  total: number;
  active: boolean;
}

export const publishLogsApi = {
  get: (after = 0) => get<PublishLogsResponse>(`/api/publish-logs?after=${after}`),
};

/* ── Queue API ────────────────────────────────── */

export const queueApi = {
  get: () => get<{ queue: QueueItem[] }>('/api/queue'),
  add: (item: Partial<QueueItem>) => post<{ success: boolean; queue: QueueItem[] }>('/api/queue', item),
  update: (index: number, data: Partial<QueueItem>) => put(`/api/queue/${index}`, data),
  remove: (index: number) => del(`/api/queue/${index}`),
  generate: (index: number) => post<{ success: boolean; title: string; desc: string; message?: string }>(`/api/queue/${index}/generate`),
  publish: (index: number, opts: { dry_run?: boolean; save_draft?: boolean; account_id?: string }) =>
    post<{ success: boolean; message: string }>(`/api/queue/${index}/publish`, opts),
  enqueueSelected: (images?: string[]) => post<{ success: boolean; title: string; desc: string }>('/api/queue/enqueue-selected', { images }),
};

/* ── Article API ────────────────────────────────── */

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

export interface InspirationResponse {
  topics: InspirationTopic[];
}

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
  generate: (id: string, params: { topic?: string; title?: string }) =>
    post<ArticleContentResponse>(`/api/articles/${id}/generate`, params),
  polish: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/polish`),
  deAi: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/de-ai`),
  generateTitle: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/generate-title`),
  optimizeLayout: (id: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/optimize-layout`),
  publish: (id: string, opts: { save_draft?: boolean; dry_run?: boolean; account_id?: string }) =>
    post<{ success: boolean; message: string }>(`/api/articles/${id}/publish`, opts),
  addToQueue: (id: string) =>
    post<{ success: boolean; queue: QueueItem[] }>(`/api/articles/${id}/queue`),
  inspiration: (keyword: string) =>
    get<InspirationResponse>(`/api/articles/inspiration?keyword=${encodeURIComponent(keyword)}`),
  coverSearch: (keyword: string) =>
    get<{ images: CoverImage[] }>(`/api/articles/cover-search?keyword=${encodeURIComponent(keyword)}`),
  coverDownload: (url: string) =>
    post<{ success: boolean; path: string }>('/api/articles/cover-download', { url }),
  chat: (id: string, instruction: string) =>
    post<ArticleContentResponse>(`/api/articles/${id}/chat`, { instruction }),
};
