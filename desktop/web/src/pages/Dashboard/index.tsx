import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type HealthStatus, type DashboardStats, type OperationItem } from '../../api/client';
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
  const [loadingOps, setLoadingOps] = useState(false);
  const pageSize = 10;
  const [connError, setConnError] = useState(false);
  const { loading: loadingDashboard, withLoading: withLoad } = useLoading();
  const { loading: deleting, withLoading: withDelete } = useLoading();

  async function load() {
    await withLoad(async () => {
      try {
        const [h, s, o] = await Promise.all([
          dashboardApi.health(), dashboardApi.stats(), dashboardApi.operations(1, pageSize),
        ]);
        setHealth(h); setStats(s); setOps(o.items); setOpsTotal(o.total); setOpsPage(1);
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
      background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
      border: '1px solid #e2e8f0',
      borderRadius: 16,
      padding: '80px 0',
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <GlowOrb color="rgba(239,68,68,0.15)" size={320} style={{ top: -80, right: -80 }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ opacity: 0.4, color: '#ef4444', display: 'flex', justifyContent: 'center' }}>{I.plug(48)}</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', margin: 0 }}>无法连接后端服务</h2>
        <p style={{ fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto' }}>
          请确保已启动
          <code style={{ margin: '0 8px', padding: '4px 10px', borderRadius: 6, background: '#eef2ff', color: '#4f8cff', fontSize: 12 }}>cd desktop && python main.py</code>
        </p>
        <button
          onClick={load}
          disabled={loadingDashboard}
          style={{
            padding: '10px 28px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #4f8cff, #a855f7)',
            boxShadow: '0 4px 14px rgba(79,140,255,0.3)',
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
