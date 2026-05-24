import { useRef, useState, useEffect } from 'react';

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  placeholder?: React.ReactNode;
  rootMargin?: string;
}

const shimmerStyle = {
  background: 'var(--bg-secondary)',
};

const shimmerSlideStyle = {
  background: 'linear-gradient(90deg, transparent 0%, var(--bg-elevated) 50%, transparent 100%)',
  animation: 'lazy-shimmer-slide 1.5s linear infinite',
};

export default function LazyImage({ src, alt = '', className, onClick, onError, placeholder, rootMargin = '200px' }: LazyImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className || ''}`} onClick={onClick}>
      {/* shimmer 骨架屏 */}
      {!inView || !loaded ? (
        <div className="absolute inset-0 overflow-hidden" style={shimmerStyle}>
          <div className="absolute inset-y-0 left-0 right-0" style={shimmerSlideStyle} />
        </div>
      ) : null}
      {/* 纯 CSS shimmer keyframes */}
      <style>{`@keyframes lazy-shimmer-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            setLoaded(true);
            onError?.(e);
          }}
        />
      )}
    </div>
  );
}
