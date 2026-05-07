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

export interface SettingsData {
  ai_provider: string;
  ai_model: string;
  ai_base_url: string;
  ai_api_key_set: boolean;
  ai_api_key_masked: string;
  weibo_cookie_set: boolean;
  weibo_uid: string;
  weibo_fetch_mode: string;
  weibo_celebrities: string;
  weibo_search_tags: string;
  weibo_scene_extra_tags: string;
  weibo_super_topics: string;
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

/* ── Dashboard API ────────────────────────────── */

export const dashboardApi = {
  health: () => get<HealthStatus>('/api/dashboard/health'),
  stats: () => get<DashboardStats>('/api/dashboard/stats'),
  runs: () => get<RunInfo[]>('/api/dashboard/runs'),
};

/* ── Settings API ─────────────────────────────── */

export const settingsApi = {
  get: () => get<SettingsData>('/api/settings'),
  save: (data: Record<string, string>) => post<{ success: boolean }>('/api/settings', data),
  getKey: () => get<{ key: string }>('/api/settings/api-key'),
};

/* ── Discovery API ────────────────────────────── */

export const discoveryApi = {
  get: () => get<{ posts: Post[] }>('/api/discovery'),
  search: (params: {
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
};

/* ── Publish Log SSE ──────────────────────────── */

export async function publishLogStream(
  onLog: (msg: string) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch('/api/publish-logs');
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
        const data = JSON.parse(line.slice(6));
        if (data.done) { onDone(); return; }
        if (data.msg) onLog(data.msg);
      } catch { /* ignore */ }
    }
  }
  onDone();
}

/* ── Queue API ────────────────────────────────── */

export const queueApi = {
  get: () => get<{ queue: QueueItem[] }>('/api/queue'),
  add: (item: Partial<QueueItem>) => post<{ success: boolean; queue: QueueItem[] }>('/api/queue', item),
  update: (index: number, data: Partial<QueueItem>) => put(`/api/queue/${index}`, data),
  remove: (index: number) => del(`/api/queue/${index}`),
  generate: (index: number) => post<{ success: boolean; title: string; desc: string }>(`/api/queue/${index}/generate`),
  publish: (index: number, opts: { dry_run?: boolean; save_draft?: boolean }) =>
    post<{ success: boolean; message: string }>(`/api/queue/${index}/publish`, opts),
  enqueueSelected: () => post<{ success: boolean; title: string; desc: string }>('/api/queue/enqueue-selected'),
};
