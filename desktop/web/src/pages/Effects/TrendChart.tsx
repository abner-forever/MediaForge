import { useState, useRef, useCallback } from 'react';
import type { EffectTrendPoint } from '../../types';

const W = 800, H = 280, PAD = { top: 20, right: 20, bottom: 40, left: 56 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

export default function TrendChart({ data, days, onDaysChange }: {
  data: EffectTrendPoint[];
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxReads = Math.max(...data.map(d => d.reads), 1);
  const maxLikes = Math.max(...data.map(d => d.likes), 1);
  const maxVal = Math.max(maxReads, maxLikes);

  const xScale = useCallback((i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * IW : IW / 2), [data.length]);
  const yScale = useCallback((v: number) => PAD.top + IH - (v / maxVal) * IH, [maxVal]);

  const readsPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.reads)}`).join(' ');
  const likesPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.likes)}`).join(' ');

  // X 轴标签：每隔几天显示一个
  const labelInterval = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 8);

  // Y 轴刻度
  const yTicks = 4;
  const yStep = maxVal / yTicks;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - PAD.left;
    const idx = Math.round((x / IW) * (data.length - 1));
    setHover(idx >= 0 && idx < data.length ? idx : null);
  }, [data.length]);

  return (
    <div className="card p-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>趋势分析</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: days === d ? 'var(--accent)' : 'var(--border)',
                color: days === d ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}
            >
              {d}天
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#3b82f6' }} /> 阅读量
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#f59e0b' }} /> 点赞数
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const y = PAD.top + (i / yTicks) * IH;
          const val = Math.round(maxVal - i * yStep);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="10">
                {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {data.map((d, i) => i % labelInterval === 0 && (
          <text key={i} x={xScale(i)} y={H - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
            {d.date.slice(5)}
          </text>
        ))}

        {/* Area fill for reads */}
        <path
          d={`${readsPath} L${xScale(data.length - 1)},${PAD.top + IH} L${xScale(0)},${PAD.top + IH} Z`}
          fill="url(#readsGrad)"
        />

        {/* Lines */}
        <path d={readsPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        <path d={likesPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />

        {/* Gradient defs */}
        <defs>
          <linearGradient id="readsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Hover crosshair */}
        {hover !== null && (
          <>
            <line x1={xScale(hover)} y1={PAD.top} x2={xScale(hover)} y2={PAD.top + IH} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="4,4" />
            <circle cx={xScale(hover)} cy={yScale(data[hover].reads)} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
            <circle cx={xScale(hover)} cy={yScale(data[hover].likes)} r="4" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
            {/* Tooltip */}
            <g>
              <rect
                x={Math.min(xScale(hover) + 8, W - 140)}
                y={PAD.top + 4}
                width={128} height={64} rx={8}
                fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
              />
              <text x={Math.min(xScale(hover) + 16, W - 132)} y={PAD.top + 22} fill="var(--text)" fontSize="11" fontWeight="600">
                {data[hover].date}
              </text>
              <text x={Math.min(xScale(hover) + 16, W - 132)} y={PAD.top + 40} fill="#3b82f6" fontSize="11">
                阅读 {data[hover].reads.toLocaleString()}
              </text>
              <text x={Math.min(xScale(hover) + 16, W - 132)} y={PAD.top + 56} fill="#f59e0b" fontSize="11">
                点赞 {data[hover].likes.toLocaleString()}
              </text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
