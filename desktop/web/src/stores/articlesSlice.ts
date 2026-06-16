import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { ArticleItem, ChatMessage, InspirationTopic } from '../types';

export interface ArticlesSlice {
  articles: ArticleItem[];
  currentArticle: ArticleItem | null;
  articleFilter: 'all' | 'draft' | 'queued' | 'published';
  inspirationResults: InspirationTopic[];
  chatMessages: Record<string, ChatMessage[]>;
  setArticles: (articles: ArticleItem[]) => void;
  setCurrentArticle: (article: ArticleItem | null) => void;
  setArticleFilter: (filter: 'all' | 'draft' | 'queued' | 'published') => void;
  setInspirationResults: (results: InspirationTopic[]) => void;
  addChatMessage: (articleId: string, message: ChatMessage) => void;
  updateChatMessage: (articleId: string, messageId: string, content: string) => void;
  removeChatMessage: (articleId: string, messageId: string) => void;
  clearChatMessages: (articleId: string) => void;
  getChatMessages: (articleId: string) => ChatMessage[];
}

export const createArticlesSlice: StateCreator<AppState, [], [], ArticlesSlice> = (set, get) => ({
  articles: [],
  currentArticle: null,
  articleFilter: 'all',
  inspirationResults: [],
  chatMessages: {},
  setArticles: (articles) => set({ articles }),
  setCurrentArticle: (article) => set({ currentArticle: article }),
  setArticleFilter: (filter) => set({ articleFilter: filter }),
  setInspirationResults: (results) => set({ inspirationResults: results }),
  addChatMessage: (articleId, message) =>
    set((state) => ({
      chatMessages: {
        ...state.chatMessages,
        [articleId]: [...(state.chatMessages[articleId] || []), message],
      },
    })),
  updateChatMessage: (articleId, messageId, content) =>
    set((state) => ({
      chatMessages: {
        ...state.chatMessages,
        [articleId]: (state.chatMessages[articleId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, content } : msg,
        ),
      },
    })),
  removeChatMessage: (articleId, messageId) =>
    set((state) => ({
      chatMessages: {
        ...state.chatMessages,
        [articleId]: (state.chatMessages[articleId] || []).filter((msg) => msg.id !== messageId),
      },
    })),
  clearChatMessages: (articleId) =>
    set((state) => ({
      chatMessages: { ...state.chatMessages, [articleId]: [] },
    })),
  getChatMessages: (articleId) => get().chatMessages[articleId] || [],
});
