import { createPortal } from 'react-dom';
interface Props { message?: string; platformName?: string; onCancel?: () => void }

export default function SearchLoadingOverlay({ message, platformName, onCancel }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[300px] shadow-xl animate-scale">
        <div className="mx-auto w-12 h-12">
          <svg className="animate-spin text-accent" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="mt-4 text-sm font-semibold text-text">正在搜索{platformName || ''}内容</div>
        {message ? (
          <div className="mt-2 text-xs text-text-muted leading-relaxed max-w-[260px]">{message}</div>
        ) : (
          <div className="mt-2 text-xs text-text-muted">正在获取图文数据…</div>
        )}
        {onCancel && <button className="btn mt-5" onClick={onCancel}>取消</button>}
      </div>
    </div>,
    document.body,
  );
}
