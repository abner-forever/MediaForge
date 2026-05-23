import { useState } from 'react';
import Checkbox from '../../components/Checkbox';
import Loading from '../../components/Loading';
import { fmtTime } from './utils';

const MAX_PREVIEW = 6;

export default function PostList({
  filteredIndices, discoveryPosts, selectedPosts, allLocalImages,
  onTogglePostSelect, onHandleSelectAllFiltered,
  onDownload, onRemovePost, setRemoveConfirmIndex,
  onOpenLightbox, downloading, loadMore, searching, currentPage, minImages,
  imgSrc, thumbSrc,
}: {
  filteredIndices: number[]; discoveryPosts: any[]; selectedPosts: Set<number>; allLocalImages: any[];
  onTogglePostSelect: (i: number) => void; onHandleSelectAllFiltered: () => void;
  onDownload: (indices: string) => void; onRemovePost: (i: number) => void; setRemoveConfirmIndex: (i: number | null) => void;
  onOpenLightbox: (pi: number, ii: number) => void;
  downloading: boolean; loadMore: () => void; searching: boolean; currentPage: number;
  minImages: number; imgSrc: (p: string) => string; thumbSrc: (p: string) => string;
}) {
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  function toggleExpand(origIdx: number) {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(origIdx)) next.delete(origIdx);
      else next.add(origIdx);
      return next;
    });
  }

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
            const isExpanded = expandedPosts.has(origIdx);
            const showImgs = isExpanded ? displayImgs : displayImgs.slice(0, MAX_PREVIEW);
            const hiddenCount = displayImgs.length - MAX_PREVIEW;
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
                    {showImgs.map((img: string, ii: number) => (
                      <div key={ii} className="w-[80px] h-[80px] rounded-xl border border-border overflow-hidden bg-bg-secondary relative">
                        <img src={thumbSrc(img)} alt="" className="w-full h-full object-cover cursor-pointer transition-all hover:border-accent hover:shadow-md hover:-translate-y-0.5" onClick={() => onOpenLightbox(origIdx, ii)} onError={e => { e.currentTarget.style.display = 'none'; const parent = e.currentTarget.parentElement; if (parent) { const placeholder = parent.querySelector('.img-placeholder') as HTMLElement; if (placeholder) placeholder.style.display = 'flex'; } }} loading="lazy" />
                        <div className="img-placeholder absolute inset-0 hidden items-center justify-center bg-bg-secondary">
                          <img src="/static/logo.png" alt="" className="w-6 h-6 opacity-30" />
                        </div>
                      </div>
                    ))}
                    {hiddenCount > 0 && !isExpanded && (
                      <button
                        className="w-[80px] h-[80px] rounded-xl border border-border flex items-center justify-center text-xs text-text-muted bg-bg-secondary hover:bg-bg-tertiary hover:border-accent/50 transition-all cursor-pointer"
                        onClick={() => toggleExpand(origIdx)}
                        title="展开全部图片"
                      >
                        +{hiddenCount}
                      </button>
                    )}
                    {isExpanded && displayImgs.length > MAX_PREVIEW && (
                      <button
                        className="w-[80px] h-[80px] rounded-xl border border-border flex items-center justify-center text-xs text-text-muted bg-bg-secondary hover:bg-bg-tertiary hover:border-accent/50 transition-all cursor-pointer"
                        onClick={() => toggleExpand(origIdx)}
                        title="收起图片"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
                      </button>
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
