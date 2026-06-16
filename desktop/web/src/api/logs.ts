import { get, post, del } from './base';
import type { LogFileInfo, LogContentResponse } from '../types';

export const logsApi = {
  list: () => get<{ files: LogFileInfo[] }>('/api/logs/list'),
  content: (file: string, maxLines = 500) =>
    get<LogContentResponse>(
      `/api/logs/content?file=${encodeURIComponent(file)}&max_lines=${maxLines}`,
    ),
  copyToClipboard: (text: string) => post<{ success: boolean }>('/api/logs/clipboard', { text }),
  saveToDownloads: (file: string) =>
    post<{ success: boolean; path: string }>('/api/logs/save-to-downloads', { file }),
  logToast: (message: string, type = 'info') =>
    post<{ success: boolean }>('/api/logs/toast', { message, type }),
  delete: (file: string) =>
    del<{ success: boolean }>(`/api/logs/delete?file=${encodeURIComponent(file)}`),
  clearAll: () => del<{ success: boolean; deleted: number }>('/api/logs/clear'),
};
