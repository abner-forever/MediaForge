import { useRef, useState, useEffect } from 'react';

const BrokenImage = () => (
  <svg
    className="w-8 h-8 text-text-muted/30"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m6 18 5-6 3 4 4-5" />
    <path d="M22 10.5 17 6" />
    <path d="m17 10.5 5-4.5" />
  </svg>
);

interface LazyImageProps {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  placeholder?: React.ReactNode;
  rootMargin?: string;
  /** 模糊过渡时长（ms），默认 700 */
  blurDuration?: number;
}

export default function LazyImage({
  src,
  alt = '',
  className,
  imgClassName,
  onClick,
  onError,
  placeholder,
  rootMargin = '200px',
  blurDuration = 700,
}: LazyImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
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
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-bg-secondary ${className || ''}`}
      onClick={onClick}
    >
      {inView && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={`w-full h-full ${imgClassName || 'object-cover'} transition-all duration-700 ease-out ${
            loaded ? 'opacity-100 scale-100 blur-none' : 'opacity-50 scale-[1.02] blur-lg'
          }`}
          style={{ transitionDuration: loaded ? `${Math.min(blurDuration, 800)}ms` : '0ms' }}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            setError(true);
            setLoaded(true);
            onError?.(e);
          }}
        />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary pointer-events-none">
          {placeholder || <BrokenImage />}
        </div>
      )}
    </div>
  );
}
