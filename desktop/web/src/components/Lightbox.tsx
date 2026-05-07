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

  const { images, index } = lightbox;
  const url = images[index];

  return (
    <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeLightbox} />

      {/* Close button */}
      <button
        onClick={closeLightbox}
        className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Image container */}
      <div className="relative z-10 flex items-center justify-center w-full h-full px-16 py-12">
        {/* Prev */}
        {images.length > 1 && (
          <button
            onClick={() => lightboxNav(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* Image */}
        <img
          src={url}
          alt=""
          className="max-h-[82vh] max-w-[82vw] object-contain rounded-xl shadow-2xl select-none"
          draggable={false}
        />

        {/* Next */}
        {images.length > 1 && (
          <button
            onClick={() => lightboxNav(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom bar */}
      {images.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center py-4 bg-gradient-to-t from-black/60 to-transparent">
          <span className="text-white/50 text-[13px] tabular-nums">{index + 1} / {images.length}</span>
        </div>
      )}
    </div>
  );
}
