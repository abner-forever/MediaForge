import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { TreeNode, BrowseFolder, BrowseFile } from '../types';

export interface MaterialsSlice {
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
}

export const createMaterialsSlice: StateCreator<AppState, [], [], MaterialsSlice> = (set) => ({
  folderTree: [],
  currentPath: '',
  currentFolders: [],
  currentFiles: [],
  breadcrumb: [{ name: '全部素材', path: '' }],
  expandedFolders: new Set(),
  matSelected: new Set(),
  viewMode: 'grid',
  setFolderTree: (tree) => set({ folderTree: tree }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setCurrentFolders: (folders) => set({ currentFolders: folders }),
  setCurrentFiles: (files) => set({ currentFiles: files }),
  setBreadcrumb: (items) => set({ breadcrumb: items }),
  toggleFolderExpanded: (path) =>
    set((s) => {
      const next = new Set(s.expandedFolders);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedFolders: next };
    }),
  matToggleSelect: (path) =>
    set((s) => {
      const next = new Set(s.matSelected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { matSelected: next };
    }),
  matSelectAll: (paths) =>
    set((s) => {
      const all = new Set(paths);
      const isAll = s.matSelected.size === all.size && [...all].every((p) => s.matSelected.has(p));
      return { matSelected: isAll ? new Set() : all };
    }),
  matSetSelection: (paths) => set({ matSelected: new Set(paths) }),
  matClearSelection: () => set({ matSelected: new Set() }),
  setViewMode: (mode) => set({ viewMode: mode }),
});
