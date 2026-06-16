import { useId } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function Checkbox({
  checked,
  onChange,
  disabled,
  indeterminate,
  className,
  children,
}: CheckboxProps) {
  const uid = useId();
  return (
    <label
      className={`checkbox-root${disabled ? ' checkbox-disabled' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={(e) => {
        if (disabled) e.preventDefault();
      }}
    >
      <span
        className={`checkbox-target${checked ? ' checkbox-checked' : ''}${indeterminate ? ' checkbox-indeterminate' : ''}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          id={uid}
        />
        {checked && (
          <svg className="checkbox-icon" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6l2.5 2.5 4.5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {indeterminate && !checked && <span className="checkbox-indet" aria-hidden />}
      </span>
      {children && <span className="checkbox-label">{children}</span>}
    </label>
  );
}
