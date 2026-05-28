import { create } from 'zustand';
import type { Post, ScoreInfo, QueueItem, ArticleItem, InspirationTopic, MaterialsData, TreeNode, BrowseFolder, BrowseFile, PipelineEvent, PipelineSummary } from '../api/client';
import { settingsApi, logsApi } from '../api/client';

/* ── Theme Presets ──────────────────────────── */
export interface ThemePreset {
  id: string;
  name: string;
  light: string;
  dark: string;
  hover: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'blue', name: '科技蓝', light: '#4e6fc2', dark: '#7b9ad6', hover: '#3d5da8' },
  { id: 'green', name: '清新绿', light: '#2e9e7a', dark: '#5cbe9e', hover: '#238464' },
  { id: 'purple', name: '创作紫', light: '#7868d0', dark: '#a599e0', hover: '#6354b8' },
  { id: 'orange', name: '暖阳橙', light: '#d4893a', dark: '#e0aa6a', hover: '#b87228' },
];

/* ── Toast ───────────────────────────────────── */
export interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'success' | 'error';
}

/* ── Lightbox ────────────────────────────────── */
export interface LightboxState {
  images: string[];
  index: number;
  originals?: string[];
}

/* ── App Store ───────────────────────────────── */

let toastId = 0;

interface AppState {
  // Theme
  theme: string;
  setTheme: (t: string) => void;
  accentId: string;
  setAccentId: (id: string) => void;
  syncTheme: () => Promise<void>;

  // Toast
  toasts: ToastItem[];
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: number) => void;

  // Lightbox
  lightbox: LightboxState | null;
  openLightbox: (images: string[], index: number, originals?: string[]) => void;
  closeLightbox: () => void;
  lightboxNav: (delta: number) => void;
  lightboxGoTo: (index: number) => void;

  // Progress overlay
  progress: { current: number; total: number; detail: string } | null;
  setProgress: (p: { current: number; total: number; detail: string } | null) => void;

  // Discovery
  discoveryPosts: Post[];
  selectedPosts: Set<number>;
  imageScores: Record<string, ScoreInfo>;
  selectedImages: string[];
  discoveryCelebs: string;
  discoveryTags: string;
  discoverySuperTopics: string;
  discoveryToutiaoKeywords: string;
  setDiscoveryPosts: (posts: Post[]) => void;
  togglePostSelect: (idx: number) => void;
  clearSelectedPosts: () => void;
  selectAllPosts: () => void;
  setImageScores: (scores: Record<string, ScoreInfo>) => void;
  toggleImageSelect: (path: string) => void;
  selectAllImages: (paths: string[]) => void;
  clearSelectedImages: () => void;
  setDiscoveryCelebs: (v: string) => void;
  setDiscoveryTags: (v: string) => void;
  setDiscoverySuperTopics: (v: string) => void;
  setDiscoveryToutiaoKeywords: (v: string) => void;

  // Materials — 文件夹管理模式
  folderTree: TreeNode[];
  currentPath: string;
  currentFolders: BrowseFolder[];
  currentFiles: BrowseFile[];
  breadcrumb: { name: string; path: string }[];
  expandedFolders: Set<string>;
  matSelected: Set<string>;
  viewMode: 'grid' | 'list';
  setFolderTree: (tree: TreeNode[]) => void;
  setCurrentPath: (path: string) => void;
  setCurrentFolders: (folders: BrowseFolder[]) => void;
  setCurrentFiles: (files: BrowseFile[]) => void;
  setBreadcrumb: (items: { name: string; path: string }[]) => void;
  toggleFolderExpanded: (path: string) => void;
  matToggleSelect: (path: string) => void;
  matSelectAll: (paths: string[]) => void;
  matSetSelection: (paths: string[]) => void;
  matClearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;

  // Queue
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;

  // Articles
  articles: ArticleItem[];
  currentArticle: ArticleItem | null;
  articleFilter: 'all' | 'draft' | 'queued' | 'published';
  inspirationResults: InspirationTopic[];
  setArticles: (articles: ArticleItem[]) => void;
  setCurrentArticle: (article: ArticleItem | null) => void;
  setArticleFilter: (filter: 'all' | 'draft' | 'queued' | 'published') => void;
  setInspirationResults: (results: InspirationTopic[]) => void;

  // WeChat sidebar sync
  wechatRefreshKey: number;
  incWechatRefreshKey: () => void;

  // AI Recommended Celebrities (cached)
  recommendedCelebs: string[];
  setRecommendedCelebs: (celebs: string[]) => void;

  // Pipeline running state (global, persists across page navigation)
  pipelineRunning: boolean;
  setPipelineRunning: (running: boolean) => void;

  // Pipeline SSE state (persists across page navigation)
  pipelineEvents: PipelineEvent[];
  pipelineCurrentStep: string | null;
  pipelineStepProgress: { current: number; total: number } | null;
  pipelineSummary: PipelineSummary | null;
  pipelineError: string | null;
  pipelineCheckpoint: {
    message: string;
    runId: string;
    items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }>;
  } | null;
  pipelineDecisionReq: {
    message: string;
    runId: string;
    options: Array<{ id: string; label: string }>;
    context?: Record<string, unknown>;
  } | null;
  // AbortController stored globally so cancel works across page navigations
  pipelineAbortController: AbortController | null;
  setPipelineAbortController: (controller: AbortController | null) => void;
  setPipelineEvents: (events: PipelineEvent[]) => void;
  addPipelineEvent: (evt: PipelineEvent) => void;
  setPipelineCurrentStep: (step: string | null) => void;
  setPipelineStepProgress: (progress: { current: number; total: number } | null) => void;
  setPipelineSummary: (summary: PipelineSummary | null) => void;
  setPipelineError: (error: string | null) => void;
  setPipelineCheckpoint: (checkpoint: { message: string; runId: string; items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }> } | null) => void;
  setPipelineDecisionReq: (req: { message: string; runId: string; options: Array<{ id: string; label: string }>; context?: Record<string, unknown> } | null) => void;
  resetPipelineState: () => void;

  // Article sidebar state (persisted)
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Sidebar width (persisted)
  sidebarWidth: number;
  sidebarWidthSynced: boolean;
  setSidebarWidth: (w: number) => void;
}

const THEME_KEY = 'w2w-theme';
const ACCENT_KEY = 'w2w-accent';
const SIDEBAR_KEY = 'w2w-sidebar-open';
const SIDEBAR_WIDTH_KEY = 'w2w-sidebar-width';

function getInitialTheme(): string {
  if (typeof window === 'undefined') return 'auto';
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return 'blue';
  return localStorage.getItem(ACCENT_KEY) || 'blue';
}

function getInitialSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(SIDEBAR_KEY);
  return v === null ? true : v === 'true';
}

function getInitialSidebarWidth(): number {
  if (typeof window === 'undefined') return 240;
  try {
    const v = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (v) {
      const w = parseInt(v, 10);
      if (!isNaN(w)) return w;
    }
  } catch {}
  return 240;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

/** Blend a foreground hex color into a dark background at `amount` (0-1). */
function blendIntoDark(hex: string, amount: number, bg = '#0c0d14') {
  const fg = hexToRgb(hex);
  const bgRgb = hexToRgb(bg);
  if (!fg || !bgRgb) return bg;
  return `rgb(${[
    Math.round(bgRgb.r + (fg.r - bgRgb.r) * amount),
    Math.round(bgRgb.g + (fg.g - bgRgb.g) * amount),
    Math.round(bgRgb.b + (fg.b - bgRgb.b) * amount),
  ].join(',')})`;
}

const ACCENT_GRADIENTS: Record<string, string> = {
  blue: 'linear-gradient(135deg, #4e6fc2, #6078c8)',
  green: 'linear-gradient(135deg, #2e9e7a, #48a89a)',
  purple: 'linear-gradient(135deg, #7868d0, #a078d0)',
  orange: 'linear-gradient(135deg, #d4893a, #c8a050)',
};

function applyAccentVars(accentId: string, theme: string) {
  const preset = THEME_PRESETS.find((p) => p.id === accentId) || THEME_PRESETS[0];
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const accent = isDark ? preset.dark : preset.light;
  const gradient = ACCENT_GRADIENTS[accentId] || ACCENT_GRADIENTS.purple;
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hover', preset.hover);
  root.style.setProperty('--accent-solid', accent);
  root.style.setProperty('--accent-soft', accent + '18');
  root.style.setProperty('--accent-softer', accent + '0a');
  root.style.setProperty('--accent-gradient', gradient);
  if (isDark) {
    root.style.setProperty('--bg-sidebar', '#12131c');
    root.style.setProperty('--sidebar-hover', '#1e2030');
    root.style.setProperty('--sidebar-text', '#e2e8f0');
    root.style.setProperty('--sidebar-text-secondary', '#94a3b8');
    root.style.setProperty('--sidebar-text-muted', '#64748b');
    root.style.setProperty('--sidebar-text-logo', '#f1f5f9');
    root.style.setProperty('--sidebar-border', 'rgba(255,255,255,0.06)');
    root.style.setProperty('--status-ok', '#34d399');
    root.style.setProperty('--status-error', '#fca5a5');
  } else {
    root.style.setProperty('--bg-sidebar', '#f0f1f6');
    root.style.setProperty('--sidebar-hover', '#e4e6ee');
    root.style.setProperty('--sidebar-text', '#1e293b');
    root.style.setProperty('--sidebar-text-secondary', '#64748b');
    root.style.setProperty('--sidebar-text-muted', '#94a3b8');
    root.style.setProperty('--sidebar-text-logo', '#0f172a');
    root.style.setProperty('--sidebar-border', 'rgba(0,0,0,0.06)');
    root.style.setProperty('--status-ok', '#10b981');
    root.style.setProperty('--status-error', '#ef4444');
  }
  localStorage.setItem(ACCENT_KEY, accentId);
}

function applyThemeVars(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  applyAccentVars(getInitialAccent(), theme);
}

export const useStore = create<AppState>((set, get) => ({
  // Theme
  theme: getInitialTheme(),
  setTheme: (t) => {
    applyThemeVars(t);
    set({ theme: t });
    settingsApi.save({ APP_THEME: t }).catch(() => {});
    settingsApi.setWindowAppearance(t).catch(() => {});
  },
  accentId: getInitialAccent(),
  setAccentId: (id) => {
    applyAccentVars(id, get().theme);
    set({ accentId: id });
    settingsApi.save({ APP_ACCENT: id }).catch(() => {});
  },
  syncTheme: async () => {
    try {
      const { theme, accent } = await settingsApi.getTheme();
      if (theme) { applyThemeVars(theme); set({ theme }); }
      if (accent) { applyAccentVars(accent, theme || get().theme); set({ accentId: accent }); }
      settingsApi.setWindowAppearance(theme || get().theme).catch(() => {});
    } catch { /* ignore */ }
    // Sync sidebar state from backend
    try {
      const settings = await settingsApi.get();
      if (settings.sidebar_open !== undefined) {
        const v = String(settings.sidebar_open) === 'true';
        set({ sidebarOpen: v });
        localStorage.setItem(SIDEBAR_KEY, String(v));
      }
      if (settings.sidebar_width !== undefined) {
        const w = parseInt(settings.sidebar_width, 10);
        if (!isNaN(w)) {
          set({ sidebarWidth: w });
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        }
      }
    } catch { /* ignore */ }
    set({ sidebarWidthSynced: true });
  },

  // Toast
  toasts: [],
  addToast: (msg, type = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
    // 将 toast 写入 app.log（静默失败）
    logsApi.logToast(msg, type).catch(() => {});
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // Lightbox
  lightbox: null,
  openLightbox: (images, index, originals) =>
    set({ lightbox: { images, index, originals: originals || images } }),
  closeLightbox: () => set({ lightbox: null }),
  lightboxNav: (delta) => {
    const lb = get().lightbox;
    if (!lb) return;
    const total = lb.images.length;
    const newIdx = (lb.index + delta + total) % total;
    set({ lightbox: { ...lb, index: newIdx } });
  },
  lightboxGoTo: (index) => {
    const lb = get().lightbox;
    if (!lb || index < 0 || index >= lb.images.length) return;
    set({ lightbox: { ...lb, index } });
  },

  // Progress
  progress: null,
  setProgress: (p) => set({ progress: p }),

  // Discovery
  discoveryPosts: [],
  selectedPosts: new Set(),
  imageScores: {},
  selectedImages: [],
  discoveryCelebs: '',
  discoveryTags: '',
  discoverySuperTopics: '',
  discoveryToutiaoKeywords: '',
  setDiscoveryPosts: (posts) => set({ discoveryPosts: posts }),
  togglePostSelect: (idx) =>
    set((s) => {
      const next = new Set(s.selectedPosts);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { selectedPosts: next };
    }),
  clearSelectedPosts: () => set({ selectedPosts: new Set() }),
  selectAllPosts: () =>
    set((s) => {
      const all = s.discoveryPosts.map((_, i) => i);
      const isAll = s.selectedPosts.size === all.length;
      return { selectedPosts: isAll ? new Set() : new Set(all) };
    }),
  setImageScores: (scores) => set({ imageScores: scores }),
  toggleImageSelect: (path) =>
    set((s) => {
      const idx = s.selectedImages.indexOf(path);
      if (idx >= 0) {
        const next = [...s.selectedImages];
        next.splice(idx, 1);
        return { selectedImages: next };
      }
      return { selectedImages: [...s.selectedImages, path] };
    }),
  clearSelectedImages: () => set({ selectedImages: [] }),
  selectAllImages: (paths: string[]) =>
    set((s) => {
      const isAll = s.selectedImages.length === paths.length && paths.every((p) => s.selectedImages.includes(p));
      return { selectedImages: isAll ? [] : [...paths] };
    }),
  setDiscoveryCelebs: (v) => set({ discoveryCelebs: v }),
  setDiscoveryTags: (v) => set({ discoveryTags: v }),
  setDiscoverySuperTopics: (v) => set({ discoverySuperTopics: v }),
  setDiscoveryToutiaoKeywords: (v) => set({ discoveryToutiaoKeywords: v }),

  // Materials — 文件夹管理模式
  folderTree: [],
  currentPath: '',
  currentFolders: [],
  currentFiles: [],
  breadcrumb: [{ name: '全部素材', path: '' }],
  expandedFolders: new Set(),
  matSelected: new Set(),
  viewMode: 'grid',
  setFolderTree: (tree) => set({ folderTree: tree }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setCurrentFolders: (folders) => set({ currentFolders: folders }),
  setCurrentFiles: (files) => set({ currentFiles: files }),
  setBreadcrumb: (items) => set({ breadcrumb: items }),
  toggleFolderExpanded: (path) =>
    set((s) => {
      const next = new Set(s.expandedFolders);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedFolders: next };
    }),
  matToggleSelect: (path) =>
    set((s) => {
      const next = new Set(s.matSelected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { matSelected: next };
    }),
  matSelectAll: (paths) =>
    set((s) => {
      const all = new Set(paths);
      const isAll = s.matSelected.size === all.size && [...all].every((p) => s.matSelected.has(p));
      return { matSelected: isAll ? new Set() : all };
    }),
  matSetSelection: (paths) => set({ matSelected: new Set(paths) }),
  matClearSelection: () => set({ matSelected: new Set() }),
  setViewMode: (mode) => set({ viewMode: mode }),

  // Queue
  queue: [],
  setQueue: (q) => set({ queue: q }),

  // Articles
  articles: [],
  currentArticle: null,
  articleFilter: 'all',
  inspirationResults: [],
  setArticles: (articles) => set({ articles }),
  setCurrentArticle: (article) => set({ currentArticle: article }),
  setArticleFilter: (filter) => set({ articleFilter: filter }),
  setInspirationResults: (results) => set({ inspirationResults: results }),

  // WeChat sidebar sync
  wechatRefreshKey: 0,
  incWechatRefreshKey: () => set((s) => ({ wechatRefreshKey: s.wechatRefreshKey + 1 })),

  // AI Recommended Celebrities (cached)
  recommendedCelebs: [],
  setRecommendedCelebs: (celebs) => set({ recommendedCelebs: celebs }),

  // Pipeline running state
  pipelineRunning: false,
  setPipelineRunning: (running) => set({ pipelineRunning: running }),

  // Pipeline SSE state
  pipelineEvents: [],
  pipelineCurrentStep: null,
  pipelineStepProgress: null,
  pipelineSummary: null,
  pipelineError: null,
  pipelineCheckpoint: null,
  pipelineDecisionReq: null,
  pipelineAbortController: null,
  setPipelineAbortController: (controller) => set({ pipelineAbortController: controller }),
  setPipelineEvents: (events) => set({ pipelineEvents: events }),
  addPipelineEvent: (evt) => set((s) => ({ pipelineEvents: [...s.pipelineEvents, evt] })),
  setPipelineCurrentStep: (step) => set({ pipelineCurrentStep: step }),
  setPipelineStepProgress: (progress) => set({ pipelineStepProgress: progress }),
  setPipelineSummary: (summary) => set({ pipelineSummary: summary }),
  setPipelineError: (error) => set({ pipelineError: error }),
  setPipelineCheckpoint: (checkpoint) => set({ pipelineCheckpoint: checkpoint }),
  setPipelineDecisionReq: (req) => set({ pipelineDecisionReq: req }),
  resetPipelineState: () => {
    const controller = get().pipelineAbortController;
    if (controller) {
      controller.abort();
    }
    set({
      pipelineRunning: false,
      pipelineEvents: [],
      pipelineCurrentStep: null,
      pipelineStepProgress: null,
      pipelineSummary: null,
      pipelineError: null,
      pipelineCheckpoint: null,
      pipelineDecisionReq: null,
      pipelineAbortController: null,
    });
  },

  // Article sidebar state (persisted)
  sidebarOpen: getInitialSidebarOpen(),
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    localStorage.setItem(SIDEBAR_KEY, String(open));
    settingsApi.save({ SIDEBAR_OPEN: String(open) }).catch(() => {});
  },

  // Sidebar width (persisted)
  sidebarWidth: getInitialSidebarWidth(),
  sidebarWidthSynced: false,
  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    settingsApi.save({ SIDEBAR_WIDTH: String(w) }).catch(() => {});
  },
}));

// Apply initial theme
applyThemeVars(getInitialTheme());
// Sync native window appearance (fire-and-forget, may not be available in browser dev mode)
fetch('/api/theme/window-native', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: getInitialTheme() }),
}).catch(() => {});
