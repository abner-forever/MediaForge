import '../../styles/form.less';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: {
    wrapper: 'form-number-input-sm',
    btn: 'form-number-btn form-number-btn-sm',
    icon: 'w-2.5 h-2.5',
    text: 'form-number-value form-number-value-sm',
  },
  md: { wrapper: '', btn: 'form-number-btn', icon: 'w-3 h-3', text: 'form-number-value' },
  lg: {
    wrapper: 'form-number-input-lg',
    btn: 'form-number-btn form-number-btn-lg',
    icon: 'w-3.5 h-3.5',
    text: 'form-number-value form-number-value-lg',
  },
};

export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  size = 'md',
}: NumberInputProps) {
  const s = sizeConfig[size];

  function clamp(v: number) {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  }

  return (
    <div className={`form-number-input ${s.wrapper}`} style={{ borderRadius: 'var(--radius-sm)' }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={min !== undefined && value <= min}
        className={`${s.btn}`}
      >
        <svg
          className={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(+e.target.value))}
        min={min}
        max={max}
        step={step}
        className={s.text}
        style={{ width: 0 }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={max !== undefined && value >= max}
        className={`${s.btn}`}
      >
        <svg
          className={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
