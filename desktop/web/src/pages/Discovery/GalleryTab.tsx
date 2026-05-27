import Checkbox from '../../components/Checkbox';
import LazyImage from './LazyImage';
import { lightboxSrc } from './utils';

export default function GalleryTab({
  allLocalImages, galleryGroups, selectedImages,
  onToggleImageSelect, onSelectAllImages,
  onEnqueueSelected, onOpenLightbox,
  enqueuing, imgSrc, thumbSrc,
}: {
  allLocalImages: any[]; galleryGroups: any[]; selectedImages: string[];
  onToggleImageSelect: (path: string) => void; onSelectAllImages: (paths: string[]) => void;
  onEnqueueSelected: () => void; onOpenLightbox: (paths: string[], index: number) => void;
  enqueuing: boolean; imgSrc: (p: string) => string; thumbSrc: (p: string) => string;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            共 <strong className="text-text font-semibold tabular-nums">{allLocalImages.length}</strong> 张
          </span>
          <span className="text-xs text-text-muted">
            已选 <strong className="text-accent font-semibold tabular-nums">{selectedImages.length}</strong>
          </span>
        </div>
        {selectedImages.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={onEnqueueSelected} disabled={enqueuing}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            {enqueuing ? '加入中…' : '加入发布队列'}
          </button>
        )}
      </div>
      <div className="space-y-6">
        {galleryGroups.map((group: any) => {
          const groupPaths = group.images.map((i: any) => i.path);
          const allSelected = groupPaths.every((p: string) => selectedImages.includes(p));
          return (
            <div key={group.postIndex}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-text truncate">{group.celebrity}</span>
                <span className="text-xs text-text-muted shrink-0">{group.scene}</span>
                <span className="text-xs text-text-muted shrink-0">· {group.images.length} 张</span>
                <button className="btn btn-sm ml-auto" onClick={() => !allSelected ? onSelectAllImages(groupPaths) : groupPaths.forEach((p: string) => onToggleImageSelect(p))}>
                  {allSelected ? '取消' : '全选'}
                </button>
              </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
              {group.images.map((item: any) => {
                const s = item.scoreInfo;
                const scoreClass = s.score >= 70 ? 'score-high' : s.score >= 40 ? 'score-mid' : 'score-low';
                const isSel = selectedImages.includes(item.path);
                return (
                  <div key={item.path} className={`bg-bg-card border rounded-xl overflow-hidden transition-all ${
                    isSel ? 'ring-1 ring-accent border-accent' : 'border-border hover:border-accent/40 hover:shadow-sm'
                  }`}>
                    <div className="relative">
                      <LazyImage src={thumbSrc(item.path)} className="w-full h-[150px] cursor-pointer" onClick={() => { const paths = allLocalImages.map((x: any) => lightboxSrc(x.path)); onOpenLightbox(paths, allLocalImages.findIndex((x: any) => x.path === item.path)); }} />
                      <div className={`absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[11px] font-bold ${scoreClass}`}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        {s.score}
                      </div>
                    </div>
                    <div className="px-2.5 py-2 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-text-muted truncate max-w-[110px]">{s.reason || '未评分'}</span>
                      <Checkbox checked={isSel} onChange={() => onToggleImageSelect(item.path)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}
