import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { QueueItem } from '../types';

export interface QueueSlice {
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;
}

export const createQueueSlice: StateCreator<AppState, [], [], QueueSlice> = (set) => ({
  queue: [],
  setQueue: (q) => set({ queue: q }),
});
