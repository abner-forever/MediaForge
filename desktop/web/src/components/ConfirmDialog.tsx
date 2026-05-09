interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-2xl p-6 min-w-[320px] max-w-[420px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-text mb-2">{title}</h3>
        <p className="text-[13px] text-text-secondary leading-relaxed mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
