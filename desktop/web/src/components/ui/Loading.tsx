interface LoadingProps {
  text?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  inline?: boolean;
}

const sizeConfig = {
  xs: { wrapper: 16, ring: 12, ring2: 14 },
  sm: { wrapper: 32, ring: 24, ring2: 28 },
  md: { wrapper: 48, ring: 36, ring2: 42 },
  lg: { wrapper: 64, ring: 48, ring2: 56 },
};

export default function Loading({ text, size = 'md', className = '', inline }: LoadingProps) {
  const config = sizeConfig[size];

  const spinner = (
    <div
      className="relative flex items-center justify-center"
      style={{ width: config.wrapper, height: config.wrapper }}
    >
      {/* 外环 - 逆时针 */}
      <div
        className="absolute rounded-full"
        style={{
          width: config.ring2,
          height: config.ring2,
          animation: 'loading-outer 3s linear infinite',
        }}
      >
        <svg className="w-full h-full" viewBox="0 0 42 42">
          <circle
            cx="21" cy="21" r="18"
            fill="none"
            stroke="rgba(59, 130, 246, 0.2)"
            strokeWidth="2.5"
          />
          <circle
            cx="21" cy="21" r="18"
            fill="none"
            stroke="url(#loadOuter)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="80 113"
          />
          <defs>
            <linearGradient id="loadOuter" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 内环 - 顺时针 */}
      <div
        className="absolute rounded-full"
        style={{
          width: config.ring,
          height: config.ring,
          animation: 'loading-inner 2s linear infinite',
        }}
      >
        <svg className="w-full h-full" viewBox="0 0 36 36">
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke="rgba(139, 92, 246, 0.15)"
            strokeWidth="3"
          />
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke="url(#loadInner)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="50 94"
          />
          <defs>
            <linearGradient id="loadInner" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );

  if (inline) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {spinner}
        {text && <span className="text-xs text-text-muted">{text}</span>}
      </span>
    );
  }

  return (
    <>
      <style>{`
        @keyframes loading-inner {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loading-outer {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
      <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
        {spinner}
        {text && <span className="text-sm text-text-muted">{text}</span>}
      </div>
    </>
  );
}
