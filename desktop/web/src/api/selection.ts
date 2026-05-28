import { get, post } from './base';
import type { ScoreInfo } from '../types';

export const selectionApi = {
  get: () => get<{ selected: string[]; scores: Record<string, ScoreInfo> }>('/api/selection'),
  add: (path: string) => post('/api/selection/add', { path }),
  remove: (path: string) => post('/api/selection/remove', { path }),
  clear: () => post('/api/selection/clear'),
};
