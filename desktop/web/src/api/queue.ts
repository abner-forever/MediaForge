import { get, post, put, del } from './base';
import type { QueueItem } from '../types';

export const queueApi = {
  get: () => get<{ queue: QueueItem[] }>('/api/queue'),
  add: (item: Partial<QueueItem>) => post<{ success: boolean; queue: QueueItem[] }>('/api/queue', item),
  update: (id: string, data: Partial<QueueItem>) => put(`/api/queue/${id}`, data),
  remove: (id: string) => del(`/api/queue/${id}`),
  generate: (id: string) => post<{ success: boolean; title: string; desc: string; message?: string }>(`/api/queue/${id}/generate`),
  publish: (id: string, opts: { dry_run?: boolean; save_draft?: boolean; account_id?: string }) =>
    post<{ success: boolean; started?: boolean; message: string }>(`/api/queue/${id}/publish`, opts),
  enqueueSelected: (images?: string[]) => post<{ success: boolean; title: string; desc: string }>('/api/queue/enqueue-selected', { images }),
};
