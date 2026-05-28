import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { Post, ScoreInfo } from '../types';

export interface DiscoverySlice {
  discoveryPosts: Post[];
  selectedPosts: Set<number>;
  imageScores: Record<string, ScoreInfo>;
  selectedImages: string[];
  discoveryCelebs: string;
  discoveryTags: string;
  discoverySuperTopics: string;
  discoveryToutiaoKeywords: string;
  setDiscoveryPosts: (posts: Post[]) => void;
  togglePostSelect: (idx: number) => void;
  clearSelectedPosts: () => void;
  selectAllPosts: () => void;
  setImageScores: (scores: Record<string, ScoreInfo>) => void;
  toggleImageSelect: (path: string) => void;
  selectAllImages: (paths: string[]) => void;
  clearSelectedImages: () => void;
  setDiscoveryCelebs: (v: string) => void;
  setDiscoveryTags: (v: string) => void;
  setDiscoverySuperTopics: (v: string) => void;
  setDiscoveryToutiaoKeywords: (v: string) => void;
}

export const createDiscoverySlice: StateCreator<AppState, [], [], DiscoverySlice> = (set) => ({
  discoveryPosts: [],
  selectedPosts: new Set(),
  imageScores: {},
  selectedImages: [],
  discoveryCelebs: '',
  discoveryTags: '',
  discoverySuperTopics: '',
  discoveryToutiaoKeywords: '',
  setDiscoveryPosts: (posts) => set({ discoveryPosts: posts }),
  togglePostSelect: (idx) =>
    set((s) => {
      const next = new Set(s.selectedPosts);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { selectedPosts: next };
    }),
  clearSelectedPosts: () => set({ selectedPosts: new Set() }),
  selectAllPosts: () =>
    set((s) => {
      const all = s.discoveryPosts.map((_, i) => i);
      const isAll = s.selectedPosts.size === all.length;
      return { selectedPosts: isAll ? new Set() : new Set(all) };
    }),
  setImageScores: (scores) => set({ imageScores: scores }),
  toggleImageSelect: (path) =>
    set((s) => {
      const idx = s.selectedImages.indexOf(path);
      if (idx >= 0) {
        const next = [...s.selectedImages];
        next.splice(idx, 1);
        return { selectedImages: next };
      }
      return { selectedImages: [...s.selectedImages, path] };
    }),
  clearSelectedImages: () => set({ selectedImages: [] }),
  selectAllImages: (paths: string[]) =>
    set((s) => {
      const isAll = s.selectedImages.length === paths.length && paths.every((p) => s.selectedImages.includes(p));
      return { selectedImages: isAll ? [] : [...paths] };
    }),
  setDiscoveryCelebs: (v) => set({ discoveryCelebs: v }),
  setDiscoveryTags: (v) => set({ discoveryTags: v }),
  setDiscoverySuperTopics: (v) => set({ discoverySuperTopics: v }),
  setDiscoveryToutiaoKeywords: (v) => set({ discoveryToutiaoKeywords: v }),
});
