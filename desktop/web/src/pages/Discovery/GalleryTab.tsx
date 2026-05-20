import Checkbox from '../../components/Checkbox';

export default function GalleryTab({
  allLocalImages, galleryGroups, selectedImages,
  onToggleImageSelect, onSelectAllImages,
  onEnqueueSelected, onOpenLightbox,
  enqueuing, imgSrc,
}: {
  allLocalImages: any[]; galleryGroups: any[]; selectedImages: string[];
  onToggleImageSelect: (path: string) => void; onSelectAllImages: (paths: string[]) => void;
  onEnqueueSelected: () => void; onOpenLightbox: (paths: string[], index: number) => void;
  enqueuing: boolean; imgSrc: (p: string) => string;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-text-muted">已选 <strong className="text-text tabular-nums">{selectedImages.length}</strong></span>
        {selectedImages.length > 0 && <button className="btn btn-primary btn-xs" onClick={onEnqueueSelected} disabled={enqueuing}>
          {enqueuing ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 加入中</> : '加入发布队列'}
        </button>}
      </div>
      <div className="space-y-6">
        {galleryGroups.map((group: any) => {
          const groupPaths = group.images.map((i: any) => i.path);
          const allSelected = groupPaths.every((p: string) => selectedImages.includes(p));
          return (
            <div key={group.postIndex}>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="text-sm font-semibold text-text truncate">{group.celebrity}</span>
                <span className="text-xs text-text-muted shrink-0">· {group.scene}</span>
                <span className="text-xs text-text-muted shrink-0">({group.images.length} 张)</span>
                <button className="btn btn-xs ml-auto" onClick={() => onSelectAllImages(groupPaths)}>
                  {allSelected ? '取消' : '全选'}
                </button>
              </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {group.images.map((item: any) => {
                const s = item.scoreInfo;
                const scoreClass = s.score >= 70 ? 'score-high' : s.score >= 40 ? 'score-mid' : 'score-low';
                const isSel = selectedImages.includes(item.path);
                return (
                  <div key={item.path} className={`bg-bg-card border rounded-xl overflow-hidden transition-all ${isSel ? 'ring-2 ring-accent border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}>
                    <div className="relative">
                      <img src={imgSrc(item.path)} alt="" className="w-full h-[160px] object-cover cursor-pointer" onClick={() => { const paths = allLocalImages.map((x: any) => imgSrc(x.path)); onOpenLightbox(paths, allLocalImages.findIndex((x: any) => x.path === item.path)); }} loading="lazy" />
                      <span className={`score-badge absolute top-2 left-2 ${scoreClass}`}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        {s.score}
                      </span>
                    </div>
                    <div className="px-2.5 py-2 flex items-center justify-between">
                      <span className="text-[10px] text-text-muted truncate max-w-[110px]">{s.reason}</span>
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
