import { useState, useRef, useCallback } from 'react';
import type { EffectTrendPoint } from '../../types';

const W = 800, H = 280, PAD = { top: 20, right: 56, bottom: 40, left: 56 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

type ExtraLine = 'rate' | 'followers';

export default function TrendChart({ data, days, onDaysChange }: {
  data: EffectTrendPoint[];
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [extras, setExtras] = useState<Set<ExtraLine>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);

  const maxReads = Math.max(...data.map(d => d.reads), 1);
  const maxLikes = Math.max(...data.map(d => d.likes), 1);
  const maxVal = Math.max(maxReads, maxLikes);

  // Engagement rate: (likes + comments + shares) / reads * 100
  const rates = data.map(d => d.reads > 0 ? ((d.likes + (d.comments || 0) + (d.shares || 0)) / d.reads) * 100 : 0);
  const maxRate = Math.max(...rates, 1);

  // Followers
  const maxFollowers = Math.max(...data.map(d => d.new_followers || 0), 1);

  const xScale = useCallback((i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * IW : IW / 2), [data.length]);
  const yScale = useCallback((v: number) => PAD.top + IH - (v / maxVal) * IH, [maxVal]);
  const yScaleRate = useCallback((v: number) => PAD.top + IH - (v / maxRate) * IH, [maxRate]);
  const yScaleFollowers = useCallback((v: number) => PAD.top + IH - (v / maxFollowers) * IH, [maxFollowers]);

  const readsPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.reads)}`).join(' ');
  const likesPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.likes)}`).join(' ');
  const ratePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScaleRate(rates[i])}`).join(' ');
  const followersPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScaleFollowers(d.new_followers || 0)}`).join(' ');

  const labelInterval = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 8);
  const yTicks = 4;
  const yStep = maxVal / yTicks;

  const toggleExtra = (key: ExtraLine) => {
    setExtras(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const x = (e.clientX - rect.left) * scaleX - PAD.left;
    const idx = Math.round((x / IW) * (data.length - 1));
    setHover(idx >= 0 && idx < data.length ? idx : null);
  }, [data.length]);

  const tooltipLines: Array<{ label: string; value: string; color: string }> = [];
  if (hover !== null) {
    const d = data[hover];
    tooltipLines.push({ label: '阅读', value: d.reads.toLocaleString(), color: '#3b82f6' });
    tooltipLines.push({ label: '点赞', value: d.likes.toLocaleString(), color: '#f59e0b' });
    if (extras.has('rate')) tooltipLines.push({ label: '互动率', value: `${rates[hover].toFixed(1)}%`, color: '#10b981' });
    if (extras.has('followers')) tooltipLines.push({ label: '关注', value: (d.new_followers || 0).toLocaleString(), color: '#ec4899' });
  }
  const tooltipH = 20 + tooltipLines.length * 16;

  return (
    <div className="card p-4">
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>趋势分析</h3>

      <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#3b82f6' }} /> 阅读量
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#f59e0b' }} /> 点赞数
        </span>
        <button
          onClick={() => toggleExtra('rate')}
          style={{
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: extras.has('rate') ? '#10b981' : 'var(--text-muted)',
            opacity: extras.has('rate') ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#10b981' }} /> 互动率
        </button>
        <button
          onClick={() => toggleExtra('followers')}
          style={{
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: extras.has('followers') ? '#ec4899' : 'var(--text-muted)',
            opacity: extras.has('followers') ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#ec4899' }} /> 新增关注
        </button>
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

        {/* Right axis for rate / followers */}
        {extras.has('rate') && (
          <text x={W - PAD.right + 8} y={PAD.top + 4} fill="#10b981" fontSize="10">
            {maxRate.toFixed(0)}%
          </text>
        )}
        {extras.has('followers') && !extras.has('rate') && (
          <text x={W - PAD.right + 8} y={PAD.top + 4} fill="#ec4899" fontSize="10">
            {maxFollowers}
          </text>
        )}

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
        {extras.has('rate') && (
          <path d={ratePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6,3" />
        )}
        {extras.has('followers') && (
          <path d={followersPath} fill="none" stroke="#ec4899" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6,3" />
        )}

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
            {extras.has('rate') && (
              <circle cx={xScale(hover)} cy={yScaleRate(rates[hover])} r="4" fill="#10b981" stroke="#fff" strokeWidth="2" />
            )}
            {extras.has('followers') && (
              <circle cx={xScale(hover)} cy={yScaleFollowers(data[hover].new_followers || 0)} r="4" fill="#ec4899" stroke="#fff" strokeWidth="2" />
            )}
            {/* Tooltip */}
            <g>
              <rect
                x={Math.min(xScale(hover) + 8, W - 140)}
                y={PAD.top + 4}
                width={128} height={tooltipH} rx={8}
                fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
              />
              <text x={Math.min(xScale(hover) + 16, W - 132)} y={PAD.top + 22} fill="var(--text)" fontSize="11" fontWeight="600">
                {data[hover].date}
              </text>
              {tooltipLines.map((line, li) => (
                <text
                  key={li}
                  x={Math.min(xScale(hover) + 16, W - 132)}
                  y={PAD.top + 38 + li * 16}
                  fill={line.color}
                  fontSize="11"
                >
                  {line.label} {line.value}
                </text>
              ))}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
