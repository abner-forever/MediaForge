import type { StateCreator } from 'zustand';
import type { AppState } from './types';

export interface WechatSlice {
  wechatRefreshKey: number;
  incWechatRefreshKey: () => void;
  recommendedCelebs: string[];
  setRecommendedCelebs: (celebs: string[]) => void;
}

export const createWechatSlice: StateCreator<AppState, [], [], WechatSlice> = (set) => ({
  wechatRefreshKey: 0,
  incWechatRefreshKey: () => set((s) => ({ wechatRefreshKey: s.wechatRefreshKey + 1 })),
  recommendedCelebs: [],
  setRecommendedCelebs: (celebs) => set({ recommendedCelebs: celebs }),
});
