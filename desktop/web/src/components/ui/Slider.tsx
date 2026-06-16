import { useState, useRef, useCallback, useMemo } from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export default function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
}: SliderProps) {
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const pct = useMemo(() => ((value - min) / (max - min)) * 100, [value, min, max]);

  const computeValue = useCallback(
    (clientX: number) => {
      const rail = railRef.current;
      if (!rail) return value;
      const rect = rail.getBoundingClientRect();
      let ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      const raw = min + ratio * (max - min);
      const stepped = Math.round((raw - min) / step) * step + min;
      return Math.max(min, Math.min(max, stepped));
    },
    [min, max, step, value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      onChange(computeValue(e.clientX));
    },
    [disabled, computeValue, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      onChange(computeValue(e.clientX));
    },
    [dragging, computeValue, onChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    [dragging],
  );

  return (
    <div
      className={`slider-root${disabled ? ' slider-disabled' : ''}${className ? ` ${className}` : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        if (!dragging) setHovering(false);
      }}
      ref={railRef as React.RefObject<HTMLDivElement>}
    >
      <div className="slider-rail" />
      <div className="slider-track" style={{ width: `${pct}%` }} />
      <div
        className={`slider-handle${dragging ? ' slider-handle-active' : ''}${hovering ? ' slider-handle-hover' : ''}`}
        style={{ left: `${pct}%` }}
      >
        {(hovering || dragging) && <div className="slider-tooltip">{value.toFixed(2)}</div>}
      </div>
    </div>
  );
}
