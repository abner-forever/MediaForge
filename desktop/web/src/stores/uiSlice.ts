import type { StateCreator } from 'zustand';
import type { AppState, ToastItem, LightboxState } from './types';
import { logsApi } from '../api/client';

let toastId = 0;

export interface UISlice {
  toasts: ToastItem[];
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: number) => void;

  lightbox: LightboxState | null;
  openLightbox: (images: string[], index: number, originals?: string[]) => void;
  closeLightbox: () => void;
  lightboxNav: (delta: number) => void;
  lightboxGoTo: (index: number) => void;

  progress: { current: number; total: number; detail: string } | null;
  setProgress: (p: { current: number; total: number; detail: string } | null) => void;

  activeTasks: Set<string>;
  registerTask: (name: string) => void;
  unregisterTask: (name: string) => void;
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
  toasts: [],
  addToast: (msg, type = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
    logsApi.logToast(msg, type).catch(() => {});
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

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

  progress: null,
  setProgress: (p) => set({ progress: p }),

  activeTasks: new Set(),
  registerTask: (name) => set((s) => {
    const next = new Set(s.activeTasks);
    next.add(name);
    return { activeTasks: next };
  }),
  unregisterTask: (name) => set((s) => {
    const next = new Set(s.activeTasks);
    next.delete(name);
    return { activeTasks: next };
  }),
});
