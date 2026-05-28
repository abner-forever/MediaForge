import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../index';

// Mock localStorage
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
});

// Mock fetch for theme sync
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

describe('UI Slice', () => {
  beforeEach(() => {
    useStore.setState({
      toasts: [],
      lightbox: null,
      progress: null,
    });
  });

  it('addToast 添加 toast 并自增 id', () => {
    useStore.getState().addToast('hello', 'success');
    const { toasts } = useStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].msg).toBe('hello');
    expect(toasts[0].type).toBe('success');
  });

  it('removeToast 移除指定 id', () => {
    useStore.getState().addToast('a');
    useStore.getState().addToast('b');
    const id = useStore.getState().toasts[0].id;
    useStore.getState().removeToast(id);
    expect(useStore.getState().toasts).toHaveLength(1);
    expect(useStore.getState().toasts[0].msg).toBe('b');
  });

  it('openLightbox 设置图片和索引', () => {
    useStore.getState().openLightbox(['/a.jpg', '/b.jpg'], 1);
    const lb = useStore.getState().lightbox!;
    expect(lb.images).toEqual(['/a.jpg', '/b.jpg']);
    expect(lb.index).toBe(1);
  });

  it('closeLightbox 清空 lightbox', () => {
    useStore.getState().openLightbox(['/a.jpg'], 0);
    useStore.getState().closeLightbox();
    expect(useStore.getState().lightbox).toBeNull();
  });

  it('lightboxNav 循环导航', () => {
    useStore.getState().openLightbox(['/a.jpg', '/b.jpg', '/c.jpg'], 0);
    useStore.getState().lightboxNav(1);
    expect(useStore.getState().lightbox!.index).toBe(1);
    useStore.getState().lightboxNav(1);
    expect(useStore.getState().lightbox!.index).toBe(2);
    useStore.getState().lightboxNav(1);
    expect(useStore.getState().lightbox!.index).toBe(0); // 循环
  });

  it('lightboxGoTo 跳转到指定索引', () => {
    useStore.getState().openLightbox(['/a.jpg', '/b.jpg', '/c.jpg'], 0);
    useStore.getState().lightboxGoTo(2);
    expect(useStore.getState().lightbox!.index).toBe(2);
  });

  it('setProgress 设置进度', () => {
    useStore.getState().setProgress({ current: 5, total: 10, detail: '处理中' });
    expect(useStore.getState().progress).toEqual({ current: 5, total: 10, detail: '处理中' });
    useStore.getState().setProgress(null);
    expect(useStore.getState().progress).toBeNull();
  });
});

describe('Discovery Slice', () => {
  beforeEach(() => {
    useStore.setState({
      discoveryPosts: [],
      selectedPosts: new Set(),
      imageScores: {},
      selectedImages: [],
    });
  });

  it('setDiscoveryPosts 更新帖子列表', () => {
    const posts = [{ text: 'test', images: [], screen_name: 'user' }] as any[];
    useStore.getState().setDiscoveryPosts(posts);
    expect(useStore.getState().discoveryPosts).toEqual(posts);
  });

  it('togglePostSelect 切换选中状态', () => {
    useStore.getState().setDiscoveryPosts([{ text: 'a' }, { text: 'b' }] as any[]);
    useStore.getState().togglePostSelect(0);
    expect(useStore.getState().selectedPosts.has(0)).toBe(true);
    useStore.getState().togglePostSelect(0);
    expect(useStore.getState().selectedPosts.has(0)).toBe(false);
  });

  it('toggleImageSelect 切换图片选中', () => {
    useStore.getState().toggleImageSelect('/img/a.jpg');
    expect(useStore.getState().selectedImages).toContain('/img/a.jpg');
    useStore.getState().toggleImageSelect('/img/a.jpg');
    expect(useStore.getState().selectedImages).not.toContain('/img/a.jpg');
  });

  it('clearSelectedImages 清空选中', () => {
    useStore.getState().toggleImageSelect('/a.jpg');
    useStore.getState().toggleImageSelect('/b.jpg');
    useStore.getState().clearSelectedImages();
    expect(useStore.getState().selectedImages).toHaveLength(0);
  });

  it('selectAllImages 选中所有传入路径', () => {
    useStore.getState().selectAllImages(['/a.jpg', '/b.jpg']);
    expect(useStore.getState().selectedImages).toEqual(['/a.jpg', '/b.jpg']);
  });
});

describe('Queue Slice', () => {
  beforeEach(() => {
    useStore.setState({ queue: [] });
  });

  it('setQueue 更新队列', () => {
    const queue = [{ id: '1', title: 'test', images: [], status: 'pending' }] as any[];
    useStore.getState().setQueue(queue);
    expect(useStore.getState().queue).toEqual(queue);
  });
});

describe('Articles Slice', () => {
  beforeEach(() => {
    useStore.setState({ articles: [], currentArticle: null, articleFilter: 'all' });
  });

  it('setArticles 更新文章列表', () => {
    const articles = [{ id: '1', title: '文章', status: 'draft' }] as any[];
    useStore.getState().setArticles(articles);
    expect(useStore.getState().articles).toEqual(articles);
  });

  it('setCurrentArticle 设置当前文章', () => {
    const article = { id: '1', title: '文章' } as any;
    useStore.getState().setCurrentArticle(article);
    expect(useStore.getState().currentArticle).toEqual(article);
    useStore.getState().setCurrentArticle(null);
    expect(useStore.getState().currentArticle).toBeNull();
  });

  it('setArticleFilter 设置过滤器', () => {
    useStore.getState().setArticleFilter('draft');
    expect(useStore.getState().articleFilter).toBe('draft');
  });
});

describe('WeChat Slice', () => {
  it('incWechatRefreshKey 自增刷新 key', () => {
    const before = useStore.getState().wechatRefreshKey;
    useStore.getState().incWechatRefreshKey();
    expect(useStore.getState().wechatRefreshKey).toBe(before + 1);
  });
});

describe('Pipeline Slice', () => {
  beforeEach(() => {
    useStore.setState({
      pipelineRunning: false,
      pipelineEvents: [],
      pipelineError: null,
      pipelineSummary: null,
    });
  });

  it('setPipelineRunning 切换运行状态', () => {
    useStore.getState().setPipelineRunning(true);
    expect(useStore.getState().pipelineRunning).toBe(true);
  });

  it('addPipelineEvent 追加事件', () => {
    useStore.getState().addPipelineEvent({ event: 'run_started', ts: '', payload: {} } as any);
    useStore.getState().addPipelineEvent({ event: 'step_complete', ts: '', payload: {} } as any);
    expect(useStore.getState().pipelineEvents).toHaveLength(2);
  });

  it('resetPipelineState 重置所有状态', () => {
    useStore.getState().setPipelineRunning(true);
    useStore.getState().addPipelineEvent({ event: 'test' } as any);
    useStore.getState().setPipelineError('error');
    useStore.getState().resetPipelineState();
    expect(useStore.getState().pipelineRunning).toBe(false);
    expect(useStore.getState().pipelineEvents).toHaveLength(0);
    expect(useStore.getState().pipelineError).toBeNull();
  });
});
