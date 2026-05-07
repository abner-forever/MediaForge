import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type HealthStatus, type DashboardStats, type RunInfo } from '../api/client';

const HEALTH_ITEMS = [
  { key: 'weibo_cookie' as const, name: '微博 Cookie' },
  { key: 'weibo_uid_or_celebrities' as const, name: '微博 UID/明星' },
  { key: 'ai_api_key' as const, name: 'AI API Key' },
  { key: 'ai_base_url' as const, name: 'AI Base URL' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [connError, setConnError] = useState(false);

  async function load() {
    try {
      const [h, s, r] = await Promise.all([dashboardApi.health(), dashboardApi.stats(), dashboardApi.runs()]);
      setHealth(h); setStats(s); setRuns(r);
      setConnError(false);
    } catch {
      setConnError(true);
    }
  }

  useEffect(() => { load(); }, []);

  if (connError) return (
    <div className="flex flex-col items-center justify-center py-24 space-y-4">
      <div className="text-4xl opacity-30">🔌</div>
      <p className="text-sm text-text-muted">无法连接后端服务</p>
      <p className="text-xs text-text-muted">请确保已启动：<code className="bg-bg-secondary px-2 py-0.5 rounded text-[12px]">cd desktop && python main.py</code></p>
      <button className="btn btn-sm" onClick={load}>重试</button>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">仪表盘</h2>
        <p className="text-xs text-text-muted mt-0.5">系统状态概览</p>
      </div>

      {/* Health */}
      <div className="grid grid-cols-4 gap-2.5">
        {HEALTH_ITEMS.map((item) => (
          <div key={item.key} className="bg-bg-card border border-border rounded-xl p-3.5 text-center">
            <div className="flex justify-center">
              <span className={`w-2 h-2 rounded-full ${health?.[item.key] ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </div>
            <div className="mt-2 text-[11px] text-text-muted">{item.name}</div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div
          className="bg-bg-card border border-border rounded-xl p-4 text-center cursor-pointer hover:border-text-muted transition-colors"
          onClick={() => navigate('/materials')}
        >
          <div className="text-2xl font-semibold tabular-nums">{stats?.local_images ?? 0}</div>
          <div className="text-[11px] text-text-muted mt-1">本地图片</div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold tabular-nums">{stats?.queue_size ?? 0}</div>
          <div className="text-[11px] text-text-muted mt-1">待发布</div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold tabular-nums">{stats?.selected_count ?? 0}</div>
          <div className="text-[11px] text-text-muted mt-1">已选图片</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-text-muted mb-3">快速操作</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: '🔍', title: '搜图', desc: '从微博搜索明星美图', path: '/discovery' },
            { icon: '📝', title: '发布', desc: '查看发布队列', path: '/queue' },
            { icon: '⚙️', title: '设置', desc: '配置大模型和微博', path: '/settings' },
          ].map((a) => (
            <div
              key={a.path}
              onClick={() => navigate(a.path)}
              className="bg-bg-secondary rounded-xl p-4 text-center cursor-pointer hover:border hover:border-text-muted transition-all group"
            >
              <div className="text-xl mb-1">{a.icon}</div>
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Runs */}
      <div className="bg-bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-text-muted mb-3">最近运行</h3>
        {runs.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-6">暂无运行记录</p>
        ) : (
          <div className="space-y-0">
            {runs.map((r) => (
              <div key={r.run_id} className="flex items-center gap-3 text-[13px] py-2.5 border-b border-border-subtle last:border-0">
                <span className="font-mono text-xs text-text-muted">{r.run_id}</span>
                <span className="text-text-secondary">
                  处理 {r.processed} 篇{r.failed ? `，失败 ${r.failed}` : ''}
                </span>
                <span className={`ml-auto text-xs ${r.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {r.status === 'completed' ? '完成' : '进行中'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
