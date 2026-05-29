import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';
import type { ImageAnalysisItem } from '../../types';

export default function ImageAnalysis() {
  const [items, setItems] = useState<ImageAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await effectsApi.imageAnalysis();
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!loading && items.length === 0) return null;

  const maxReads = Math.max(...items.map(i => i.avg_reads), 1);

  return (
    <div className="card p-4">
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
        图片数量 vs 阅读量
      </h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px' }}>
          {items.map((item, i) => {
            const h = (item.avg_reads / maxReads) * 130;
            return (
              <div key={item.image_count} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                  {item.avg_reads.toLocaleString()}
                </span>
                <div style={{
                  width: '100%', maxWidth: 48, borderRadius: '4px 4px 0 0',
                  height: Math.max(h, 4),
                  background: i === items.reduce((bi, b, idx) =>
                    b.avg_reads > items[bi].avg_reads ? idx : bi, 0)
                    ? 'linear-gradient(180deg, var(--accent), var(--accent-hover))'
                    : 'var(--border)',
                  opacity: 0.8,
                  transition: 'height 0.6s ease-out',
                }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {item.image_count}图
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  ({item.count}篇)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
