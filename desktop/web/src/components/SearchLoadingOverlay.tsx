import { createPortal } from 'react-dom';
interface Props { message?: string; platformName?: string; onCancel?: () => void }

export default function SearchLoadingOverlay({ message, platformName, onCancel }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/50 animate-in">
      <div className="bg-bg-card border border-border rounded-xl p-8 text-center min-w-[280px] shadow-lg animate-up">
        <div className="mx-auto w-10 h-10 border-2 border-border border-t-accent rounded-full animate-spin" />
        {message ? (
          <><div className="mt-4 text-sm font-semibold text-text">正在搜索</div><div className="mt-2 text-xs text-text-muted leading-relaxed max-w-[280px]">{message}</div></>
        ) : (
          <div className="mt-4 text-sm font-semibold text-text">正在搜索{platformName || ''}内容…</div>
        )}
        {onCancel && <button className="btn mt-4" onClick={onCancel}>取消</button>}
      </div>
    </div>,
    document.body,
  );
}
