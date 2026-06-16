import { useState } from 'react';
import Checkbox from '../../components/Checkbox';
import Loading from '../../components/Loading';
import LazyImage from './LazyImage';
import { fmtTime } from './utils';

const MAX_PREVIEW = 6;

export default function PostList({
  filteredIndices,
  discoveryPosts,
  selectedPosts,
  allLocalImages,
  onTogglePostSelect,
  onHandleSelectAllFiltered,
  onDownload,
  onRemovePost,
  setRemoveConfirmIndex,
  onOpenLightbox,
  downloading,
  loadMore,
  searching,
  currentPage,
  minImages,
  imgSrc,
  thumbSrc,
}: {
  filteredIndices: number[];
  discoveryPosts: any[];
  selectedPosts: Set<number>;
  allLocalImages: any[];
  onTogglePostSelect: (i: number) => void;
  onHandleSelectAllFiltered: () => void;
  onDownload: (indices: string) => void;
  onRemovePost: (i: number) => void;
  setRemoveConfirmIndex: (i: number | null) => void;
  onOpenLightbox: (pi: number, ii: number) => void;
  downloading: boolean;
  loadMore: () => void;
  searching: boolean;
  currentPage: number;
  minImages: number;
  imgSrc: (p: string) => string;
  thumbSrc: (p: string) => string;
}) {
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  function toggleExpand(origIdx: number) {
    setExpandedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(origIdx)) next.delete(origIdx);
      else next.add(origIdx);
      return next;
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            <strong className="text-text font-semibold tabular-nums">
              {filteredIndices.length}
            </strong>{' '}
            篇帖子
          </span>
          {allLocalImages.length > 0 && (
            <span className="text-xs text-text-muted">
              · 已下载{' '}
              <strong className="text-green-600 font-semibold tabular-nums">
                {allLocalImages.length}
              </strong>{' '}
              张
            </span>
          )}
        </div>
        <button className="btn btn-sm" onClick={onHandleSelectAllFiltered}>
          全选/取消
        </button>
      </div>
      {filteredIndices.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {filteredIndices.map((origIdx) => {
            const p = discoveryPosts[origIdx];
            const imgs = p.local_images || [];
            const remoteImgs = p.images || [];
            const displayImgs = imgs.length ? imgs : remoteImgs;
            const isChecked = selectedPosts.has(origIdx);
            const isExpanded = expandedPosts.has(origIdx);
            const hiddenCount = displayImgs.length - MAX_PREVIEW;
            return (
              <div
                key={origIdx}
                className={`rounded-xl border transition-all ${
                  isChecked
                    ? 'ring-1 ring-accent border-accent bg-accent-softer/20'
                    : 'border-border bg-bg-card hover:border-accent/30 hover:shadow-sm'
                }`}
              >
                {/* Card header */}
                <div className="flex items-start gap-2 px-3.5 pt-3 pb-2">
                  <Checkbox checked={isChecked} onChange={() => onTogglePostSelect(origIdx)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-text">{p.celebrity}</span>
                      {p.screen_name &&
                        (p.screen_name === p.celebrity ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                            本人
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-bg-secondary">
                            @{p.screen_name}
                          </span>
                        ))}
                      <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded-full bg-bg-secondary">
                        {p.scene}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      <span>{remoteImgs.length} 张图</span>
                      {imgs.length > 0 && (
                        <span className="text-green-600">已下载 {imgs.length}</span>
                      )}
                      {p.created_at && <span>{fmtTime(p.created_at)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => onDownload(String(origIdx))}
                      disabled={downloading}
                      title="下载此帖子图片"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      className="btn btn-xs btn-ghost text-text-muted hover:text-danger"
                      onClick={() => setRemoveConfirmIndex(origIdx)}
                      title="删除此帖子"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Text preview */}
                {p.text && (
                  <div className="px-3.5 pb-2">
                    <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                      {p.text.slice(0, 100)}
                    </p>
                  </div>
                )}

                {/* Image grid */}
                <div className="px-3.5 pb-3">
                  {isExpanded ? (
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                      {displayImgs.map((img: string, ii: number) => (
                        <div
                          key={ii}
                          className="w-20 h-20 shrink-0 rounded-lg border border-border/50 overflow-hidden bg-bg-secondary"
                        >
                          <LazyImage
                            src={thumbSrc(img)}
                            className="w-full h-full cursor-pointer"
                            onClick={() => onOpenLightbox(origIdx, ii)}
                          />
                        </div>
                      ))}
                      <button
                        className="w-20 h-20 shrink-0 rounded-lg border border-border flex items-center justify-center text-xs text-text-muted bg-bg-secondary hover:bg-accent/10 hover:border-accent/50 transition-all cursor-pointer"
                        onClick={() => toggleExpand(origIdx)}
                        title="收起图片"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <polyline points="18 15 12 9 6 15" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      {displayImgs.slice(0, MAX_PREVIEW).map((img: string, ii: number) => (
                        <div
                          key={ii}
                          className="w-20 h-20 shrink-0 rounded-lg border border-border/50 overflow-hidden bg-bg-secondary"
                        >
                          <LazyImage
                            src={thumbSrc(img)}
                            className="w-full h-full cursor-pointer"
                            onClick={() => onOpenLightbox(origIdx, ii)}
                          />
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          className="w-20 h-20 shrink-0 rounded-lg border border-border flex items-center justify-center text-xs font-medium text-text-muted bg-bg-secondary hover:bg-accent/10 hover:border-accent/50 transition-all cursor-pointer"
                          onClick={() => toggleExpand(origIdx)}
                          title="展开全部图片"
                        >
                          +{hiddenCount}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted text-sm">
          <svg
            className="w-10 h-10 mx-auto mb-3 opacity-30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          没有图片数 ≥ {minImages} 的帖子
        </div>
      )}
      {filteredIndices.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-border mt-4">
          <span className="text-xs text-text-muted">
            第 <strong className="text-text">{currentPage}</strong> 页
          </span>
          <button className="btn btn-sm" onClick={loadMore} disabled={searching}>
            {searching ? <Loading size="sm" inline text="加载中" /> : '加载更多'}
          </button>
        </div>
      )}
    </>
  );
}
