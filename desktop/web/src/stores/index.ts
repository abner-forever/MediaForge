import { create } from 'zustand';
import type { AppState } from './types';
import { createThemeSlice, applyThemeVars } from './themeSlice';
import { createUISlice } from './uiSlice';
import { createDiscoverySlice } from './discoverySlice';
import { createMaterialsSlice } from './materialsSlice';
import { createQueueSlice } from './queueSlice';
import { createArticlesSlice } from './articlesSlice';
import { createWechatSlice } from './wechatSlice';
import { createPipelineSlice } from './pipelineSlice';
import { createSidebarSlice } from './sidebarSlice';
import { createCreditsSlice } from './creditsSlice';
import { createUserSlice } from './userSlice';
import { settingsApi } from '../api/client';

export const useStore = create<AppState>()((...a) => ({
  ...createThemeSlice(...a),
  ...createUISlice(...a),
  ...createDiscoverySlice(...a),
  ...createMaterialsSlice(...a),
  ...createQueueSlice(...a),
  ...createArticlesSlice(...a),
  ...createWechatSlice(...a),
  ...createPipelineSlice(...a),
  ...createSidebarSlice(...a),
  ...createCreditsSlice(...a),
  ...createUserSlice(...a),
}));

// Re-export types and constants for backward compatibility
export { THEME_PRESETS } from './themeSlice';
export type { ThemePreset, ToastItem, LightboxState } from './types';

// Apply initial theme
applyThemeVars(localStorage.getItem('w2w-theme') || 'auto');
// Sync native window appearance (fire-and-forget, may not be available in browser dev mode)
settingsApi.setWindowAppearance(localStorage.getItem('w2w-theme') || 'auto').catch(() => {});
// 系统配色变化时重新应用主题（PyWebView 外观切换有延迟，matchMedia 触发后才准确）
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('w2w-theme') === 'auto') {
    applyThemeVars('auto');
  }
});
