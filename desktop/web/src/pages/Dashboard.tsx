import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type HealthStatus, type DashboardStats, type OperationItem } from '../api/client';

const HEALTH_ITEMS = [
  { key: 'weibo_cookie' as const, name: '微博 Cookie' },
  { key: 'weibo_uid_or_celebrities' as const, name: '微博 UID/明星' },
  { key: 'ai_api_key' as const, name: 'AI API Key' },
  { key: 'ai_base_url' as const, name: 'AI Base URL' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const ACTION_ICONS: Record<string, string> = {
  '搜索': '🔍',
  '下载图片': '⬇️',
  '加入队列': '📥',
  'AI 生成': '🤖',
  '保存草稿': '💾',
  '发布': '🚀',
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
        dashboardApi.health(),
        dashboardApi.stats(),
        dashboardApi.operations(),
      ]);
      setHealth(h); setStats(s); setOps(o);
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
      {/* 介绍区块 */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-lg font-semibold tracking-tight">欢迎使用图文工坊</h2>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          自动化内容发布工具：从微博发现优质图文 → AI 生成标题和文案 → 一键发布到微信公众号
        </p>
      </div>

      {/* 配置状态 */}
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

      {/* 统计数据 */}
      <div className="grid grid-cols-4 gap-2.5">
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
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-semibold tabular-nums">{stats?.discovery_count ?? 0}</div>
          <div className="text-[11px] text-text-muted mt-1">搜索结果</div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-text-muted mb-3">快捷操作</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: '🔍', title: '搜图', desc: '从微博搜索优质图文', path: '/discovery' },
            { icon: '📝', title: '发布队列', desc: '查看和管理待发布内容', path: '/queue' },
            { icon: '⚙️', title: '设置', desc: '配置大模型和微博账号', path: '/settings' },
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

      {/* 最近操作 */}
      <div className="bg-bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-text-muted mb-3">最近操作</h3>
        {ops.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-2xl mb-2 opacity-30">📋</div>
            <p className="text-xs text-text-muted">暂无操作记录</p>
            <p className="text-[11px] text-text-muted mt-1">搜索微博图片后将在此显示</p>
          </div>
        ) : (
          <div className="space-y-0 max-h-64 overflow-y-auto">
            {ops.map((op, i) => (
              <div key={i} className="flex items-center gap-3 text-[13px] py-2.5 border-b border-border-subtle last:border-0">
                <span className="text-base">{ACTION_ICONS[op.action] || '📌'}</span>
                <span className="text-text-secondary flex-1 truncate">{op.detail || op.action}</span>
                <span className="text-[11px] text-text-muted shrink-0">{timeAgo(op.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
