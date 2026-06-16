import { get, post, put, del } from './base';
import type {
  MaterialsData,
  TreeResult,
  BrowseResult,
  ScoreInfo,
  MetadataResponse,
  MaterialMeta,
  MaterialsTagsResponse,
} from '../types';

export const materialsApi = {
  list: () => get<MaterialsData>('/api/materials'),
  delete: (paths: string[]) =>
    del<{ success: boolean; deleted: number }>('/api/materials', { paths }),

  // 文件夹管理
  tree: () => get<TreeResult>('/api/materials/tree'),
  browse: (path: string) =>
    get<BrowseResult>(`/api/materials/browse?path=${encodeURIComponent(path)}`),
  createFolder: (parentPath: string, name: string) =>
    post<{ success: boolean; path: string }>('/api/materials/folder', {
      parent_path: parentPath,
      name,
    }),
  renameFolder: (path: string, newName: string) =>
    put<{ success: boolean; path: string }>('/api/materials/folder', { path, new_name: newName }),
  deleteFolder: (path: string) =>
    del<{ success: boolean }>(`/api/materials/folder?path=${encodeURIComponent(path)}`),
  renameFile: (path: string, newName: string) =>
    put<{ success: boolean; path: string }>('/api/materials/file', { path, new_name: newName }),
  moveItems: (items: string[], destination: string) =>
    post<{ success: boolean; moved: number }>('/api/materials/move', { items, destination }),

  // 评分
  score: (paths: string[], useVision = true) =>
    post<{
      success: boolean;
      scores: Record<string, ScoreInfo>;
      vision_count: number;
      heuristic_count: number;
    }>('/api/materials/score', { image_paths: paths, use_vision: useVision }),

  // 元数据
  getMeta: (path?: string) =>
    get<MetadataResponse>(`/api/materials/meta${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  updateMeta: (path: string, data: Partial<MaterialMeta>) =>
    put<{ success: boolean; meta: MaterialMeta }>('/api/materials/meta', { path, ...data }),
  getTags: () => get<MaterialsTagsResponse>('/api/materials/tags'),

  // 自定义排序
  setSortOrder: (path: string, order: string[]) =>
    put<{ success: boolean }>('/api/materials/sort-order', { path, order }),
  getSortOrder: (path: string) =>
    get<{ path: string; order: string[] }>(
      `/api/materials/sort-order?path=${encodeURIComponent(path)}`,
    ),

  // 文件上传
  upload: async (file: File, parentPath = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parent_path', parentPath);
    const resp = await fetch('/api/materials/upload', { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: '上传失败' }));
      throw new Error(err.detail || '上传失败');
    }
    return resp.json() as Promise<{
      success: boolean;
      path: string;
      name: string;
      size: number;
      suffix: string;
    }>;
  },
};
