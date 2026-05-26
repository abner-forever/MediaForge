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
  disabled?: boolean;
  menuPosition?: 'bottom' | 'top';
  size?: 'md' | 'sm';
}

export default function Select({ value, onChange, options, placeholder, disabled, menuPosition = 'bottom', size = 'md' }: SelectProps) {
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
    <div ref={ref} className="relative field-control">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`
          w-full flex items-center justify-between
          rounded-lg border text-left
          transition-all duration-150
          bg-[var(--bg-card)] text-[var(--text)] font-[inherit]
          ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-[8px] text-[13px]'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]'
            : disabled
              ? 'border-[var(--border)]'
              : 'border-[var(--border)] hover:border-[var(--accent)]'
          }
        `}
        disabled={disabled}
      >
        <span className={!selected ? 'text-[var(--text-muted)]' : ''}>
          {selected ? selected.label : placeholder ?? '请选择'}
        </span>
        <svg
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''} ${size === 'sm' ? 'w-3 h-3 ml-1.5' : 'w-3.5 h-3.5 ml-2'}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg overflow-hidden ${menuPosition === 'top' ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          style={{ maxHeight: 240, overflowY: 'auto', animation: 'dropdownIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); close(); }}
                className={`
                  cursor-pointer transition-colors duration-100
                  ${size === 'sm' ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-[13px]'}
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
    </div>
  );
}
