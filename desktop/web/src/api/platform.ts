import { get } from './base';
import type { PlatformMeta } from '../types';

export const platformApi = {
  list: () => get<{ platforms: Record<string, PlatformMeta>; default: string }>('/api/platforms'),
};
