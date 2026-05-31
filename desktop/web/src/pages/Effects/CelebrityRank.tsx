import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';
import { formatCount } from '../../utils/format';

interface Celebrity {
  name: string;
  avg_reads: number;
  count: number;
}

type RankMode = 'avg' | 'total';

export default function CelebrityRank({ days }: { days: number }) {
  const [mode, setMode] = useState<RankMode>('avg');
  const [celebrities, setCelebrities] = useState<Celebrity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await effectsApi.celebrityRank(days);
      setCelebrities(res.celebrities);
    } catch {
      setCelebrities([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!loading && celebrities.length === 0) return null;

  const sorted = mode === 'total'
    ? [...celebrities].sort((a, b) => (b.avg_reads * b.count) - (a.avg_reads * a.count))
    : celebrities;
  const maxVal = mode === 'total'
    ? Math.max(...sorted.map(c => c.avg_reads * c.count), 1)
    : Math.max(...sorted.map(c => c.avg_reads), 1);

  return (
    <div className="card p-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>艺人效果排行</h3>
          <div style={{ display: 'flex', gap: 2 }}>
            {([{ label: '均阅', value: 'avg' }, { label: '总排行', value: 'total' }] as const).map(m => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                style={{
                  padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none',
                  background: mode === m.value ? 'var(--accent)' : 'var(--border)',
                  color: mode === m.value ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((c, i) => {
            const totalReads = c.avg_reads * c.count;
            const barVal = mode === 'total' ? totalReads : c.avg_reads;
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 20, fontSize: 12, fontWeight: 700, textAlign: 'center',
                  color: i < 3 ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                    <span
                      style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}
                      title={mode === 'total' ? `总阅读 ${totalReads.toLocaleString()}` : `均阅读 ${c.avg_reads.toLocaleString()}`}
                    >
                      {mode === 'total'
                        ? `总阅 ${formatCount(totalReads)} · ${c.count} 篇`
                        : `均阅 ${formatCount(c.avg_reads)} · ${c.count} 篇`}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${(barVal / maxVal) * 100}%`,
                      background: i < 3
                        ? 'linear-gradient(90deg, var(--accent), var(--accent-hover))'
                        : 'var(--text-muted)',
                      opacity: i < 3 ? 1 : 0.3,
                      transition: 'width 0.6s ease-out',
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
