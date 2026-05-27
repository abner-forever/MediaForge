import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { articleApi, dashboardApi, queueApi, wechatAccountApi, type ArticleItem, type HealthStatus, type DashboardStats, type OperationItem, type QueueItem, type WeChatAccount } from '../../api/client';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import { I } from './Icons';
import GlowOrb from './GlowOrb';
import HeroSection from './HeroSection';
import StatCards from './StatCards';
import StudioActions from './StudioActions';
import OperationsList from './OperationsList';

export default function Dashboard() {
  const navigate = useNavigate();
  const { addToast } = useStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ops, setOps] = useState<OperationItem[]>([]);
  const [opsTotal, setOpsTotal] = useState(0);
  const [opsPage, setOpsPage] = useState(1);
  const [recentQueue, setRecentQueue] = useState<QueueItem[]>([]);
  const [recentDrafts, setRecentDrafts] = useState<ArticleItem[]>([]);
  const [defaultAccount, setDefaultAccount] = useState<WeChatAccount | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);
  const pageSize = 10;
  const [connError, setConnError] = useState(false);
  const { loading: loadingDashboard, withLoading: withLoad } = useLoading();
  const { loading: deleting, withLoading: withDelete } = useLoading();

  async function load() {
    await withLoad(async () => {
      try {
        const [h, s, o, q, drafts, accounts] = await Promise.all([
          dashboardApi.health(),
          dashboardApi.stats(),
          dashboardApi.operations(1, pageSize),
          queueApi.get(),
          articleApi.list('draft'),
          wechatAccountApi.list(),
        ]);
        setHealth(h); setStats(s); setOps(o.items); setOpsTotal(o.total); setOpsPage(1);
        setRecentQueue(q.queue.slice(-3).reverse());
        setRecentDrafts(drafts.articles.slice(0, 3));
        setDefaultAccount(accounts.accounts.find(a => a.is_default) || accounts.accounts[0] || null);
        setConnError(false);
      } catch { setConnError(true); }
    });
  }

  async function loadOps(page: number) {
    setLoadingOps(true);
    try {
      const result = await dashboardApi.operations(page, pageSize);
      if (page === 1) {
        setOps(result.items);
      } else {
        setOps(prev => [...prev, ...result.items]);
      }
      setOpsTotal(result.total);
      setOpsPage(page);
    } finally {
      setLoadingOps(false);
    }
  }

  useEffect(() => { load(); }, []);

  const handleDeleteOp = useCallback(async (opId: string) => {
    await withDelete(async () => {
      await dashboardApi.deleteOperations([opId]);
      await loadOps(1);
      addToast('已删除', 'info');
    });
  }, [addToast, withDelete]);

  const handleClearOps = useCallback(async () => {
    await withDelete(async () => {
      await dashboardApi.clearOperations();
      setOps([]);
      setOpsTotal(0);
      addToast('已清空操作记录', 'info');
    });
  }, [addToast, withDelete]);

  if (connError) return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, rgba(120,104,208,0.04), rgba(160,120,208,0.03))',
      border: '1px solid var(--border)',
      borderRadius: 18,
      padding: '80px 0',
      textAlign: 'center',
      boxShadow: 'var(--card-shadow)',
    }}>
      <GlowOrb color="rgba(239,68,68,0.12)" size={320} style={{ top: -80, right: -80 }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ opacity: 0.4, color: 'var(--danger)', display: 'flex', justifyContent: 'center' }}>{I.plug(48)}</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>无法连接后端服务</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
          请确保已启动
          <code style={{ margin: '0 8px', padding: '4px 10px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12 }}>cd desktop && python main.py</code>
        </p>
        <button
          onClick={load}
          disabled={loadingDashboard}
          style={{
            padding: '10px 28px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 12,
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7868d0, #a078d0)',
            boxShadow: '0 4px 16px rgba(120,104,208,0.25)',
          }}
        >
          {loadingDashboard ? '连接中…' : '重试连接'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <HeroSection health={health} />
      <StatCards stats={stats} navigate={navigate} />
      <StudioActions navigate={navigate} />
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs font-semibold text-text-muted mb-2">当前默认公众号</div>
          <div className="text-base font-bold text-text">{defaultAccount?.name || '未设置账号'}</div>
          <div className={`text-sm mt-1 ${defaultAccount?.logged_in ? 'text-success' : 'text-danger'}`}>
            {defaultAccount?.logged_in ? '已登录，可用于发布' : '未登录，请先扫码'}
          </div>
          <button className="btn btn-sm mt-4" onClick={() => navigate('/settings')}>切换或登录</button>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-text-muted">待发布队列</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/queue')}>查看</button>
          </div>
          <div className="space-y-2">
            {recentQueue.length ? recentQueue.map((item, i) => (
              <div key={item.id || i} className="text-sm">
                <div className="font-medium text-text truncate">{item.title || '无标题'}</div>
                <div className="text-xs text-text-muted">{item.images?.length || 0} 张图片 · {item.status || 'queued'}</div>
              </div>
            )) : <div className="text-sm text-text-muted">暂无待发布内容</div>}
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-text-muted">最近草稿</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/articles')}>写文章</button>
          </div>
          <div className="space-y-2">
            {recentDrafts.length ? recentDrafts.map((item) => (
              <div key={item.id} className="text-sm">
                <div className="font-medium text-text truncate">{item.title || '无标题'}</div>
                <div className="text-xs text-text-muted">{new Date(item.updated_at).toLocaleString()}</div>
              </div>
            )) : <div className="text-sm text-text-muted">还没有文章草稿</div>}
          </div>
        </div>
      </section>
      <OperationsList
        ops={ops}
        opsTotal={opsTotal}
        loadingOps={loadingOps}
        deleting={deleting}
        onLoadMore={() => loadOps(opsPage + 1)}
        onDelete={handleDeleteOp}
        onClear={handleClearOps}
      />
    </div>
  );
}
