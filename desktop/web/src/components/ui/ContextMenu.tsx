import { useState, useEffect, useRef, useCallback } from 'react';

export interface MenuItem {
  label: string; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; onClick?: () => void;
}
interface Props { items: MenuItem[]; position: { x: number; y: number }; onClose: () => void }

export default function ContextMenu({ items, position, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(position);

  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = position.x + r.width > window.innerWidth ? window.innerWidth - r.width - 8 : position.x;
    const y = position.y + r.height > window.innerHeight ? window.innerHeight - r.height - 8 : position.y;
    setPos({ x: Math.max(0, x), y: Math.max(0, y) });
  }, [position]);

  const handleClick = useCallback((e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('pointerdown', handleClick); return () => document.removeEventListener('pointerdown', handleClick); }, [handleClick]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, [onClose]);

  return (
    <div ref={ref} className="fixed z-[9500] min-w-[170px] py-1.5 bg-bg-card border border-border rounded-xl shadow-xl animate-scale" style={{ left: pos.x, top: pos.y }}>
      {items.map((item, i) => (
        <div key={i} onClick={() => { if (!item.disabled && item.onClick) { item.onClick(); onClose(); } }}
          className={`flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-sm cursor-pointer transition-colors ${item.disabled ? 'opacity-40 cursor-not-allowed' : item.danger ? 'text-danger hover:bg-danger/10' : 'text-text hover:bg-accent-soft'}`}
        >
          {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
          {item.label}
        </div>
      ))}
    </div>
  );
}
