import Checkbox from '../../components/Checkbox';
import Loading from '../../components/Loading';
import { fmtTime } from './utils';

export default function PostList({
  filteredIndices, discoveryPosts, selectedPosts, allLocalImages,
  onTogglePostSelect, onHandleSelectAllFiltered,
  onDownload, onRemovePost, setRemoveConfirmIndex,
  onOpenLightbox, downloading, loadMore, searching, currentPage, minImages,
  imgSrc,
}: {
  filteredIndices: number[]; discoveryPosts: any[]; selectedPosts: Set<number>; allLocalImages: any[];
  onTogglePostSelect: (i: number) => void; onHandleSelectAllFiltered: () => void;
  onDownload: (indices: string) => void; onRemovePost: (i: number) => void; setRemoveConfirmIndex: (i: number | null) => void;
  onOpenLightbox: (pi: number, ii: number) => void;
  downloading: boolean; loadMore: () => void; searching: boolean; currentPage: number;
  minImages: number; imgSrc: (p: string) => string;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        {allLocalImages.length > 0 && <span className="tag tag-accent">已下载 {allLocalImages.length} 张</span>}
        <button className="btn btn-xs ml-auto" onClick={onHandleSelectAllFiltered}>全选/取消</button>
      </div>
      {filteredIndices.length > 0 ? (
        <div className="space-y-3">
          {filteredIndices.map((origIdx) => {
            const p = discoveryPosts[origIdx];
            const imgs = p.local_images || [];
            const remoteImgs = p.images || [];
            const displayImgs = imgs.length ? imgs : remoteImgs;
            const isChecked = selectedPosts.has(origIdx);
            return (
              <div key={origIdx} className={`rounded-xl p-4 border transition-all ${isChecked ? 'bg-accent-soft border-accent' : 'bg-bg-card border-border hover:border-accent/30'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox checked={isChecked} onChange={() => onTogglePostSelect(origIdx)} />
                    <span className="text-sm font-semibold text-text">{p.celebrity}</span>
                    {p.screen_name && (
                      p.screen_name === p.celebrity
                        ? <span className="tag tag-accent text-[10px]">本人</span>
                        : <span className="tag text-[10px]">@{p.screen_name}</span>
                    )}
                    <span className="tag text-[10px]">{p.scene}</span>
                    <span className="text-xs text-text-muted">{remoteImgs.length} 张图{imgs.length ? ` · 已下载 ${imgs.length}` : ''}</span>
                    {p.created_at && <span className="text-xs text-text-muted">{fmtTime(p.created_at)}</span>}
                    <div className="ml-auto flex gap-1">
                      <button className="btn btn-xs btn-ghost" onClick={() => onDownload(String(origIdx))} disabled={downloading}>下载</button>
                      <button className="btn btn-xs btn-ghost text-text-muted hover:text-danger" onClick={() => setRemoveConfirmIndex(origIdx)}>删除</button>
                    </div>
                  </div>
                  {p.text && <div className="text-xs text-text-muted mb-3 line-clamp-2 leading-relaxed">{p.text.slice(0, 100)}</div>}
                  <div className="flex flex-wrap gap-2">
                    {displayImgs.slice(0, 12).map((img: string, ii: number) => (
                      <img key={ii} src={imgSrc(img)} alt="" className="w-[80px] h-[80px] object-cover rounded-xl border border-border cursor-pointer transition-all hover:border-accent hover:shadow-md hover:-translate-y-0.5" onClick={() => onOpenLightbox(origIdx, ii)} onError={e => (e.currentTarget.style.display = 'none')} loading="lazy" />
                    ))}
                    {displayImgs.length > 12 && (
                      <div className="w-[80px] h-[80px] rounded-xl border border-border flex items-center justify-center text-xs text-text-muted bg-bg-secondary">+{displayImgs.length - 12}</div>
                    )}
                  </div>
                </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm">没有图片数 ≥ {minImages} 的帖子</div>
      )}
      {filteredIndices.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-border mt-4">
          <span className="text-sm text-text-muted">第 {currentPage} 页</span>
          <button className="btn" onClick={loadMore} disabled={searching}>
            {searching ? <Loading size="sm" inline text="加载中" /> : '加载更多'}
          </button>
        </div>
      )}
    </>
  );
}
