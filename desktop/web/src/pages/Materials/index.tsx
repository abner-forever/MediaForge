import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../../stores';
import { materialsApi, queueApi } from '../../api/client';
import type { TreeNode, BrowseFolder, BrowseFile, ScoreInfo, MaterialMeta } from '../../api/client';
import ContextMenu, { type MenuItem } from '../../components/ContextMenu';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';
import Loading from '../../components/Loading';
import Checkbox from '../../components/Checkbox';
import Select, { type SelectOption } from '../../components/Select';
import { useLoading } from '../../hooks/useLoading';
import { imgSrc, lightboxSrc, formatSize } from './utils';
import FolderTree from './FolderTree';
import FolderCard from './FolderCard';
import ImageCard from './ImageCard';
import TagEditorModal from './TagEditorModal';
import LazyImage from '../Discovery/LazyImage';

export default function Materials() {
  const {
    folderTree, currentPath, currentFolders, currentFiles, breadcrumb,
    matSelected, viewMode,
    setFolderTree, setCurrentPath, setCurrentFolders, setCurrentFiles, setBreadcrumb,
    toggleFolderExpanded, matToggleSelect, matSelectAll, matSetSelection, matClearSelection, setViewMode,
    openLightbox, addToast,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState<string | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: string; type: 'file' | 'folder' } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const { loading: creating, withLoading: withCreating } = useLoading();
  const { loading: enqueuing, withLoading: withEnqueuing } = useLoading();
  const { loading: deleting, withLoading: withDeleting } = useLoading();
  const { loading: renaming, withLoading: withRenaming } = useLoading();
  const { loading: scoring, withLoading: withScoring } = useLoading();
  const [scoreMap, setScoreMap] = useState<Record<string, ScoreInfo>>({});
  const [metaMap, setMetaMap] = useState<Record<string, MaterialMeta>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allCelebrities, setAllCelebrities] = useState<string[]>([]);
  const [allScenes, setAllScenes] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const [filterCelebrity, setFilterCelebrity] = useState('');
  const [filterScene, setFilterScene] = useState('');
  const [filterUsage, setFilterUsage] = useState<'all' | 'used' | 'unused'>('all');
  const [tagEditorTarget, setTagEditorTarget] = useState<string | null>(null);

  // Box selection
  const gridRef = useRef<HTMLDivElement>(null);
  const [boxStyle, setBoxStyle] = useState<React.CSSProperties | null>(null);
  const boxTracking = useRef({ active: false, dragging: false, startX: 0, startY: 0, rect: null as { left: number; top: number; width: number; height: number } | null });

  // Drag reorder (不会冲突现有的文件移动拖拽——drop 到 grid 内部触发排序，drop 到文件夹树触发移动)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const loadScoresAndMeta = useCallback(async () => {
    try {
      const { meta } = await materialsApi.getMeta();
      if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        const mm = meta as Record<string, any>;
        const sm: Record<string, ScoreInfo> = {};
        const mm2: Record<string, MaterialMeta> = {};
        for (const [path, data] of Object.entries(mm)) {
          mm2[path] = data as MaterialMeta;
          if (data.scored && data.score > 0) {
            sm[path] = { score: data.score, reason: data.score_reason || '', method: 'vision' };
          }
        }
        setScoreMap(sm);
        setMetaMap(mm2);
      }
    } catch { /* ignore */ }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const r = await materialsApi.getTags();
      setAllTags(r.tags || []);
      setAllCelebrities(r.celebrities || []);
      setAllScenes(r.scenes || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([
      materialsApi.tree().then(r => setFolderTree(r.tree)),
      materialsApi.browse('').then(r => {
        setCurrentFolders(r.folders);
        setCurrentFiles(r.files);
        setBreadcrumb(r.breadcrumb);
      }),
      loadScoresAndMeta(),
      loadTags(),
    ]).finally(() => setLoading(false));
  }, []);

  const navigateTo = useCallback(async (path: string) => {
    setLoading(true);
    setCurrentPath(path);
    matClearSelection();
    try {
      const r = await materialsApi.browse(path || '');
      setCurrentFolders(r.folders);
      setCurrentFiles(r.files);
      setBreadcrumb(r.breadcrumb);
      await loadScoresAndMeta();
      await loadTags();
    } catch { /* ignore */ }
    setLoading(false);
  }, [loadScoresAndMeta, loadTags]);

  const refreshCurrent = useCallback(async () => {
    try {
      const r = await materialsApi.browse(currentPath || '');
      setCurrentFolders(r.folders);
      setCurrentFiles(r.files);
      setBreadcrumb(r.breadcrumb);
      await loadScoresAndMeta();
    } catch { /* ignore */ }
  }, [currentPath, loadScoresAndMeta]);

  const filteredFiles = currentFiles.filter(f => {
    const m = metaMap[f.path];
    if (filterTag && !m?.tags?.includes(filterTag)) return false;
    if (filterCelebrity && m?.celebrity !== filterCelebrity) return false;
    if (filterScene && m?.scene !== filterScene) return false;
    if (filterUsage === 'used' && !m?.used_count) return false;
    if (filterUsage === 'unused' && m?.used_count) return false;
    return true;
  });

  // 有筛选条件时，只显示包含匹配文件的文件夹
  const hasFilter = filterTag || filterCelebrity || filterScene || filterUsage !== 'all';
  const matchingPaths = hasFilter
    ? new Set(
        Object.entries(metaMap)
          .filter(([, m]) => {
            if (filterTag && !m?.tags?.includes(filterTag)) return false;
            if (filterCelebrity && m?.celebrity !== filterCelebrity) return false;
            if (filterScene && m?.scene !== filterScene) return false;
            if (filterUsage === 'used' && !m?.used_count) return false;
            if (filterUsage === 'unused' && m?.used_count) return false;
            return true;
          })
          .map(([path]) => path),
      )
    : null;
  const filteredFolders = matchingPaths
    ? currentFolders.filter(f => [...matchingPaths].some(p => p.startsWith(f.path + '/')))
    : currentFolders;

  // ── 拖拽排序 ────────────────────────────
  const handleGridDragStart = (e: React.DragEvent, index: number, path: string) => {
    setDragIndex(index);
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleGridDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleGridDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const srcIdx = dragIndex;
    if (srcIdx === null || srcIdx === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    const reordered = [...filteredFiles];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(targetIndex, 0, moved);

    // 将重排顺序映射到 currentFiles
    const orderMap = new Map(reordered.map((f, i) => [f.path, i]));
    const sorted = [...currentFiles].sort((a, b) => {
      const ai = orderMap.get(a.path);
      const bi = orderMap.get(b.path);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return 0;
    });
    setCurrentFiles(sorted);

    try {
      await materialsApi.setSortOrder(currentPath, reordered.map(f => f.name));
    } catch { /* ignore */ }

    setDragIndex(null);
    setDropIndex(null);
  };

  const handleGridDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await withCreating(async () => {
      try {
        await materialsApi.createFolder(currentPath, newFolderName.trim());
        addToast('文件夹已创建', 'success');
        setNewFolderName('');
        setShowNewFolder(false);
        await refreshCurrent();
        const tree = await materialsApi.tree();
        setFolderTree(tree.tree);
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await withRenaming(async () => {
      try {
        if (renameTarget.type === 'folder') {
          await materialsApi.renameFolder(renameTarget.path, renameValue.trim());
        } else {
          await materialsApi.renameFile(renameTarget.path, renameValue.trim());
        }
        addToast('已重命名', 'success');
        setRenameTarget(null);
        await refreshCurrent();
        const tree = await materialsApi.tree();
        setFolderTree(tree.tree);
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  // 重命名弹窗打开时，自动选中文件名部分（不含后缀）
  useEffect(() => {
    if (!renameTarget) return;
    // Modal 使用 requestAnimationFrame 延迟渲染 DOM，setTimeout 确保在 Modal 完成挂载后执行
    const timer = setTimeout(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      const val = input.value;
      if (renameTarget.type === 'file') {
        const dot = val.lastIndexOf('.');
        if (dot > 0) {
          input.setSelectionRange(0, dot);
          return;
        }
      }
      input.select();
    }, 50);
    return () => clearTimeout(timer);
  }, [renameTarget]);

  const handleDeleteFolder = async (path: string) => {
    try {
      await materialsApi.deleteFolder(path);
      addToast('文件夹已删除', 'success');
      setShowDeleteFolderConfirm(null);
      if (currentPath === path || currentPath.startsWith(path + '/')) {
        const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        await navigateTo(parentPath);
      } else {
        await refreshCurrent();
      }
      const tree = await materialsApi.tree();
      setFolderTree(tree.tree);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (!matSelected.size) return;
    await withDeleting(async () => {
      try {
        await materialsApi.delete([...matSelected]);
        matClearSelection();
        addToast(`已删除 ${matSelected.size} 张`, 'success');
        await refreshCurrent();
        const tree = await materialsApi.tree();
        setFolderTree(tree.tree);
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  const handleScoreAll = async () => {
    const paths = filteredFiles.map(f => f.path);
    if (!paths.length) { addToast('当前目录没有图片', 'info'); return; }
    await withScoring(async () => {
      try {
        const r = await materialsApi.score(paths);
        const m: Record<string, ScoreInfo> = {};
        for (const [path, info] of Object.entries(r.scores)) {
          m[path] = info;
        }
        setScoreMap(prev => ({ ...prev, ...m }));
        addToast(`评分完成：${r.vision_count} 张 AI 评分，${r.heuristic_count} 张启发式评分`, 'success');
      } catch (err: any) {
        addToast(err.message || '评分失败', 'error');
      }
    });
  };

  const handleBatchEnqueue = async () => {
    if (!matSelected.size) return;
    await withEnqueuing(async () => {
      const paths = [...matSelected];
      try {
        await queueApi.add({ title: '', desc: '', images: paths, cover: paths[0] });
        matClearSelection();
        addToast(`已加入发布队列`, 'success');
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  const openLightboxFor = (path: string) => {
    const all = [...currentFiles.map(f => f.path)];
    const idx = all.indexOf(path);
    openLightbox(all.map(lightboxSrc), idx >= 0 ? idx : 0);
  };

  const handleTreeFileClick = async (path: string) => {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    await navigateTo(parent);
    const files = useStore.getState().currentFiles;
    const all = files.map(f => f.path);
    const idx = all.indexOf(path);
    if (idx >= 0) {
      openLightbox(all.map(lightboxSrc), idx);
    } else {
      openLightbox([lightboxSrc(path)], 0);
    }
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDropOnFolder = async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;
    try {
      await materialsApi.moveItems([sourcePath], folderPath);
      addToast('已移动', 'success');
      if (currentPath && (currentPath === sourcePath || currentPath.startsWith(sourcePath + '/'))) {
        const parent = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
        await navigateTo(parent);
      } else {
        await refreshCurrent();
      }
      const tree = await materialsApi.tree();
      setFolderTree(tree.tree);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, target: string, type: 'file' | 'folder') => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, target, type });
  };
  const getCtxMenuItems = (): MenuItem[] => {
    if (!ctxMenu) return [];
    const { target, type } = ctxMenu;
    const name = target.split('/').pop() || '';
    if (type === 'folder') {
      return [
        { label: '打开', onClick: () => navigateTo(target) },
        { label: '重命名', onClick: () => { setRenameTarget({ path: target, name, type: 'folder' }); setRenameValue(name); } },
        { label: '删除文件夹', danger: true, onClick: () => setShowDeleteFolderConfirm(target) },
      ];
    }
    return [
      { label: '查看大图', onClick: () => openLightboxFor(target) },
      { label: '编辑标签', onClick: () => setTagEditorTarget(target) },
      { label: '重命名', onClick: () => { setRenameTarget({ path: target, name, type: 'file' }); setRenameValue(name); } },
      { label: '加入发布队列', onClick: async () => { try { await queueApi.add({ title: '', desc: '', images: [target], cover: target }); addToast('已加入发布队列', 'success'); } catch (err: any) { addToast(err.message, 'error'); } } },
      { label: name, disabled: true },
      { label: '删除此图片', danger: true, onClick: async () => { try { await materialsApi.delete([target]); addToast('已删除', 'success'); await refreshCurrent(); const t = await materialsApi.tree(); setFolderTree(t.tree); } catch (err: any) { addToast(err.message, 'error'); } } },
    ];
  };

  // Box selection: pointerdown on grid
  const handleGridPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-mat-path]') || target.closest('.folder-card')) return;
    const t = boxTracking.current;
    t.active = true;
    t.dragging = false;
    t.startX = e.clientX;
    t.startY = e.clientY;
    t.rect = null;
    e.preventDefault();
  }, []);

  // Global pointermove/pointerup for box selection
  useEffect(() => {
    const t = boxTracking.current;
    const onMove = (e: PointerEvent) => {
      if (!t.active) return;
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (!t.dragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        t.dragging = true;
        useStore.getState().matClearSelection();
      }
      if (t.dragging) {
        t.rect = {
          left: Math.min(t.startX, e.clientX),
          top: Math.min(t.startY, e.clientY),
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
        setBoxStyle({
          position: 'fixed',
          left: t.rect.left,
          top: t.rect.top,
          width: t.rect.width,
          height: t.rect.height,
          pointerEvents: 'none',
          zIndex: 9999,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!t.active) return;
      const rect = t.rect;
      if (t.dragging && rect && rect.width > 0 && rect.height > 0) {
        const selectedPaths: string[] = [];
        gridRef.current?.querySelectorAll('[data-mat-path]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (!(r.right < rect.left || r.left > rect.left + rect.width ||
                r.bottom < rect.top || r.top > rect.top + rect.height)) {
            const p = (el as HTMLElement).dataset.matPath;
            if (p) selectedPaths.push(p);
          }
        });
        if (e.ctrlKey || e.metaKey) {
          const existing = useStore.getState().matSelected;
          const next = new Set(existing);
          selectedPaths.forEach(p => next.add(p));
          useStore.getState().matSetSelection([...next]);
        } else {
          useStore.getState().matSetSelection(selectedPaths);
        }
      } else {
        useStore.getState().matClearSelection();
      }
      t.active = false;
      t.dragging = false;
      t.rect = null;
      setBoxStyle(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (loading && folderTree.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-hidden animate-in">
        <h1 className="text-2xl font-bold text-text tracking-tight shrink-0">本地素材</h1>
        <div className="flex-1 min-h-0 card flex items-center justify-center mt-4"><Loading text="加载中" /></div>
      </div>
    );
  }

  const allSelectable = [...filteredFiles.map(f => f.path), ...filteredFolders.map(f => f.path)];

  return (
    <div className="h-full flex flex-col overflow-hidden animate-in">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-text tracking-tight">本地素材</h1>
      </div>

      <div className="flex items-center gap-1 text-sm flex-wrap shrink-0 mt-4">
        {breadcrumb.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-text-muted mx-0.5">/</span>}
            {i < breadcrumb.length - 1 ? (
              <button className="breadcrumb-link" onClick={() => navigateTo(item.path)}>{item.name}</button>
            ) : (
              <span className="text-text-muted">{item.name}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {(allTags.length > 0 || allCelebrities.length > 0 || allScenes.length > 0) && (
        <div className="flex items-center gap-3 flex-wrap shrink-0 mt-4">
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">标签</span>
              <Select size="sm" value={filterTag} onChange={setFilterTag}
                options={[{ label: '全部', value: '' }, ...allTags.map(t => ({ label: t, value: t }))]} />
            </div>
          )}
          {allCelebrities.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">人物</span>
              <Select size="sm" value={filterCelebrity} onChange={setFilterCelebrity}
                options={[{ label: '全部', value: '' }, ...allCelebrities.map(c => ({ label: c, value: c }))]} />
            </div>
          )}
          {allScenes.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">场景</span>
              <Select size="sm" value={filterScene} onChange={setFilterScene}
                options={[{ label: '全部', value: '' }, ...allScenes.map(s => ({ label: s, value: s }))]} />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">使用状态</span>
            <Select size="sm" value={filterUsage} onChange={v => setFilterUsage(v as any)}
              options={[
                { label: '全部', value: 'all' },
                { label: '已使用', value: 'used' },
                { label: '未使用', value: 'unused' },
              ]} />
          </div>
          {(filterTag || filterCelebrity || filterScene || filterUsage !== 'all') && (
            <button className="text-xs text-accent hover:underline" onClick={() => { setFilterTag(''); setFilterCelebrity(''); setFilterScene(''); setFilterUsage('all'); }}>
              清除筛选
            </button>
          )}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0 mt-4">
        <div className="w-[220px] shrink-0 card p-2 overflow-y-auto">
          <FolderTree
            items={folderTree}
            currentPath={currentPath}
            onNavigate={navigateTo}
            expandedFolders={useStore.getState().expandedFolders}
            onToggle={toggleFolderExpanded}
            onContextMenu={handleContextMenu}
            dragOverFolder={dragOverFolder}
            setDragOverFolder={setDragOverFolder}
            onDrop={handleDropOnFolder}
            onDragOver={handleDragOver}
            onFileClick={handleTreeFileClick}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center gap-0.5 overflow-x-auto py-1.5 border-b border-border">
            <div className="flex bg-bg-base rounded-md p-0.5 border border-border shrink-0">
              <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="网格视图">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              </button>
              <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="列表视图">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="3" rx="1"/><rect x="1" y="6.5" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
              </button>
            </div>

            <div className="w-px h-4 bg-border mx-1.5 shrink-0" />

            <button className="toolbar-item" onClick={() => { setNewFolderName(''); setShowNewFolder(true); }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>新建文件夹</span>
            </button>

            <div className="w-px h-4 bg-border mx-1.5 shrink-0" />

            <button className="toolbar-item" onClick={() => matSelectAll(allSelectable)}>
              <span>{matSelected.size === allSelectable.length && allSelectable.length > 0 ? '取消全选' : '全选'}</span>
            </button>
            <button className="toolbar-item" onClick={handleScoreAll} disabled={scoring || !currentFiles.length}>
              {scoring ? <span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> : null}
              <span>{scoring ? '评分中' : 'AI 评分'}</span>
            </button>

            <div className="w-px h-4 bg-border mx-1.5 shrink-0" />

            <button className="toolbar-item" onClick={matClearSelection} disabled={!matSelected.size}>取消选择</button>
            <button className="toolbar-item" onClick={handleBatchEnqueue} disabled={!matSelected.size || enqueuing}>
              {enqueuing ? <span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> : null}
              <span>{enqueuing ? '加入中' : '加入发布队列'}</span>
            </button>
            <button className="toolbar-item text-danger hover:text-danger/80 disabled:text-text-muted/30" onClick={() => setShowBatchDeleteConfirm(true)} disabled={!matSelected.size || deleting}>
              <span>删除</span>
            </button>

            <div className="ml-auto text-xs text-text-muted tabular-nums whitespace-nowrap shrink-0">
              {filteredFolders.length + filteredFiles.length} 项
              {matSelected.size > 0 && <span className="ml-2">已选 <strong className="text-text">{matSelected.size}</strong></span>}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto mt-4">
            {loading ? (
              <div className="card flex items-center justify-center min-h-[300px]"><Loading text="加载中" /></div>
            ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
              <div className="card">
                <div className="empty-state py-16">
                  <div className="empty-state-icon">📁</div>
                  <div className="empty-state-title">此文件夹为空</div>
                  <div className="empty-state-desc">新建文件夹或上传图片</div>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <>
                <div ref={gridRef} className={`grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 ${boxStyle ? 'select-none' : ''}`}
                  onPointerDown={handleGridPointerDown}>
                  {filteredFolders.map(folder => (
                    <FolderCard
                      key={folder.path}
                      folder={folder}
                      onDoubleClick={() => navigateTo(folder.path)}
                      onContextMenu={(e) => handleContextMenu(e, folder.path, 'folder')}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnFolder(e, folder.path)}
                      isDragOver={dragOverFolder === folder.path}
                      setDragOver={(v) => setDragOverFolder(v ? folder.path : null)}
                    />
                  ))}
                  {filteredFiles.map((file, idx) => (
                    <div key={file.path} data-mat-path={file.path}
                      draggable
                      onDragStart={(e) => handleGridDragStart(e, idx, file.path)}
                      onDragOver={(e) => handleGridDragOver(e, idx)}
                      onDrop={(e) => handleGridDrop(e, idx)}
                      onDragEnd={handleGridDragEnd}
                      className={dragIndex !== null && idx !== dragIndex ? 'opacity-50' : ''}
                    >
                      <ImageCard
                        file={file}
                        selected={matSelected.has(file.path)}
                        onToggleSelect={() => matToggleSelect(file.path)}
                        onOpenLightbox={() => openLightboxFor(file.path)}
                        onContextMenu={(e) => handleContextMenu(e, file.path, 'file')}
                        scoreInfo={scoreMap[file.path] || null}
                        meta={metaMap[file.path] || null}
                      />
                      {dropIndex === idx && dragIndex !== null && dragIndex !== idx && (
                        <div className="absolute inset-0 rounded-xl border-2 border-accent pointer-events-none z-10" />
                      )}
                    </div>
                  ))}
                </div>
                {boxStyle && (
                  <div style={boxStyle} className="fixed pointer-events-none z-[9999] rounded border-2 border-accent bg-accent/10" />
                )}
              </>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-xs">
                      <th className="text-left py-2 px-3 font-medium">名称</th>
                      <th className="text-right py-2 px-3 font-medium w-20">大小</th>
                      <th className="text-right py-2 px-3 font-medium w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFolders.map(folder => (
                      <tr key={folder.path} className="border-b border-border/50 hover:bg-bg-base/50 cursor-pointer"
                        onDoubleClick={() => navigateTo(folder.path)}
                        onContextMenu={(e) => handleContextMenu(e, folder.path, 'folder')}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => handleDropOnFolder(e, folder.path)}
                      >
                        <td className="py-2 px-3 flex items-center gap-2">
                          <svg className="w-5 h-5 shrink-0 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
                          <span className="truncate">{folder.name}</span>
                          <span className="text-xs text-text-muted ml-auto">{folder.item_count} 张</span>
                        </td>
                        <td className="py-2 px-3 text-right text-text-muted">—</td>
                        <td className="py-2 px-3 text-right">
                          <button className="text-accent hover:underline text-xs" onClick={() => navigateTo(folder.path)}>打开</button>
                        </td>
                      </tr>
                    ))}
                    {filteredFiles.map(file => {
                      const s = scoreMap[file.path];
                      const m = metaMap[file.path];
                      return (
                        <tr key={file.path}
                          className={`border-b border-border/50 hover:bg-bg-base/50 ${matSelected.has(file.path) ? 'bg-accent/5' : ''}`}
                          onContextMenu={(e) => handleContextMenu(e, file.path, 'file')}
                          draggable
                          onDragStart={(e) => handleDragStart(e, file.path)}
                        >
                          <td className="py-2 px-3 flex items-center gap-2">
                            <Checkbox checked={matSelected.has(file.path)} onChange={() => matToggleSelect(file.path)} />
                            <LazyImage src={imgSrc(file.path)} alt="" className="w-8 h-8 rounded shrink-0" />
                            <span className="truncate">{file.name}</span>
                            {s && s.score > 0 && (
                              <span className={`ml-2 text-[10px] font-bold px-1 py-0.5 rounded ${s.score >= 70 ? 'text-success bg-success/10' : s.score >= 40 ? 'text-warning bg-warning/10' : 'text-danger bg-danger/10'}`}>
                                {s.score}
                              </span>
                            )}
                            {m?.used_count > 0 && (
                              <span className="text-[10px] text-accent bg-accent/5 px-1 py-0.5 rounded">使用 {m.used_count} 次</span>
                            )}
                            {m?.is_cover && (
                              <span className="text-[10px] text-warning bg-warning/5 px-1 py-0.5 rounded">封面</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-text-muted tabular-nums whitespace-nowrap">
                            {m?.source_platform && <span className="text-xs text-text-muted mr-2">{m.source_platform}</span>}
                            {formatSize(file.size)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button className="text-accent hover:underline text-xs" onClick={() => openLightboxFor(file.path)}>查看</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除"
        message={`确认删除 ${matSelected.size} 张图片？`} confirmText="删除" danger
        onConfirm={() => { setShowBatchDeleteConfirm(false); handleBatchDelete(); }}
        onCancel={() => setShowBatchDeleteConfirm(false)} />
      <ConfirmDialog open={!!showDeleteFolderConfirm} title="删除文件夹"
        message={`确认删除文件夹「${showDeleteFolderConfirm?.split('/').pop() || ''}」及其所有内容？`}
        confirmText="删除" danger
        onConfirm={() => { if (showDeleteFolderConfirm) handleDeleteFolder(showDeleteFolderConfirm); }}
        onCancel={() => setShowDeleteFolderConfirm(null)} />

      {ctxMenu && (
        <ContextMenu items={getCtxMenuItems()} position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)} />
      )}

      <Modal open={showNewFolder} onClose={() => setShowNewFolder(false)} className="w-80">
        <h3 className="text-sm font-bold text-text mb-3">新建文件夹</h3>
        <input type="text" className="w-full text-sm mb-3" placeholder="输入文件夹名称"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
          autoFocus />
        <div className="flex gap-2 justify-end">
          <button className="btn btn-sm" onClick={() => setShowNewFolder(false)}>取消</button>
          <button className="btn btn-sm btn-primary" onClick={handleCreateFolder} disabled={creating}>
            {creating ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 创建中</> : '确定'}
          </button>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} className="w-80">
        <h3 className="text-sm font-bold text-text mb-3">{renameTarget?.type === 'folder' ? '重命名文件夹' : '重命名文件'}</h3>
        <input ref={renameInputRef} type="text" className="w-full text-sm mb-3" value={renameValue}
          onChange={e => setRenameValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null); }}
          autoFocus />
        <div className="flex gap-2 justify-end">
          <button className="btn btn-sm" onClick={() => setRenameTarget(null)} disabled={renaming}>取消</button>
          <button className="btn btn-sm btn-primary" onClick={handleRename} disabled={renaming}>
            {renaming ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 重命名中</> : '确定'}
          </button>
        </div>
      </Modal>

      <TagEditorModal
        path={tagEditorTarget}
        meta={tagEditorTarget ? metaMap[tagEditorTarget] || null : null}
        onClose={() => setTagEditorTarget(null)}
        onSaved={() => { setTagEditorTarget(null); loadScoresAndMeta(); }}
        addToast={addToast}
      />
    </div>
  );
}
