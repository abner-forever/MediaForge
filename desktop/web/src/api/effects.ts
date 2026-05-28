import { get, post } from './base';
import type { PublishEffect } from '../types';

export const effectsApi = {
  list: () => get<{ effects: PublishEffect[] }>('/api/effects'),
  get: (itemId: string) => get<{ effect: PublishEffect | null }>(`/api/effects/${itemId}`),
  save: (itemId: string, data: Partial<PublishEffect>) =>
    post<{ success: boolean; effect: PublishEffect }>(`/api/effects/${itemId}`, data),
};
