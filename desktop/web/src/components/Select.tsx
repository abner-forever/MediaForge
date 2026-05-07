import { useState, useRef, useEffect, useCallback } from 'react';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export default function Select({ value, onChange, options, placeholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          w-full flex items-center justify-between
          px-3 py-[9px] rounded-lg border text-[13px] text-left
          transition-[border-color,box-shadow] duration-150 cursor-pointer
          bg-[var(--bg-secondary)] text-[var(--text)] font-[inherit]
          ${open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)] bg-[var(--bg-card)]'
            : 'border-[var(--border)] hover:border-[var(--accent)]'
          }
        `}
      >
        <span className={!selected ? 'text-[var(--text-muted)]' : ''}>
          {selected ? selected.label : placeholder ?? '请选择'}
        </span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-lg overflow-hidden animate-[dropdownIn_0.12s_ease]"
          style={{ maxHeight: 240, overflowY: 'auto' }}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); close(); }}
                className={`
                  px-3 py-2 text-[13px] cursor-pointer transition-colors duration-100
                  ${isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
                  }
                `}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
