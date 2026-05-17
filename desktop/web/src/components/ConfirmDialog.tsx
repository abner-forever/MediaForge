import { useState } from 'react';

interface ConfirmDialogProps {
  open: boolean; title: string; message: string;
  confirmText?: string; cancelText?: string; danger?: boolean; noLoading?: boolean;
  onConfirm: () => void; onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', danger = false, noLoading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const [localLoading, setLocalLoading] = useState(false);
  if (!open) return null;

  async function handleConfirm() {
    if (localLoading) return;
    if (noLoading) { onConfirm(); return; }
    setLocalLoading(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      setLocalLoading(false);
    }
  }

  const loading = localLoading && !noLoading;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-2xl p-6 min-w-[320px] max-w-[400px] shadow-xl animate-scale" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-text mb-2">{title}</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">{message}</p>
        <div className="flex gap-2.5 justify-end">
          <button className="btn" onClick={onCancel} disabled={loading}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={handleConfirm} disabled={loading}>
            {loading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 处理中</> : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
