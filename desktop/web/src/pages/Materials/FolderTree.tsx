import type { TreeNode } from '../../api/client';

export default function FolderTree({
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
      <div
        className={`folder-tree-item ${currentPath === '' ? 'active' : ''} ${dragOverFolder === '' ? 'drag-over' : ''}`}
        style={{ paddingLeft: '12px' }}
        onClick={() => onNavigate('')}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', '');
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => { onDragOver(e); setDragOverFolder(''); }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(e) => onDrop(e, '')}
      >
        <span className="w-3 shrink-0" />
        <svg className="w-4 h-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
        <span className="truncate text-sm font-medium">全部素材</span>
      </div>
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
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', node.path);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => { onDragOver(e); setDragOverFolder(node.path); }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(e) => onDrop(e, node.path)}
      >
        {node.children.length > 0 ? (
          <span
            className={`tree-arrow ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        ) : <span className="w-3 shrink-0" />}
        <svg className="w-4 h-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 3h9a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>
        <span className="truncate text-sm">{node.name}</span>
        <span className="ml-auto text-[10px] text-text-muted tabular-nums">{node.item_count}</span>
      </div>
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
