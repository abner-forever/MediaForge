import { useState, useEffect, useRef, useCallback } from 'react';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

interface Props {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(position);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : position.x;
    const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : position.y;
    setPos({ x: Math.max(0, x), y: Math.max(0, y) });
  }, [position]);

  const handleClick = useCallback((e: PointerEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [handleClick]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[9500] min-w-[160px] py-1 bg-bg-card border border-border rounded-lg shadow-lg animate-[menuIn_0.1s_ease]"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          onClick={() => { if (!item.disabled && item.onClick) { item.onClick(); onClose(); } }}
          className={`
            flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors
            ${item.disabled ? 'opacity-40 cursor-not-allowed' :
              item.danger ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-bg-secondary'}
          `}
        >
          {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
          {item.label}
        </div>
      ))}
      <style>{`
        @keyframes menuIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
