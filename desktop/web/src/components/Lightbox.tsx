import { useEffect, useCallback } from 'react';
import { useStore } from '../stores';

export default function Lightbox() {
  const { lightbox, closeLightbox, lightboxNav } = useStore();

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === 'ArrowLeft') lightboxNav(-1);
      else if (e.key === 'ArrowRight') lightboxNav(1);
      else if (e.key === 'Escape') closeLightbox();
    },
    [lightbox, lightboxNav, closeLightbox]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!lightbox) return null;

  const { images, index, originals } = lightbox;
  const url = images[index];
  const origUrl = originals?.[index] || url;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={closeLightbox} />

      <div className="relative z-10 flex flex-col items-center max-w-[90vw] max-h-[90vh]">
        <button
          onClick={closeLightbox}
          className="absolute -top-10 right-0 text-white/60 text-2xl hover:text-white z-20 transition-colors"
        >
          ✕
        </button>

        {images.length > 1 && (
          <button
            onClick={() => lightboxNav(-1)}
            className="absolute left-[-48px] top-1/2 -translate-y-1/2 text-white/40 text-3xl hover:text-white z-20 select-none transition-colors"
          >
            ‹
          </button>
        )}

        <div onClick={(e) => e.stopPropagation()}>
          <img src={url} alt="" className="max-h-[80vh] max-w-[85vw] object-contain rounded-lg" />
        </div>

        {images.length > 1 && (
          <button
            onClick={() => lightboxNav(1)}
            className="absolute right-[-48px] top-1/2 -translate-y-1/2 text-white/40 text-3xl hover:text-white z-20 select-none transition-colors"
          >
            ›
          </button>
        )}

        <div className="flex items-center gap-4 mt-3">
          <span className="text-white/50 text-sm tabular-nums">{index + 1} / {images.length}</span>
          <a
            href={origUrl}
            target="_blank"
            download
            className="btn btn-sm text-white/70 border-white/20 hover:text-white hover:border-white/40"
            onClick={(e) => e.stopPropagation()}
          >
            原图下载
          </a>
        </div>
      </div>
    </div>
  );
}
