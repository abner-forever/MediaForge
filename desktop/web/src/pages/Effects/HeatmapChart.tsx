import { useState, useMemo } from 'react';
import type { EffectTrendPoint } from '../../types';

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const CELL = 18;
const GAP = 3;

function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7; // Monday=0
}

export default function HeatmapChart({ data }: { data: EffectTrendPoint[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);

  // Aggregate data by day-of-week × hour
  // Since we only have daily data (not hourly), we simulate a distribution
  // across hours based on the day's total reads
  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const dowTotals: number[] = Array(7).fill(0);

    for (const point of data) {
      const dt = new Date(point.date);
      const dow = isoWeekday(dt);
      dowTotals[dow] += point.reads;
    }

    // Distribute reads into hours using a typical engagement curve
    // Peak at 8, 12, 18, 21 (morning, noon, evening, night)
    const hourWeights = [
      1, 0.5, 0.3, 0.2, 0.2, 0.5, 1.5, 3, 5, 4, 3.5, 3,
      4, 3, 2.5, 2.5, 3, 4, 5, 6, 7, 5, 3, 1.5,
    ];
    const totalWeight = hourWeights.reduce((a, b) => a + b, 0);

    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        g[dow][h] = Math.round((dowTotals[dow] * hourWeights[h]) / totalWeight);
      }
    }

    return g;
  }, [data]);

  const maxVal = Math.max(...grid.flat(), 1);

  const color = (v: number) => {
    if (v === 0) return 'var(--border)';
    const t = v / maxVal;
    const r = Math.round(59 + t * 196);
    const g = Math.round(130 - t * 80);
    const b = Math.round(246 - t * 170);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="card p-4">
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
        最佳发布时段
      </h3>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {/* Hour labels */}
        <div style={{ display: 'flex', marginLeft: 28, marginBottom: 4 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{
              width: CELL, marginRight: GAP,
              textAlign: 'center', fontSize: 9, color: 'var(--text-muted)',
            }}>
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>

        {/* Grid */}
        {DAYS.map((day, dow) => (
          <div key={dow} style={{ display: 'flex', alignItems: 'center', marginBottom: GAP }}>
            <span style={{ width: 24, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginRight: 4 }}>
              周{day}
            </span>
            {grid[dow].map((val, h) => (
              <div
                key={h}
                onMouseEnter={() => setHover({ dow, hour: h })}
                onMouseLeave={() => setHover(null)}
                style={{
                  width: CELL, height: CELL, marginRight: GAP,
                  borderRadius: 3, background: color(val),
                  cursor: 'default', transition: 'transform 0.15s',
                  transform: hover?.dow === dow && hover?.hour === h ? 'scale(1.3)' : 'none',
                }}
              />
            ))}
          </div>
        ))}

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, marginLeft: 28 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>少</span>
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <div key={t} style={{
              width: CELL, height: CELL / 2, borderRadius: 2,
              background: t === 0 ? 'var(--border)' : color(t * maxVal),
            }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>多</span>
        </div>
      </div>

      {/* Tooltip - reserved space to prevent layout shift */}
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', minHeight: 20 }}>
        {hover && (
          <>周{DAYS[hover.dow]} {hover.hour}:00 — 预估阅读 {grid[hover.dow][hover.hour].toLocaleString()}</>
        )}
      </div>
    </div>
  );
}
