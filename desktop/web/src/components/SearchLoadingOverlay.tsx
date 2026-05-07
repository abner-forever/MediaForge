import { createPortal } from 'react-dom';

interface Props {
  message?: string;
}

export default function SearchLoadingOverlay({ message }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[300px] shadow-2xl">
        <div className="mx-auto w-12 h-12 relative">
          <div className="absolute inset-0 rounded-full border-[3px] border-[var(--border)]" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--accent)] animate-spin" />
        </div>
        {message ? (
          <>
            <div className="mt-4 text-sm font-medium text-text">正在搜索</div>
            <div className="mt-2 text-xs text-text-muted leading-relaxed max-w-[320px]">{message}</div>
          </>
        ) : (
          <div className="mt-4 text-sm font-medium text-text">正在搜索微博内容…</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
