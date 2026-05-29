import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export default function Drawer({ open, onClose, title, width = 360, children }: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else if (mounted) {
      setVisible(false);
      timerRef.current = setTimeout(() => {
        setMounted(false);
        requestAnimationFrame(() => onCloseRef.current());
      }, 280);
    }
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => {
    if (!mounted) return;
    clearTimer();
    setVisible(false);
    timerRef.current = setTimeout(() => {
      setMounted(false);
      requestAnimationFrame(() => onCloseRef.current());
    }, 280);
  }, [mounted, clearTimer]);

  if (!mounted) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8000,
    }} onClick={handleClose}>
      {/* 背景遮罩 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.25)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.28s ease',
      }} />
      {/* 抽屉面板 */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width, maxWidth: '85vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        boxShadow: visible ? '-4px 0 20px rgba(0,0,0,0.1)' : 'none',
        display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.28s ease',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        }}>
          {title && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>}
          <button onClick={handleClose} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'all 0.15s', marginLeft: 'auto',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
