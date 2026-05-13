import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type HealthStatus, type DashboardStats, type OperationItem } from '../api/client';
import { useLoading } from '../hooks/useLoading';
import { useStore } from '../stores';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const ACTION_ICONS: Record<string, string> = {
  '搜索': '🔍', '下载图片': '⬇️', '加入队列': '📥',
  'AI 生成': '🤖', '保存草稿': '💾', '发布': '🚀',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { addToast } = useStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ops, setOps] = useState<OperationItem[]>([]);
  const [connError, setConnError] = useState(false);
  const { loading: loadingDashboard, withLoading: withLoad } = useLoading();
  const { loading: deleting, withLoading: withDelete } = useLoading();

  async function load() {
    await withLoad(async () => {
      try {
        const [h, s, o] = await Promise.all([
          dashboardApi.health(), dashboardApi.stats(), dashboardApi.operations(),
        ]);
        setHealth(h); setStats(s); setOps(o);
        setConnError(false);
      } catch { setConnError(true); }
    });
  }

  useEffect(() => { load(); }, []);

  const handleDeleteOp = useCallback(async (index: number) => {
    await withDelete(async () => {
      await dashboardApi.deleteOperations([index]);
      setOps(await dashboardApi.operations());
      addToast('已删除', 'info');
    });
  }, [addToast, withDelete]);

  const handleClearOps = useCallback(async () => {
    await withDelete(async () => {
      await dashboardApi.clearOperations();
      setOps([]);
      addToast('已清空操作记录', 'info');
    });
  }, [addToast, withDelete]);

  if (connError) return (
    <div className="empty-state py-24 animate-in">
      <div className="empty-state-icon">🔌</div>
      <div className="empty-state-title">无法连接后端服务</div>
      <div className="empty-state-desc mb-4">
        请确保已启动 <code className="bg-bg-secondary px-2 py-0.5 rounded text-xs">cd desktop && python main.py</code>
      </div>
      <button className="btn btn-primary btn-sm" onClick={load} disabled={loadingDashboard}>
        {loadingDashboard ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 连接中</> : '重试连接'}
      </button>
    </div>
  );

  const statusItems = [
    { label: '平台认证', ok: health?.platform_auth },
    { label: '微博 Cookie', ok: health?.weibo_cookie },
    { label: 'AI API Key', ok: health?.ai_api_key },
    { label: 'AI Base URL', ok: health?.ai_base_url },
  ];

  const statsItems = [
    { label: '本地图片', value: stats?.local_images ?? 0, path: '/materials' },
    { label: '待发布', value: stats?.queue_size ?? 0 },
    { label: '已选图片', value: stats?.selected_count ?? 0 },
    { label: '搜索结果', value: stats?.discovery_count ?? 0 },
  ];

  const quickActions = [
    { icon: '🔍', title: '搜索图文', desc: '从平台搜索优质内容', path: '/discovery' },
    { icon: '📝', title: '发布队列', desc: '查看和管理待发布内容', path: '/queue' },
    { icon: '⚙️', title: '系统设置', desc: '配置大模型和平台账号', path: '/settings' },
  ];

  return (
    <div className="space-y-6 animate-in">
      {/* Hero */}
      <div className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-soft/60 via-transparent to-transparent" />
        <div className="relative">
          <h1 className="text-2xl font-bold text-text tracking-tight">欢迎回来</h1>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed max-w-xl">
            自动化内容发布工具 —— 从微博/头条发现优质图文，
            <span className="text-accent font-medium">AI 生成标题和文案</span>，
            一键发布到微信公众号
          </p>
        </div>
      </div>

      {/* Status + Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statusItems.map((item) => (
          <div key={item.label} className="card text-center py-4">
            <div className="mb-2.5 flex justify-center">
              <span className={`status-dot ${item.ok ? 'online' : 'offline'}`} />
            </div>
            <div className="text-[11px] text-text-muted font-medium uppercase tracking-wider">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statsItems.map((item) => (
          <div
            key={item.label}
            className={`card text-center py-5 ${item.path ? 'card-hover' : ''}`}
            onClick={() => item.path && navigate(item.path)}
          >
            <div className="text-3xl font-bold text-text tabular-nums tracking-tight">{item.value}</div>
            <div className="text-xs text-text-muted mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="section-header mb-4">快捷操作</div>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((a) => (
            <div
              key={a.path}
              onClick={() => navigate(a.path)}
              className="relative overflow-hidden rounded-xl bg-bg-secondary p-5 text-center cursor-pointer transition-all duration-200 hover:bg-accent-soft hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="text-2xl mb-2">{a.icon}</div>
              <div className="text-sm font-semibold text-text">{a.title}</div>
              <div className="text-xs text-text-muted mt-0.5">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Operations */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="section-header">最近操作</div>
          {ops.length > 0 && (
            <button className="btn btn-ghost btn-xs text-text-muted" onClick={handleClearOps} disabled={deleting}>
              清空
            </button>
          )}
        </div>
        {ops.length === 0 ? (
          <div className="empty-state py-8">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">暂无操作记录</div>
          </div>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto -mx-1">
            {ops.map((op, i) => (
              <div key={i} className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border-b border-border-subtle last:border-0 text-sm hover:bg-accent-softer transition-colors">
                <span className="text-base shrink-0">{ACTION_ICONS[op.action] || '📌'}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-text-secondary truncate block">{op.detail || op.action}</span>
                </div>
                <span className="text-xs text-text-muted shrink-0 tabular-nums">{timeAgo(op.time)}</span>
                <button
                  onClick={() => handleDeleteOp(i)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-muted opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-all"
                  title="删除"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
