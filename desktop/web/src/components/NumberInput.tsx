interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function NumberInput({ value, onChange, min, max, step = 1 }: NumberInputProps) {
  function clamp(v: number) {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  }

  return (
    <div className="flex items-center border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] transition-all duration-150 field-control" style={{ borderRadius: 'var(--radius)' }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={min !== undefined && value <= min}
        className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-softer)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(+e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 text-center border-none bg-transparent shadow-none focus:shadow-none focus:outline-none px-0 text-[13px] text-[var(--text)]"
        style={{ width: 0 }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={max !== undefined && value >= max}
        className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-softer)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}
