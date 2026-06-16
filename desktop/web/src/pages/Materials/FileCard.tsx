import Checkbox from '../../components/Checkbox';
import { formatSize } from '../../utils/file';
import type { BrowseFile } from '../../types';

export default function FileCard({
  file,
  selected,
  onToggleSelect,
  onOpenPreview,
  onContextMenu,
}: {
  file: BrowseFile;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenPreview: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const isPdf = file.suffix === '.pdf';
  const isMd = file.suffix === '.md';
  const isTxt = file.suffix === '.txt';

  // 根据后缀显示不同图标
  const Icon = () => {
    if (isPdf) return <PdfIcon />;
    if (isMd) return <MdIcon />;
    if (isTxt) return <TxtIcon />;
    return <FileIcon />;
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden border transition-all group/file cursor-pointer ${selected ? 'border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}
      onContextMenu={onContextMenu}
      onClick={onOpenPreview}
    >
      <div className="flex items-center justify-center h-[150px] bg-bg-secondary">
        {Icon()}
      </div>
      <div
        className="absolute top-2 right-2 opacity-0 group-hover/file:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onChange={onToggleSelect} />
      </div>
      {selected && (
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
        </div>
      )}
      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 leading-none">
        {file.suffix.toUpperCase()}
      </div>
      <div className="px-2.5 py-1.5">
        <div className="text-[11px] text-text whitespace-nowrap overflow-hidden text-ellipsis">
          {file.name}
        </div>
        <div className="text-[9px] text-text-muted/60 tabular-nums mt-0.5">
          {formatSize(file.size)}
        </div>
      </div>
    </div>
  );
}

/* ── SVG Icons ── */

function PdfIcon() {
  return (
    <svg className="w-12 h-12 text-red-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 0c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v1zm5 2.5H20V9h-2.5v1.5h-1V9H14v4h1.5v-1.5h1V13H17v-1.5zM6 20h14v2H6c-1.1 0-2-.9-2-2V6h2v14z" />
    </svg>
  );
}

function MdIcon() {
  return (
    <svg className="w-12 h-12 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
    </svg>
  );
}

function TxtIcon() {
  return (
    <svg className="w-12 h-12 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-12 h-12 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
    </svg>
  );
}
