import { get, post, del } from './base';
import { sseGet } from './sse';
import type { WeChatAccount, WeChatLoginEvent, PublishHistoryItem } from '../types';

export const wechatAccountApi = {
  list: () => get<{ accounts: WeChatAccount[] }>('/api/wechat/accounts'),
  add: (name: string) => post<{ success: boolean; account: WeChatAccount }>('/api/wechat/accounts', { name }),
  remove: (id: string) => del<{ success: boolean }>(`/api/wechat/accounts/${id}`),
  status: (id: string) => get<{ logged_in: boolean; name: string }>(`/api/wechat/accounts/${id}/status`),
  logout: (id: string) => post<{ success: boolean }>(`/api/wechat/accounts/${id}/logout`),
  setDefault: (id: string) => post<{ success: boolean }>(`/api/wechat/accounts/${id}/default`),
  login: (id: string, onEvent: (evt: WeChatLoginEvent) => void): Promise<void> => {
    return sseGet<WeChatLoginEvent>(`/api/wechat/accounts/${id}/login`, onEvent, { flushBuffer: false });
  },
  history: (accountId?: string) => {
    const path = accountId ? `/api/wechat/accounts/${accountId}/history` : '/api/wechat/accounts/history';
    return get<{ items: PublishHistoryItem[]; total: number }>(path);
  },
};
