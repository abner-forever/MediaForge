import { useStore } from '../../stores';

const CIRCUMFERENCE = 2 * Math.PI * 48;

export default function ProgressOverlay() {
  const progress = useStore(s => s.progress);
  if (!progress) return null;
  const { current, total, detail } = progress;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[220px] shadow-xl animate-scale">
        {total === 0 ? (
          <div className="mx-auto w-10 h-10">
            <svg className="animate-spin text-accent" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="relative">
            <svg width="110" height="110" className="mx-auto" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="55" cy="55" r="48" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle cx="55" cy="55" r="48" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE - (current / total) * CIRCUMFERENCE}
                style={{ transition: 'stroke-dashoffset 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-text tabular-nums tracking-tight">{current}/{total}</span>
            </div>
          </div>
        )}
        {detail && <div className="mt-3 text-xs text-text-muted leading-relaxed max-w-[200px]">{detail}</div>}
      </div>
    </div>
  );
}
