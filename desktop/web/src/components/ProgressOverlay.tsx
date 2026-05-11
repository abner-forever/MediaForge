import { useStore } from '../stores';

const CIRCUMFERENCE = 2 * Math.PI * 48;

export default function ProgressOverlay() {
  const { progress } = useStore();
  if (!progress) return null;
  const { current, total, detail } = progress;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/50">
      <div className="bg-bg-card border border-border rounded-xl p-8 text-center min-w-[200px] shadow-lg animate-up">
        {total === 0 ? (
          <div className="mx-auto w-10 h-10 border-2 border-border border-t-accent rounded-full animate-spin" />
        ) : (
          <>
            <svg width="110" height="110" className="mx-auto" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="55" cy="55" r="48" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle cx="55" cy="55" r="48" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE - (current / total) * CIRCUMFERENCE}
                style={{ transition: 'stroke-dashoffset 0.2s' }}
              />
            </svg>
            <div className="mt-3 text-lg font-bold text-text tabular-nums">{current}/{total}</div>
          </>
        )}
        <div className="mt-1 text-xs text-text-muted">{detail}</div>
      </div>
    </div>
  );
}
