import type { StateCreator } from 'zustand';
import type { AppState, ThemePreset } from './types';
import { settingsApi } from '../api/client';

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'blue', name: '科技蓝', light: '#4e6fc2', dark: '#7b9ad6', hover: '#3d5da8' },
  { id: 'green', name: '清新绿', light: '#2e9e7a', dark: '#5cbe9e', hover: '#238464' },
  { id: 'purple', name: '创作紫', light: '#7868d0', dark: '#a599e0', hover: '#6354b8' },
  { id: 'orange', name: '暖阳橙', light: '#d4893a', dark: '#e0aa6a', hover: '#b87228' },
];

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

export { applyThemeVars, applyAccentVars, blendIntoDark };

export interface ThemeSlice {
  theme: string;
  setTheme: (t: string) => void;
  accentId: string;
  setAccentId: (id: string) => void;
  syncTheme: () => Promise<void>;
}

export const createThemeSlice: StateCreator<AppState, [], [], ThemeSlice> = (set, get) => ({
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
        localStorage.setItem('w2w-sidebar-open', String(v));
      }
      if (settings.sidebar_width !== undefined) {
        const w = parseInt(settings.sidebar_width, 10);
        if (!isNaN(w)) {
          set({ sidebarWidth: w });
          localStorage.setItem('w2w-sidebar-width', String(w));
        }
      }
    } catch { /* ignore */ }
    set({ sidebarWidthSynced: true });
  },
});
