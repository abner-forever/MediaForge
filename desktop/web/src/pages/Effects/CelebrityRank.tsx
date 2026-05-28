import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';

interface Celebrity {
  name: string;
  avg_reads: number;
  count: number;
}

const FILTERS = [
  { label: '7天', value: 7 },
  { label: '14天', value: 14 },
  { label: '30天', value: 30 },
  { label: '全部', value: 0 },
];

export default function CelebrityRank() {
  const [days, setDays] = useState(30);
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

  const maxReads = Math.max(...celebrities.map(c => c.avg_reads), 1);

  return (
    <div className="card p-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>艺人效果排行</h3>
        <div style={{ display: 'flex', gap: 2 }}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setDays(f.value)}
              style={{
                padding: '3px 10px', fontSize: 12, borderRadius: 6, border: 'none',
                background: days === f.value ? 'var(--accent)' : 'var(--border)',
                color: days === f.value ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {celebrities.map((c, i) => (
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
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                    均阅 {c.avg_reads.toLocaleString()} · {c.count} 篇
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${(c.avg_reads / maxReads) * 100}%`,
                    background: i < 3
                      ? 'linear-gradient(90deg, var(--accent), var(--accent-hover))'
                      : 'var(--text-muted)',
                    opacity: i < 3 ? 1 : 0.3,
                    transition: 'width 0.6s ease-out',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
