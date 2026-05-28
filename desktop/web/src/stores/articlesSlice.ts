import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { ArticleItem, InspirationTopic } from '../types';

export interface ArticlesSlice {
  articles: ArticleItem[];
  currentArticle: ArticleItem | null;
  articleFilter: 'all' | 'draft' | 'queued' | 'published';
  inspirationResults: InspirationTopic[];
  setArticles: (articles: ArticleItem[]) => void;
  setCurrentArticle: (article: ArticleItem | null) => void;
  setArticleFilter: (filter: 'all' | 'draft' | 'queued' | 'published') => void;
  setInspirationResults: (results: InspirationTopic[]) => void;
}

export const createArticlesSlice: StateCreator<AppState, [], [], ArticlesSlice> = (set) => ({
  articles: [],
  currentArticle: null,
  articleFilter: 'all',
  inspirationResults: [],
  setArticles: (articles) => set({ articles }),
  setCurrentArticle: (article) => set({ currentArticle: article }),
  setArticleFilter: (filter) => set({ articleFilter: filter }),
  setInspirationResults: (results) => set({ inspirationResults: results }),
});
