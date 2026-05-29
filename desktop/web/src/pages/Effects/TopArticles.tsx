import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';
import type { TopArticle } from '../../types';

export default function TopArticles() {
  const [articles, setArticles] = useState<TopArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await effectsApi.topArticles(10);
      setArticles(res.articles);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!loading && articles.length === 0) return <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>暂无数据</div>;

  return (
    <>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {articles.map((a, i) => {
            const interactions = a.likes + a.comments + a.shares + a.favorites;
            const rate = a.reads > 0 ? ((interactions / a.reads) * 100).toFixed(1) : '0';
            return (
              <div key={a.item_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: i < articles.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  width: 20, fontSize: 12, fontWeight: 700, textAlign: 'center', flexShrink: 0,
                  color: i < 3 ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {a.title || '(无标题)'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                    {a.celebrity && <span>{a.celebrity}</span>}
                    <span>阅 {a.reads.toLocaleString()}</span>
                    <span>赞 {a.likes.toLocaleString()}</span>
                    <span>互动率 {rate}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
