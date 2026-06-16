import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export default function Modal({ open, onClose, children, className = '' }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  // 打开/关闭控制
  useEffect(() => {
    clearTimer();
    if (open && !visible) {
      setExiting(false);
      // 分两帧：先挂载 DOM，再启动 enter 动画
      requestAnimationFrame(() => setVisible(true));
    } else if (!open && visible) {
      setExiting(true);
      timerRef.current = setTimeout(() => {
        setExiting(false);
        setVisible(false);
        // 在下一帧调用 onClose，避免在 React 批处理周期内同步触发
        requestAnimationFrame(() => onCloseRef.current());
      }, 200);
    }
    return clearTimer;
    // 只用 open 驱动，不依赖 visible 避免循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => {
    if (!visible || exiting) return;
    setExiting(true);
    timerRef.current = setTimeout(() => {
      setExiting(false);
      setVisible(false);
      requestAnimationFrame(() => onCloseRef.current());
    }, 200);
  }, [visible, exiting]);

  if (!visible) return null;

  // 通过 Portal 挂载到 body，避免被父级 overflow:hidden 裁剪
  return createPortal(
    <div
      className={`fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm ${exiting ? 'animate-out' : 'animate-in'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-bg-card border border-border rounded-2xl p-6 shadow-xl ${exiting ? 'animate-scale-out' : 'animate-scale'} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
