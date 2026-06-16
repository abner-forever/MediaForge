import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';
import Select from '../../components/Select';
import { formatCount } from '../../utils/format';

interface FunnelData {
  total_reads: number;
  total_likes: number;
  total_shares: number;
  total_favorites: number;
  total_comments: number;
}

const STEPS = [
  { key: 'total_reads' as const, label: '阅读', color: '#3b82f6' },
  { key: 'total_likes' as const, label: '点赞', color: '#f59e0b' },
  { key: 'total_favorites' as const, label: '收藏', color: '#10b981' },
  { key: 'total_comments' as const, label: '评论', color: '#8b5cf6' },
  { key: 'total_shares' as const, label: '转发', color: '#ef4444' },
];

export default function FunnelChart({ days }: { days: number }) {
  const [articleId, setArticleId] = useState('');
  const [articles, setArticles] = useState<
    Array<{ item_id: string; title: string; publish_time: string }>
  >([]);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    effectsApi
      .articleOptions()
      .then((res) => setArticles(res.articles))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await effectsApi.funnel(days, articleId);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, articleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!loading && !data) return null;

  const values = STEPS.map((s) => data?.[s.key] ?? 0);
  const maxVal = Math.max(...values, 1);

  return (
    <div className="card p-4">
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
        互动漏斗
      </h3>

      {articles.length > 0 && (
        <div style={{ marginBottom: 16, maxWidth: 280 }}>
          <Select
            value={articleId}
            onChange={setArticleId}
            placeholder="全部文章"
            size="sm"
            options={[
              { label: '全部文章', value: '' },
              ...articles.map((a) => ({
                label:
                  (a.title || '(无标题)').slice(0, 40) +
                  (a.title && a.title.length > 40 ? '...' : ''),
                value: a.item_id,
              })),
            ]}
          />
        </div>
      )}

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '20px 0',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          加载中...
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STEPS.map((step, i) => {
              const val = values[i];
              const pct = maxVal > 0 ? val / maxVal : 0;
              const rate =
                i > 0 && values[i - 1] > 0 ? ((val / values[i - 1]) * 100).toFixed(1) : null;
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 32,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {step.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 24,
                        borderRadius: 4,
                        background: 'var(--border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          width: `${pct * 100}%`,
                          background: step.color,
                          opacity: 0.8,
                          transition: 'width 0.6s ease-out',
                        }}
                      />
                    </div>
                  </div>
                  <span
                    title={val.toLocaleString()}
                    style={{
                      width: 64,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text)',
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {formatCount(val)}
                  </span>
                  {rate && (
                    <span
                      style={{
                        width: 48,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {rate}%
                    </span>
                  )}
                  {!rate && <span style={{ width: 48, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              margin: '12px 0 0',
              textAlign: 'center',
            }}
          >
            百分比为相邻步骤的转化率
          </p>
        </>
      )}
    </div>
  );
}
