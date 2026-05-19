import { create } from 'zustand';
import type { Post, ScoreInfo, QueueItem, ArticleItem, InspirationTopic, MaterialsData, TreeNode, BrowseFolder, BrowseFile } from '../api/client';
import { settingsApi } from '../api/client';

/* ── Theme Presets ──────────────────────────── */
export interface ThemePreset {
  id: string;
  name: string;
  light: string;
  dark: string;
  hover: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'blue', name: '默认蓝', light: '#00a1d6', dark: '#4dc9f6', hover: '#0090c0' },
  { id: 'red', name: '小红书红', light: '#FF2442', dark: '#FF5C6E', hover: '#E62038' },
  { id: 'green', name: '清新绿', light: '#10B981', dark: '#34D399', hover: '#059669' },
  { id: 'github', name: 'GitHub 蓝', light: '#0969DA', dark: '#58A6FF', hover: '#0550AE' },
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

  // Progress overlay
  progress: { current: number; total: number; detail: string } | null;
  setProgress: (p: { current: number; total: number; detail: string } | null) => void;

  // Discovery
  discoveryPosts: Post[];
  selectedPosts: Set<number>;
  imageScores: Record<string, ScoreInfo>;
  selectedImages: string[];
  setDiscoveryPosts: (posts: Post[]) => void;
  togglePostSelect: (idx: number) => void;
  clearSelectedPosts: () => void;
  selectAllPosts: () => void;
  setImageScores: (scores: Record<string, ScoreInfo>) => void;
  toggleImageSelect: (path: string) => void;
  selectAllImages: (paths: string[]) => void;
  clearSelectedImages: () => void;

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
}

const THEME_KEY = 'w2w-theme';
const ACCENT_KEY = 'w2w-accent';

function getInitialTheme(): string {
  if (typeof window === 'undefined') return 'auto';
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return 'blue';
  return localStorage.getItem(ACCENT_KEY) || 'blue';
}

function applyAccentVars(accentId: string, theme: string) {
  const preset = THEME_PRESETS.find((p) => p.id === accentId) || THEME_PRESETS[0];
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const accent = isDark ? preset.dark : preset.light;
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hover', preset.hover);
  root.style.setProperty('--accent-solid', accent);
  root.style.setProperty('--accent-soft', accent + '14');
  root.style.setProperty('--accent-softer', accent + '0a');
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
    } catch { /* ignore */ }
  },

  // Toast
  toasts: [],
  addToast: (msg, type = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
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

  // Progress
  progress: null,
  setProgress: (p) => set({ progress: p }),

  // Discovery
  discoveryPosts: [],
  selectedPosts: new Set(),
  imageScores: {},
  selectedImages: [],
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
}));

// Apply initial theme
applyThemeVars(getInitialTheme());
