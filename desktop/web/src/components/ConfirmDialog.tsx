interface ConfirmDialogProps {
  open: boolean; title: string; message: string;
  confirmText?: string; cancelText?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 animate-in" onClick={onCancel}>
      <div className="bg-bg-card border border-border rounded-xl p-5 min-w-[300px] max-w-[400px] shadow-lg animate-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-text mb-2">{title}</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
