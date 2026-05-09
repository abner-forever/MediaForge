import { useStore } from '../stores';

const CIRCUMFERENCE = 2 * Math.PI * 52;

export default function ProgressOverlay() {
  const { progress } = useStore();

  if (!progress) return null;

  const { current, total, detail } = progress;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[220px] shadow-2xl">
        {total === 0 ? (
          <div className="mx-auto w-12 h-12 relative">
            <div className="absolute inset-0 rounded-full border-[3px] border-[var(--border)]" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--accent)] animate-spin" />
          </div>
        ) : (
          <>
            <svg width="120" height="120" className="mx-auto" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                stroke="var(--text)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE - (current / total) * CIRCUMFERENCE}
                style={{ transition: 'stroke-dashoffset 0.3s ease' }}
              />
            </svg>
            <div className="mt-3 text-xl font-semibold text-text tabular-nums">{current}/{total}</div>
          </>
        )}
        <div className="mt-1 text-xs text-text-muted">{detail}</div>
      </div>
    </div>
  );
}
