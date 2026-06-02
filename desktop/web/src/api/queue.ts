import { get, post, put, del } from './base';
import type { QueueItem } from '../types';

export const queueApi = {
  get: () => get<{ queue: QueueItem[] }>('/api/queue'),
  add: (item: Partial<QueueItem>) => post<{ success: boolean; queue: QueueItem[] }>('/api/queue', item),
  update: (id: string, data: Partial<QueueItem>) => put(`/api/queue/${id}`, data),
  remove: (id: string, deleteLocal?: boolean) => del(`/api/queue/${id}${deleteLocal ? '?delete_local=true' : ''}`),
  generate: (id: string) => post<{ success: boolean; title: string; desc: string; message?: string }>(`/api/queue/${id}/generate`),
  publish: (id: string, opts: { dry_run?: boolean; save_draft?: boolean; account_id?: string; headless?: boolean }) =>
    post<{ success: boolean; started?: boolean; message: string }>(`/api/queue/${id}/publish`, opts),
  enqueueSelected: (images?: string[]) => post<{ success: boolean; title: string; desc: string }>('/api/queue/enqueue-selected', { images }),
  removeImage: (id: string, imagePath: string, deleteLocal?: boolean) =>
    del<{ success: boolean; queue: QueueItem[] }>(`/api/queue/${id}/image?image_path=${encodeURIComponent(imagePath)}${deleteLocal ? '&delete_local=true' : ''}`),
  removeWatermark: (id: string, imagePath: string) =>
    post<{ success: boolean; action?: string; message: string; queue: QueueItem[] }>(`/api/queue/${id}/remove-watermark?image_path=${encodeURIComponent(imagePath)}`),
  batchRemoveWatermarks: (id: string) =>
    post<{ success: boolean; processed: number; skipped: number; failed: number; total: number; queue: QueueItem[] }>(`/api/queue/${id}/remove-watermarks`),
};
