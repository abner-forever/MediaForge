import type { BrowseFolder } from '../../api/client';

export default function FolderCard({
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
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', folder.path);
        e.dataTransfer.effectAllowed = 'move';
      }}
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
