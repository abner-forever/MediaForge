import Checkbox from '../../components/Checkbox';
import { imgSrc, formatSize } from './utils';
import type { BrowseFile } from '../../api/client';

export default function ImageCard({
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
      className={`relative rounded-xl overflow-hidden border transition-all group/image ${selected ? 'border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
    >
      <div className="relative">
        <img src={imgSrc(file.path)} alt="" className="w-full h-[150px] object-cover cursor-pointer" onClick={onOpenLightbox} loading="lazy" />
        <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors pointer-events-none rounded-t-xl" />
        <div className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </div>
        {selected && (
          <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
            <Checkbox checked={selected} onChange={onToggleSelect} />
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
