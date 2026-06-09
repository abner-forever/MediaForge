import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { QueueItem } from '../types';

/* ── 发布任务状态 ──────────────────────────────── */
export interface PublishTaskState {
  /** 任务类型：草稿 or 发布 */
  action: 'draft' | 'publish';
  /** 当前状态 */
  status: 'publishing' | 'done' | 'error';
  /** 发布日志 */
  logs: string[];
  /** 错误信息 */
  error?: string;
  /** 队列项标题（用于展示） */
  title: string;
  /** 开始时间 */
  startTime: number;
  /** AbortController 用于取消轮询 */
  abortController?: AbortController;
}

export interface QueueSlice {
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;

  // 发布任务状态（全局，跨页面保持）
  publishingTasks: Record<string, PublishTaskState>;
  startPublishTask: (id: string, action: 'draft' | 'publish', title: string) => void;
  updatePublishTask: (id: string, updates: Partial<PublishTaskState>) => void;
  addPublishLog: (id: string, log: string) => void;
  finishPublishTask: (id: string, success: boolean, error?: string) => void;
  removePublishTask: (id: string) => void;
  getActiveTaskCount: () => number;
}

export const createQueueSlice: StateCreator<AppState, [], [], QueueSlice> = (set, get) => ({
  queue: [],
  setQueue: (q) => set({ queue: q }),

  // 发布任务状态
  publishingTasks: {},

  startPublishTask: (id, action, title) => set(state => ({
    publishingTasks: {
      ...state.publishingTasks,
      [id]: {
        action,
        status: 'publishing',
        logs: [],
        title,
        startTime: Date.now(),
      },
    },
  })),

  updatePublishTask: (id, updates) => set(state => {
    const existing = state.publishingTasks[id];
    if (!existing) return state;
    return {
      publishingTasks: {
        ...state.publishingTasks,
        [id]: { ...existing, ...updates },
      },
    };
  }),

  addPublishLog: (id, log) => set(state => {
    const existing = state.publishingTasks[id];
    if (!existing) return state;
    return {
      publishingTasks: {
        ...state.publishingTasks,
        [id]: { ...existing, logs: [...existing.logs, log] },
      },
    };
  }),

  finishPublishTask: (id, success, error) => set(state => {
    const existing = state.publishingTasks[id];
    if (!existing) return state;
    return {
      publishingTasks: {
        ...state.publishingTasks,
        [id]: {
          ...existing,
          status: success ? 'done' : 'error',
          error,
        },
      },
    };
  }),

  removePublishTask: (id) => set(state => {
    const { [id]: _, ...rest } = state.publishingTasks;
    return { publishingTasks: rest };
  }),

  getActiveTaskCount: () => {
    const tasks = get().publishingTasks;
    return Object.values(tasks).filter(t => t.status === 'publishing').length;
  },
});
