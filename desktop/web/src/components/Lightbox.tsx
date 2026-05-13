import { useEffect, useCallback } from 'react';
import { useStore } from '../stores';

export default function Lightbox() {
  const { lightbox, closeLightbox, lightboxNav } = useStore();

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!lightbox) return;
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    else if (e.key === 'ArrowRight') lightboxNav(1);
    else if (e.key === 'Escape') closeLightbox();
  }, [lightbox, lightboxNav, closeLightbox]);

  useEffect(() => { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey); }, [handleKey]);

  if (!lightbox) return null;
  const { images, index } = lightbox;
  const url = images[index];

  return (
    <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center animate-in">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={closeLightbox} />
      <button onClick={closeLightbox} className="absolute top-4 right-4 z-20 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105">
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur text-white/70 text-xs tabular-nums">
          {index + 1} / {images.length}
        </div>
      )}
      <div className="relative z-10 flex items-center justify-center w-full h-full px-20 py-12">
        {images.length > 1 && (
          <button onClick={() => lightboxNav(-1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105 backdrop-blur">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        )}
        <img src={url} alt="" className="max-h-[82vh] max-w-full object-contain select-none rounded-lg shadow-2xl" draggable={false} />
        {images.length > 1 && (
          <button onClick={() => lightboxNav(1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all hover:scale-105 backdrop-blur">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
