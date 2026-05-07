import { create } from 'zustand';
import type { Post, ScoreInfo, QueueItem, MaterialsData } from '../api/client';

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
  clearSelectedImages: () => void;

  // Materials
  materialsData: MaterialsData;
  matFilter: string;
  matSelected: Set<string>;
  setMaterialsData: (data: MaterialsData) => void;
  setMatFilter: (f: string) => void;
  matToggleSelect: (path: string) => void;
  matSelectAll: () => void;
  matClearSelection: () => void;

  // Queue
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;
}

const THEME_KEY = 'w2w-theme';

function getInitialTheme(): string {
  if (typeof window === 'undefined') return 'auto';
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function applyThemeVars(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

export const useStore = create<AppState>((set, get) => ({
  // Theme
  theme: getInitialTheme(),
  setTheme: (t) => {
    applyThemeVars(t);
    set({ theme: t });
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

  // Materials
  materialsData: { groups: [], total_images: 0 },
  matFilter: '',
  matSelected: new Set(),
  setMaterialsData: (data) => set({ materialsData: data }),
  setMatFilter: (f) => set({ matFilter: f }),
  matToggleSelect: (path) =>
    set((s) => {
      const next = new Set(s.matSelected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { matSelected: next };
    }),
  matSelectAll: () =>
    set((s) => {
      const all = new Set<string>();
      s.materialsData.groups.forEach((g) =>
        g.scenes.forEach((sc) =>
          sc.posts.forEach((p) => p.images.forEach((img) => all.add(img)))
        )
      );
      return { matSelected: all };
    }),
  matClearSelection: () => set({ matSelected: new Set() }),

  // Queue
  queue: [],
  setQueue: (q) => set({ queue: q }),
}));

// Apply initial theme
applyThemeVars(getInitialTheme());
