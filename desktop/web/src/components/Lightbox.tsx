import { useEffect, useCallback, useState, useRef } from 'react';
import { useStore } from '../stores';

export default function Lightbox() {
  const { lightbox, closeLightbox, lightboxNav, lightboxGoTo } = useStore();

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!lightbox) return;
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    else if (e.key === 'ArrowRight') lightboxNav(1);
    else if (e.key === 'Escape') closeLightbox();
  }, [lightbox, lightboxNav, closeLightbox]);

  useEffect(() => { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey); }, [handleKey]);

  /* ── 预加载相邻图片提升切换流畅度 ── */
  useEffect(() => {
    if (!lightbox) return;
    const { images, index } = lightbox;
    const preload = (idx: number) => {
      if (idx < 0 || idx >= images.length) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = images[idx];
      document.head.appendChild(link);
      setTimeout(() => link.remove(), 5000);
    };
    preload(index - 1);
    preload(index + 1);
  }, [lightbox]);

  /* ── 自动滚动当前缩略图到可视区域 ── */
  const thumbsRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [lightbox?.index]);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [lightbox]);

  if (!lightbox) return null;
  const { images, index } = lightbox;
  const url = images[index];
  const showNav = images.length > 1;

  return (
    <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center animate-in">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={closeLightbox} />
      <button onClick={closeLightbox} className="absolute top-4 right-4 z-20 w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105">
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>

      {/* 主图区域 */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-16 pb-4 pt-12">
        <div className="relative flex items-center justify-center w-full flex-1 min-h-0">
          {showNav && (
            <button onClick={() => lightboxNav(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105 backdrop-blur">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          {!loaded && (
            <div className="flex flex-col items-center gap-3 text-white/40">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
          <img src={url} alt="" className={`max-h-full max-w-full object-contain select-none rounded-lg shadow-2xl transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`} draggable={false} decoding="async" onLoad={() => setLoaded(true)} />
          {showNav && (
            <button onClick={() => lightboxNav(1)} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105 backdrop-blur">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          )}
        </div>

        {/* 缩略图条 */}
        {showNav && (
          <div className="relative w-full max-w-[min(90vw,900px)] mt-3">
            <div ref={thumbsRef} className="flex items-center gap-2 overflow-x-auto p-1 scrollbar-hide">
              {images.map((img, i) => (
                <button
                  key={i}
                  ref={i === index ? activeThumbRef : null}
                  onClick={() => { if (i !== index) lightboxGoTo(i); }}
                  className={`relative flex-shrink-0 w-16 h-12 rounded transition-all duration-200 ${
                    i === index
                      ? 'ring-2 ring-white/90 ring-offset-1 ring-offset-black/60 scale-105 opacity-100'
                      : 'opacity-50 hover:opacity-80 hover:scale-[1.03]'
                  }`}
                >
                  <div className="w-full h-full rounded overflow-hidden">
                    <img src={img} alt="" className="w-full h-full object-cover" draggable={false} loading="lazy" />
                  </div>
                </button>
              ))}
            </div>
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/40 backdrop-blur text-white/60 text-[11px] tabular-nums">
              {index + 1} / {images.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
