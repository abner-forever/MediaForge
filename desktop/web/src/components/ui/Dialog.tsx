import { useState } from 'react';
import Modal from './Modal';
import Checkbox from './Checkbox';

interface DialogProps {
  open: boolean;
  type?: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  noLoading?: boolean;
  checkboxLabel?: string;
  defaultChecked?: boolean;
  onConfirm?: (checkboxChecked: boolean) => void;
  onCancel?: () => void;
}

export default function Dialog({
  open, type = 'confirm', title, message,
  confirmText = type === 'alert' ? '知道了' : '确认',
  cancelText = '取消',
  danger = false, noLoading = false,
  checkboxLabel, defaultChecked = false,
  onConfirm, onCancel,
}: DialogProps) {
  const [localLoading, setLocalLoading] = useState(false);
  const [checked, setChecked] = useState(defaultChecked);

  async function handleConfirm() {
    if (localLoading) return;
    if (noLoading) { onConfirm?.(checked); return; }
    setLocalLoading(true);
    try {
      await Promise.resolve(onConfirm?.(checked));
    } finally {
      setLocalLoading(false);
    }
  }

  const loading = localLoading && !noLoading;
  const isAlert = type === 'alert';

  return (
    <Modal open={open} onClose={onCancel || (() => {})} className="min-w-[320px] max-w-[400px]">
      <h3 className="text-base font-bold text-text mb-3">{title}</h3>
      <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
      {checkboxLabel && (
        <div className="mt-3">
          <Checkbox checked={checked} onChange={setChecked}>{checkboxLabel}</Checkbox>
        </div>
      )}
      <div className="flex gap-2.5 justify-end mt-5">
        {!isAlert && (
          <button className="btn" onClick={onCancel} disabled={loading}>{cancelText}</button>
        )}
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={handleConfirm} disabled={loading}>
          {loading ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 处理中</> : confirmText}
        </button>
      </div>
    </Modal>
  );
}
