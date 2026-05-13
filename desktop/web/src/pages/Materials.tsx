import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../stores';
import { materialsApi, queueApi } from '../api/client';
import type { TreeNode, BrowseFolder, BrowseFile } from '../api/client';
import ContextMenu, { type MenuItem } from '../components/ContextMenu';
import ConfirmDialog from '../components/ConfirmDialog';
import { useLoading } from '../hooks/useLoading';

const imgSrc = (p: string) => {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
  if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
};

const formatSize = (bytes: number) => {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
};

export default function Materials() {
  const {
    folderTree, currentPath, currentFolders, currentFiles, breadcrumb,
    matSelected, viewMode,
    setFolderTree, setCurrentPath, setCurrentFolders, setCurrentFiles, setBreadcrumb,
    toggleFolderExpanded, matToggleSelect, matSelectAll, matClearSelection, setViewMode,
    openLightbox, addToast,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState<string | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: string; type: 'file' | 'folder' } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const { loading: creating, withLoading: withCreating } = useLoading();
  const { loading: enqueuing, withLoading: withEnqueuing } = useLoading();
  const { loading: deleting, withLoading: withDeleting } = useLoading();

  // 初始化加载
  useEffect(() => {
    Promise.all([
      materialsApi.tree().then(r => setFolderTree(r.tree)),
      materialsApi.browse('').then(r => {
        setCurrentFolders(r.folders);
        setCurrentFiles(r.files);
        setBreadcrumb(r.breadcrumb);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  // 导航到文件夹
  const navigateTo = useCallback(async (path: string) => {
    setLoading(true);
    setCurrentPath(path);
    matClearSelection();
    try {
      const r = await materialsApi.browse(path || '');
      setCurrentFolders(r.folders);
      setCurrentFiles(r.files);
      setBreadcrumb(r.breadcrumb);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // 刷新当前目录
  const refreshCurrent = useCallback(async () => {
    try {
      const r = await materialsApi.browse(currentPath || '');
      setCurrentFolders(r.folders);
      setCurrentFiles(r.files);
      setBreadcrumb(r.breadcrumb);
    } catch { /* ignore */ }
  }, [currentPath]);

  // 新建文件夹
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await withCreating(async () => {
      try {
        await materialsApi.createFolder(currentPath, newFolderName.trim());
        addToast('文件夹已创建', 'success');
        setNewFolderName('');
        setShowNewFolder(false);
        await refreshCurrent();
        // 刷新树
        const tree = await materialsApi.tree();
        setFolderTree(tree.tree);
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  // 重命名文件夹
  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await materialsApi.renameFolder(renameTarget.path, renameValue.trim());
      addToast('已重命名', 'success');
      setRenameTarget(null);
      await refreshCurrent();
      const tree = await materialsApi.tree();
      setFolderTree(tree.tree);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // 删除文件夹
  const handleDeleteFolder = async (path: string) => {
    try {
      await materialsApi.deleteFolder(path);
      addToast('文件夹已删除', 'success');
      setShowDeleteFolderConfirm(null);
      await refreshCurrent();
      const tree = await materialsApi.tree();
      setFolderTree(tree.tree);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // 批量删除文件
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

  // 批量加入队列
  const handleBatchEnqueue = async () => {
    if (!matSelected.size) return;
    await withEnqueuing(async () => {
      const paths = [...matSelected];
      try {
        await queueApi.add({ title: '', desc: '', images: paths, cover: paths[0] });
        matClearSelection();
        addToast(`已加入队列`, 'success');
      } catch (err: any) {
        addToast(err.message, 'error');
      }
    });
  };

  // 打开图片灯箱
  const openLightboxFor = (path: string) => {
    const all = [...currentFiles.map(f => f.path)];
    const idx = all.indexOf(path);
    openLightbox(all.map(imgSrc), idx >= 0 ? idx : 0);
  };

  // 拖拽处理
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
      await refreshCurrent();
      const tree = await materialsApi.tree();
      setFolderTree(tree.tree);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // 右键菜单
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
        { label: '重命名', onClick: () => { setRenameTarget({ path: target, name }); setRenameValue(name); } },
        { label: `删除文件夹`, danger: true, onClick: () => setShowDeleteFolderConfirm(target) },
      ];
    }
    return [
      { label: '查看大图', onClick: () => openLightboxFor(target) },
      { label: '加入发布队列', onClick: async () => { try { await queueApi.add({ title: '', desc: '', images: [target], cover: target }); addToast('已加入队列', 'success'); } catch (err: any) { addToast(err.message, 'error'); } } },
      { label: name, disabled: true },
      { label: '删除此图片', danger: true, onClick: async () => { try { await materialsApi.delete([target]); addToast('已删除', 'success'); await refreshCurrent(); const t = await materialsApi.tree(); setFolderTree(t.tree); } catch (err: any) { addToast(err.message, 'error'); } } },
    ];
  };

  if (loading && folderTree.length === 0) {
    return (
      <div className="space-y-6 animate-in">
        <h1 className="text-2xl font-bold text-text tracking-tight">本地素材</h1>
        <div className="card flex items-center justify-center py-20 text-text-muted">加载中...</div>
      </div>
    );
  }

  const allSelectable = [...currentFiles.map(f => f.path), ...currentFolders.map(f => f.path)];

  return (
    <div className="space-y-4 animate-in">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text tracking-tight">本地素材</h1>
        <span className="text-xs text-text-muted">拖拽图片到左侧文件夹即可移动</span>
      </div>

      {/* 面包屑 */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
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

      {/* 主体：双栏布局 */}
      <div className="flex gap-4 min-h-[600px]">
        {/* 左侧文件夹树 */}
        <div className="w-[220px] shrink-0 card p-2 overflow-y-auto max-h-[75vh]">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2">文件夹</div>
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
          />
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* 工具栏 */}
          <div className="card p-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 视图切换 */}
              <div className="flex bg-bg-base rounded-lg p-0.5 border border-border">
                <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="网格视图">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                </button>
                <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="列表视图">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="3" rx="1"/><rect x="1" y="6.5" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
                </button>
              </div>

              <div className="w-px h-5 bg-border mx-1" />

              {/* 新建文件夹 */}
              <button className="btn btn-sm" onClick={() => { setNewFolderName(''); setShowNewFolder(true); }}>
                <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                新建文件夹
              </button>

              <div className="w-px h-5 bg-border mx-1" />

              {/* 选择操作 */}
              <button className="btn btn-sm" onClick={() => matSelectAll(allSelectable)}>
                {matSelected.size === allSelectable.length && allSelectable.length > 0 ? '取消全选' : '全选'}
              </button>
              <button className="btn btn-sm" onClick={matClearSelection} disabled={!matSelected.size}>取消选择</button>
              <button className="btn btn-sm" onClick={handleBatchEnqueue} disabled={!matSelected.size || enqueuing}>
                {enqueuing ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 加入中</> : '加入队列'}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => setShowBatchDeleteConfirm(true)} disabled={!matSelected.size || deleting}>删除</button>

              <div className="ml-auto text-xs text-text-muted tabular-nums">
                {currentFolders.length + currentFiles.length} 项
                {matSelected.size > 0 && <span className="ml-2">已选 <strong className="text-text">{matSelected.size}</strong></span>}
              </div>
            </div>
          </div>

          {/* 内容区 */}
          {loading ? (
            <div className="card flex items-center justify-center py-20 text-text-muted">加载中...</div>
          ) : currentFolders.length === 0 && currentFiles.length === 0 ? (
            <div className="card">
              <div className="empty-state py-16">
                <div className="empty-state-icon">📁</div>
                <div className="empty-state-title">此文件夹为空</div>
                <div className="empty-state-desc">新建文件夹或上传图片</div>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {/* 文件夹卡片 */}
              {currentFolders.map(folder => (
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
              {/* 图片卡片 */}
              {currentFiles.map(file => (
                <ImageCard
                  key={file.path}
                  file={file}
                  selected={matSelected.has(file.path)}
                  onToggleSelect={() => matToggleSelect(file.path)}
                  onOpenLightbox={() => openLightboxFor(file.path)}
                  onContextMenu={(e) => handleContextMenu(e, file.path, 'file')}
                  onDragStart={(e) => handleDragStart(e, file.path)}
                />
              ))}
            </div>
          ) : (
            /* 列表视图 */
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
                  {currentFolders.map(folder => (
                    <tr key={folder.path} className="border-b border-border/50 hover:bg-bg-base/50 cursor-pointer"
                      onDoubleClick={() => navigateTo(folder.path)}
                      onContextMenu={(e) => handleContextMenu(e, folder.path, 'folder')}
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
                  {currentFiles.map(file => (
                    <tr key={file.path}
                      className={`border-b border-border/50 hover:bg-bg-base/50 ${matSelected.has(file.path) ? 'bg-accent/5' : ''}`}
                      onContextMenu={(e) => handleContextMenu(e, file.path, 'file')}
                    >
                      <td className="py-2 px-3 flex items-center gap-2">
                        <input type="checkbox" checked={matSelected.has(file.path)} onChange={() => matToggleSelect(file.path)}
                          className="w-3.5 h-3.5 accent-accent rounded shrink-0" />
                        <img src={imgSrc(file.path)} alt="" className="w-8 h-8 object-cover rounded shrink-0" loading="lazy" />
                        <span className="truncate">{file.name}</span>
                      </td>
                      <td className="py-2 px-3 text-right text-text-muted tabular-nums whitespace-nowrap">
                        {formatSize(file.size)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button className="text-accent hover:underline text-xs" onClick={() => openLightboxFor(file.path)}>查看</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除"
        message={`确认删除 ${matSelected.size} 张图片？`} confirmText="删除" danger
        onConfirm={() => { setShowBatchDeleteConfirm(false); handleBatchDelete(); }}
        onCancel={() => setShowBatchDeleteConfirm(false)} />
      <ConfirmDialog open={!!showDeleteFolderConfirm} title="删除文件夹"
        message={`确认删除文件夹「${showDeleteFolderConfirm?.split('/').pop() || ''}」及其所有内容？`}
        confirmText="删除" danger
        onConfirm={() => { if (showDeleteFolderConfirm) handleDeleteFolder(showDeleteFolderConfirm); }}
        onCancel={() => setShowDeleteFolderConfirm(null)} />

      {/* 右键菜单 */}
      {ctxMenu && (
        <ContextMenu items={getCtxMenuItems()} position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)} />
      )}

      {/* 新建文件夹对话框 */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewFolder(false)}>
          <div className="card p-4 w-80" onClick={e => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {/* 重命名对话框 */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setRenameTarget(null)}>
          <div className="card p-4 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text mb-3">重命名文件夹</h3>
            <input type="text" className="w-full text-sm mb-3" value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null); }}
              autoFocus />
            <div className="flex gap-2 justify-end">
              <button className="btn btn-sm" onClick={() => setRenameTarget(null)}>取消</button>
              <button className="btn btn-sm btn-primary" onClick={handleRename}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 子组件 ───────────────────────────────── */

function FolderTree({
  items, currentPath, onNavigate, expandedFolders, onToggle,
  onContextMenu, dragOverFolder, setDragOverFolder, onDrop, onDragOver,
}: {
  items: TreeNode[]; currentPath: string;
  onNavigate: (path: string) => void;
  expandedFolders: Set<string>; onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'folder') => void;
  dragOverFolder: string | null; setDragOverFolder: (path: string | null) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  return (
    <div className="space-y-0.5">
      {items.map(node => (
        <FolderTreeItem
          key={node.path}
          node={node}
          currentPath={currentPath}
          onNavigate={onNavigate}
          expandedFolders={expandedFolders}
          onToggle={onToggle}
          depth={0}
          onContextMenu={onContextMenu}
          dragOverFolder={dragOverFolder}
          setDragOverFolder={setDragOverFolder}
          onDrop={onDrop}
          onDragOver={onDragOver}
        />
      ))}
    </div>
  );
}

function FolderTreeItem({
  node, currentPath, onNavigate, expandedFolders, onToggle, depth,
  onContextMenu, dragOverFolder, setDragOverFolder, onDrop, onDragOver,
}: {
  node: TreeNode; currentPath: string;
  onNavigate: (path: string) => void;
  expandedFolders: Set<string>; onToggle: (path: string) => void; depth: number;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'folder') => void;
  dragOverFolder: string | null; setDragOverFolder: (path: string | null) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isActive = currentPath === node.path;
  const isDragOver = dragOverFolder === node.path;

  return (
    <div>
      <div
        className={`folder-tree-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onNavigate(node.path)}
        onContextMenu={(e) => onContextMenu(e, node.path, 'folder')}
        onDragOver={(e) => { onDragOver(e); setDragOverFolder(node.path); }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(e) => onDrop(e, node.path)}
      >
        {/* 展开/折叠箭头 */}
        {node.children.length > 0 ? (
          <span
            className={`tree-arrow ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        ) : <span className="w-3 shrink-0" />}
        {/* 文件夹图标 */}
        <svg className="w-4 h-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
        <span className="truncate text-sm">{node.name}</span>
        <span className="ml-auto text-[10px] text-text-muted tabular-nums">{node.item_count}</span>
      </div>
      {/* 子节点 */}
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <FolderTreeItem
              key={child.path}
              node={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              expandedFolders={expandedFolders}
              onToggle={onToggle}
              depth={depth + 1}
              onContextMenu={onContextMenu}
              dragOverFolder={dragOverFolder}
              setDragOverFolder={setDragOverFolder}
              onDrop={onDrop}
              onDragOver={onDragOver}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderCard({
  folder, onDoubleClick, onContextMenu, onDragOver, onDrop, isDragOver, setDragOver,
}: {
  folder: BrowseFolder;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
  setDragOver: (v: boolean) => void;
}) {
  return (
    <div
      className={`folder-card ${isDragOver ? 'drag-over' : ''}`}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={(e) => { onDragOver(e); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop(e); }}
    >
      <div className="folder-card-icon">
        <svg className="w-10 h-10 text-accent" viewBox="0 0 48 48" fill="currentColor">
          <path d="M6 14a4 4 0 014-4h10l4 6h18a4 4 0 014 4v16a4 4 0 01-4 4H10a4 4 0 01-4-4V14z" opacity="0.9"/>
          <path d="M6 14a4 4 0 014-4h10l4 6h18a4 4 0 014 4v2H6v-8z" opacity="0.15"/>
        </svg>
      </div>
      <div className="folder-card-name">{folder.name}</div>
      <div className="folder-card-count">{folder.item_count} 张</div>
    </div>
  );
}

function ImageCard({
  file, selected, onToggleSelect, onOpenLightbox, onContextMenu, onDragStart,
}: {
  file: BrowseFile;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenLightbox: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`relative rounded-xl overflow-hidden border transition-all group/image ${selected ? 'ring-2 ring-accent border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
    >
      <div className="relative">
        <img src={imgSrc(file.path)} alt="" className="w-full h-[150px] object-cover cursor-pointer" onClick={onOpenLightbox} loading="lazy" />
        <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors pointer-events-none rounded-t-xl" />
        {/* 选择框 */}
        <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 accent-accent rounded cursor-pointer" />
        </div>
        {selected && (
          <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="w-4 h-4 accent-accent rounded cursor-pointer" />
          </div>
        )}
      </div>
      <div className="px-2.5 py-1.5">
        <div className="text-[10px] text-text-muted truncate">{file.name}</div>
        {!selected && <div className="text-[9px] text-text-muted/60 tabular-nums mt-0.5">{formatSize(file.size)}</div>}
      </div>
    </div>
  );
}
