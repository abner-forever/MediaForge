import { get, post } from './base';
import { sseGet } from './sse';
import type {
  SettingsData,
  WeiboLoginEvent,
  WeiboVerifyResult,
  ToutiaoLoginEvent,
  ToutiaoVerifyResult,
} from '../types';

export const settingsApi = {
  get: () => get<SettingsData>('/api/settings'),
  save: (data: Record<string, string>) => post<{ success: boolean }>('/api/settings', data),
  getKey: (provider?: string) =>
    get<{ key: string }>(`/api/settings/api-key${provider ? `?provider=${provider}` : ''}`),
  getTheme: () => get<{ theme: string; accent: string }>('/api/settings/theme'),
  setWindowAppearance: (theme: string) =>
    post<{ success: boolean }>('/api/theme/window-native', { theme }),
  testAiConnection: (params: {
    provider?: string;
    model?: string;
    base_url?: string;
    api_key?: string;
  }) =>
    post<{
      success: boolean;
      message: string;
      errors?: { url: string; status?: number; summary: string; detail: string }[];
    }>('/api/settings/ai-test', params),
  aiBalance: (params: { provider?: string; base_url?: string; api_key?: string }) =>
    post<{ success: boolean; balance: unknown; message?: string }>(
      '/api/settings/ai-balance',
      params,
    ),
  verifyWeibo: (cookie?: string) =>
    post<WeiboVerifyResult>('/api/settings/weibo-verify', { cookie }),
  clearWeibo: () => post<{ success: boolean }>('/api/settings/weibo-clear'),
  weiboLogin: (onEvent: (evt: WeiboLoginEvent) => void): Promise<void> => {
    return sseGet<WeiboLoginEvent>('/api/settings/weibo-login-stream', onEvent);
  },
  verifyToutiao: (cookie?: string) =>
    post<ToutiaoVerifyResult>('/api/settings/toutiao-verify', { cookie }),
  clearToutiao: () => post<{ success: boolean }>('/api/settings/toutiao-clear'),
  toutiaoLogin: (onEvent: (evt: ToutiaoLoginEvent) => void): Promise<void> => {
    return sseGet<ToutiaoLoginEvent>('/api/settings/toutiao-login-stream', onEvent);
  },
  pickFolder: () => get<{ path: string }>('/api/pick-folder'),
};
