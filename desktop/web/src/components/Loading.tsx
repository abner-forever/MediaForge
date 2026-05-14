interface LoadingProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  inline?: boolean;
}

const variants = {
  sm: { v: 16, s: 2, r: 6, arc: 'M8 2a6 6 0 0 1 6 6' },
  md: { v: 24, s: 3, r: 10, arc: 'M12 2a10 10 0 0 1 10 10' },
  lg: { v: 36, s: 4, r: 15, arc: 'M18 3a15 15 0 0 1 15 15' },
};

export default function Loading({ text, size = 'md', className = '', inline }: LoadingProps) {
  const { v, s, r, arc } = variants[size];

  const spinner = (
    <svg className="animate-spin text-accent" viewBox={`0 0 ${v} ${v}`} width={v} height={v} fill="none">
      <circle cx={v/2} cy={v/2} r={r} stroke="currentColor" strokeWidth={s} strokeLinecap="round" opacity="0.2" />
      <path d={arc} stroke="currentColor" strokeWidth={s} strokeLinecap="round" />
    </svg>
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
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className="animate-scale">{spinner}</div>
      {text && <span className="text-sm text-text-muted animate-in">{text}</span>}
    </div>
  );
}
