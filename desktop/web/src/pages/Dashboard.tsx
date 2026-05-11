import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type HealthStatus, type DashboardStats, type OperationItem } from '../api/client';

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
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ops, setOps] = useState<OperationItem[]>([]);
  const [connError, setConnError] = useState(false);

  async function load() {
    try {
      const [h, s, o] = await Promise.all([
        dashboardApi.health(), dashboardApi.stats(), dashboardApi.operations(),
      ]);
      setHealth(h); setStats(s); setOps(o);
      setConnError(false);
    } catch { setConnError(true); }
  }

  useEffect(() => { load(); }, []);

  if (connError) return (
    <div className="empty-state py-24 animate-in">
      <div className="empty-state-icon">🔌</div>
      <div className="empty-state-title">无法连接后端服务</div>
      <div className="empty-state-desc mb-4">
        请确保已启动 <code className="bg-bg-secondary px-1.5 py-0.5 rounded text-xs">cd desktop && python main.py</code>
      </div>
      <button className="btn btn-primary btn-sm" onClick={load}>重试连接</button>
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
    <div className="space-y-5 animate-in">
      {/* Hero */}
      <div className="card relative overflow-hidden">
        <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-accent" />
        <h2 className="text-xl font-bold text-text tracking-tight pl-3">欢迎使用图文工坊</h2>
        <p className="text-sm text-text-secondary mt-1.5 leading-relaxed max-w-2xl">
          自动化内容发布工具 —— 从微博/头条发现优质图文，
          <span className="text-accent">AI 生成标题和文案</span>，
          一键发布到微信公众号
        </p>
      </div>

      {/* Status */}
      <div className="grid grid-cols-4 gap-3">
        {statusItems.map((item) => (
          <div key={item.label} className="card text-center py-4">
            <div className={`inline-flex items-center justify-center w-3 h-3 rounded-full ${item.ok ? 'bg-accent' : 'bg-danger'} mb-2`}>
              <div className={`w-1.5 h-1.5 rounded-full ${item.ok ? 'bg-[var(--accent)]/40' : 'bg-danger/40'}`} />
            </div>
            <div className="text-xs text-text-muted">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {statsItems.map((item) => (
          <div
            key={item.label}
            className={`card text-center py-5 ${item.path ? 'card-hover' : ''}`}
            onClick={() => item.path && navigate(item.path)}
          >
            <div className="text-3xl font-bold text-text tabular-nums tracking-tight">{item.value}</div>
            <div className="text-xs text-text-muted mt-0.5">{item.label}</div>
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
              className="bg-bg-secondary rounded-xl p-5 text-center cursor-pointer transition-all hover:bg-accent-soft hover:shadow-sm"
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
        <div className="section-header mb-4">最近操作</div>
        {ops.length === 0 ? (
          <div className="empty-state py-8">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">暂无操作记录</div>
          </div>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto -mx-1">
            {ops.map((op, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-b border-border-subtle last:border-0 text-sm hover:bg-accent-softer transition-colors">
                <span className="text-base shrink-0">{ACTION_ICONS[op.action] || '📌'}</span>
                <span className="text-text-secondary flex-1 truncate">{op.detail || op.action}</span>
                <span className="text-xs text-text-muted shrink-0">{timeAgo(op.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
