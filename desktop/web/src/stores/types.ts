import type { Post, ScoreInfo, QueueItem, ArticleItem, ChatMessage, InspirationTopic, TreeNode, BrowseFolder, BrowseFile, PipelineEvent, PipelineSummary } from '../types';

/* ── Theme Presets ──────────────────────────── */
export interface ThemePreset {
  id: string;
  name: string;
  light: string;
  dark: string;
  hover: string;
}

/* ── Toast ───────────────────────────────────── */
export interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'success' | 'error';
}

/* ── Lightbox ────────────────────────────────── */
export interface LightboxState {
  images: string[];
  index: number;
  originals?: string[];
}

/* ── App State ───────────────────────────────── */

export interface AppState {
  // Theme
  theme: string;
  setTheme: (t: string) => void;
  accentId: string;
  setAccentId: (id: string) => void;
  syncTheme: () => Promise<void>;

  // Toast
  toasts: ToastItem[];
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  removeToast: (id: number) => void;

  // Lightbox
  lightbox: LightboxState | null;
  openLightbox: (images: string[], index: number, originals?: string[]) => void;
  closeLightbox: () => void;
  lightboxNav: (delta: number) => void;
  lightboxGoTo: (index: number) => void;

  // Progress overlay
  progress: { current: number; total: number; detail: string } | null;
  setProgress: (p: { current: number; total: number; detail: string } | null) => void;

  // Discovery
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

  // Materials — 文件夹管理模式
  folderTree: TreeNode[];
  currentPath: string;
  currentFolders: BrowseFolder[];
  currentFiles: BrowseFile[];
  breadcrumb: { name: string; path: string }[];
  expandedFolders: Set<string>;
  matSelected: Set<string>;
  viewMode: 'grid' | 'list';
  setFolderTree: (tree: TreeNode[]) => void;
  setCurrentPath: (path: string) => void;
  setCurrentFolders: (folders: BrowseFolder[]) => void;
  setCurrentFiles: (files: BrowseFile[]) => void;
  setBreadcrumb: (items: { name: string; path: string }[]) => void;
  toggleFolderExpanded: (path: string) => void;
  matToggleSelect: (path: string) => void;
  matSelectAll: (paths: string[]) => void;
  matSetSelection: (paths: string[]) => void;
  matClearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;

  // Queue
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;

  // Articles
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
  clearChatMessages: (articleId: string) => void;
  getChatMessages: (articleId: string) => ChatMessage[];

  // WeChat sidebar sync
  wechatRefreshKey: number;
  incWechatRefreshKey: () => void;

  // AI Recommended Celebrities (cached)
  recommendedCelebs: string[];
  setRecommendedCelebs: (celebs: string[]) => void;

  // Pipeline running state (global, persists across page navigation)
  pipelineRunning: boolean;
  setPipelineRunning: (running: boolean) => void;

  // Pipeline SSE state (persists across page navigation)
  pipelineEvents: PipelineEvent[];
  pipelineCurrentStep: string | null;
  pipelineStepProgress: { current: number; total: number } | null;
  pipelineSummary: PipelineSummary | null;
  pipelineError: string | null;
  pipelineCheckpoint: {
    message: string;
    runId: string;
    items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }>;
  } | null;
  pipelineDecisionReq: {
    message: string;
    runId: string;
    options: Array<{ id: string; label: string }>;
    context?: Record<string, unknown>;
  } | null;
  pipelineAbortController: AbortController | null;
  setPipelineAbortController: (controller: AbortController | null) => void;
  setPipelineEvents: (events: PipelineEvent[]) => void;
  addPipelineEvent: (evt: PipelineEvent) => void;
  processPipelineEvent: (evt: PipelineEvent) => void;
  setPipelineCurrentStep: (step: string | null) => void;
  setPipelineStepProgress: (progress: { current: number; total: number } | null) => void;
  setPipelineSummary: (summary: PipelineSummary | null) => void;
  setPipelineError: (error: string | null) => void;
  setPipelineCheckpoint: (checkpoint: { message: string; runId: string; items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }> } | null) => void;
  setPipelineDecisionReq: (req: { message: string; runId: string; options: Array<{ id: string; label: string }>; context?: Record<string, unknown> } | null) => void;
  resetPipelineState: () => void;

  // Article sidebar state (persisted)
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Sidebar width (persisted)
  sidebarWidth: number;
  sidebarWidthSynced: boolean;
  setSidebarWidth: (w: number) => void;
}
