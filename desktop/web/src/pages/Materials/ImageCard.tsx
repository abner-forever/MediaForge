import Checkbox from '../../components/Checkbox';
import { imgSrc, formatSize } from './utils';
import type { BrowseFile, ScoreInfo, MaterialMeta } from '../../api/client';
import LazyImage from '../Discovery/LazyImage';

export default function ImageCard({
  file, selected, onToggleSelect, onOpenLightbox, onContextMenu, scoreInfo, meta,
}: {
  file: BrowseFile;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenLightbox: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  scoreInfo?: ScoreInfo | null;
  meta?: MaterialMeta | null;
}) {
  const s = scoreInfo || { score: 0, reason: '未评分', method: 'none' };
  const scoreClass = s.score >= 70 ? 'score-high' : s.score >= 40 ? 'score-mid' : 'score-low';

  return (
    <div
      className={`relative rounded-xl overflow-hidden border transition-all group/image ${selected ? 'border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}
      onContextMenu={onContextMenu}
    >
      <div className="relative bg-bg-secondary">
        <LazyImage src={imgSrc(file.path)} alt="" className="w-full h-[150px] cursor-pointer" imgClassName="object-contain" onClick={onOpenLightbox} />
        <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors pointer-events-none rounded-t-xl" />
        {s.score > 0 && (
          <div className={`absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none ${scoreClass}`}
            title={s.reason}>
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            {s.score}
          </div>
        )}
        {meta && meta.used_count > 0 && (
          <div className="absolute top-2 right-8 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 leading-none">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {meta.used_count}
          </div>
        )}
        {meta && meta.is_cover && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-warning/10 text-warning border border-warning/20 leading-none">
            封面
          </div>
        )}
        {meta && meta.source_platform && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-bg-card/70 text-text-muted border border-border/50 leading-none backdrop-blur">
            {meta.source_platform}
          </div>
        )}
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
        {s.score > 0 && (
          <div className="text-[9px] text-text-muted/60 truncate mt-0.5" title={s.reason}>{s.reason}</div>
        )}
        {s.score === 0 && <div className="text-[9px] text-text-muted/60 tabular-nums mt-0.5">{formatSize(file.size)}</div>}
      </div>
    </div>
  );
}
