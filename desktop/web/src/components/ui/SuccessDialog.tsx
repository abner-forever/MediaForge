import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';

interface SuccessDialogProps {
  open: boolean;
  title?: string;
  message: string;
  detail?: string;
  autoClose?: number;
  onClose: () => void;
}

export default function SuccessDialog({ open, title = '操作成功', message, detail, autoClose = 2000, onClose }: SuccessDialogProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setVisible(true);
      if (autoClose > 0) {
        timerRef.current = setTimeout(() => {
          setVisible(false);
          setTimeout(onClose, 200);
        }, autoClose);
      }
    } else {
      setVisible(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [open, autoClose, onClose]);

  return (
    <Modal open={visible} onClose={onClose} className="min-w-[280px] max-w-[360px]">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0' }}>
        {/* 成功图标 */}
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--accent-softer, rgba(16,185,129,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #10b981)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        {/* 标题 */}
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>{title}</h3>
        {/* 消息 */}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{message}</p>
        {/* 详情 */}
        {detail && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', textAlign: 'center' }}>{detail}</p>
        )}
        {/* 自动关闭进度条 */}
        {autoClose > 0 && (
          <div style={{ width: '100%', height: 2, background: 'var(--border-subtle)', borderRadius: 1, marginTop: 14, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--accent, #10b981)', borderRadius: 1,
              animation: `shrink ${autoClose}ms linear forwards`,
            }} />
          </div>
        )}
      </div>
      <style>{`
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </Modal>
  );
}
