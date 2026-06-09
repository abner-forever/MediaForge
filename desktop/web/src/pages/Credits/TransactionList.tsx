import { useEffect, useState, useCallback } from 'react';
import type { CreditTransaction } from '../../types';
import { creditsApi } from '../../api/client';

const SOURCE_LABELS: Record<string, string> = {
  gift: '系统赠送',
  checkin: '每日签到',
  publish: '发布文章',
  ad_watch: '观看广告',
  invite: '邀请好友',
  task: '完成任务',
  purchase: '购买积分',
};

export default function TransactionList() {
  const [items, setItems] = useState<CreditTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await creditsApi.history(p, pageSize);
      if (p === 1) {
        setItems(result.transactions);
      } else {
        setItems(prev => [...prev, ...result.transactions]);
      }
      setTotal(result.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const hasMore = items.length < total;

  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>积分明细</div>

      {items.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          暂无积分记录
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((tx) => (
          <div
            key={tx.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                {tx.description || SOURCE_LABELS[tx.source] || tx.source}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {new Date(tx.created_at).toLocaleString()}
              </div>
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: tx.amount > 0 ? 'var(--success)' : 'var(--danger)',
                whiteSpace: 'nowrap',
                marginLeft: 16,
              }}
            >
              {tx.amount > 0 ? '+' : ''}{tx.amount}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => load(page + 1)}
          disabled={loading}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '8px 0',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {loading ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  );
}
