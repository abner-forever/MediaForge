import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import { settingsApi } from '../api/client';

const SIDEBAR_KEY = 'w2w-sidebar-open';
const SIDEBAR_WIDTH_KEY = 'w2w-sidebar-width';

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

export interface SidebarSlice {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  sidebarWidthSynced: boolean;
  setSidebarWidth: (w: number) => void;
}

export const createSidebarSlice: StateCreator<AppState, [], [], SidebarSlice> = (set) => ({
  sidebarOpen: getInitialSidebarOpen(),
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    localStorage.setItem(SIDEBAR_KEY, String(open));
    settingsApi.save({ SIDEBAR_OPEN: String(open) }).catch(() => {});
  },
  sidebarWidth: getInitialSidebarWidth(),
  sidebarWidthSynced: false,
  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    settingsApi.save({ SIDEBAR_WIDTH: String(w) }).catch(() => {});
  },
});
