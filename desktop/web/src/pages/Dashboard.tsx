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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  const color = ok === undefined ? 'bg-gray-600' : ok ? 'bg-green-400' : 'bg-red-400';
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className={`absolute inset-0 rounded-full ${color}`} />
      {ok && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />}
    </span>
  );
}

function GlowOrb({ className, color = 'var(--accent)', size = 'w-80 h-80' }: { className?: string; color?: string; size?: string }) {
  return (
    <div
      className={`absolute rounded-full blur-[100px] pointer-events-none ${size} ${className || ''}`}
      style={{
        background: `radial-gradient(circle at center, ${color}, transparent 70%)`,
      }}
    />
  );
}

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
    <div className="cyber-card-hero relative overflow-hidden rounded-2xl">
      <div className="cyber-grid absolute inset-0" />
      <GlowOrb className="-top-32 -right-32 w-80 h-80" color="#ef4444" />
      <div className="relative py-20 text-center space-y-4">
        <div className="text-5xl mb-2 opacity-40">🔌</div>
        <h2 className="text-lg font-bold text-white/70">无法连接后端服务</h2>
        <p className="text-sm text-white/40 max-w-md mx-auto">
          请确保已启动
          <code className="mx-2 px-2.5 py-1 rounded-lg bg-white/[0.04] text-[var(--accent)] font-mono text-xs border border-white/[0.06]">
            cd desktop && python main.py
          </code>
        </p>
        <button
          onClick={load}
          disabled={loadingDashboard}
          className="relative px-7 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--accent), #a855f7)',
            boxShadow: '0 0 24px var(--accent-glow)',
          }}
        >
          {loadingDashboard ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              连接中
            </span>
          ) : '重试连接'}
        </button>
      </div>
    </div>
  );

  const statusItems: { label: string; ok: boolean | undefined }[] = [
    { label: '平台认证', ok: health?.platform_auth },
    { label: '微博 Cookie', ok: health?.weibo_cookie },
    { label: 'AI API Key', ok: health?.ai_api_key },
    { label: 'AI Base URL', ok: health?.ai_base_url },
  ];

  const statCards = [
    { label: '本地图片', value: stats?.local_images ?? 0, path: '/materials', icon: '🖼️' },
    { label: '待发布', value: stats?.queue_size ?? 0, path: '/queue', icon: '📤' },
    { label: '已选图片', value: stats?.selected_count ?? 0, icon: '✅' },
    { label: '搜索结果', value: stats?.discovery_count ?? 0, icon: '🎯' },
  ];

  const quickActions = [
    { icon: '🔍', title: '发现图文', desc: '从微博 / 头条搜索优质内容', path: '/discovery' },
    { icon: '📝', title: '发布队列', desc: '管理和发布待处理内容', path: '/queue' },
    { icon: '⚙️', title: '系统设置', desc: '配置大模型和平台账号', path: '/settings' },
  ];

  return (
    <div className="space-y-6 animate-in">
      {/* ── Hero ── */}
      <section className="cyber-card-hero relative overflow-hidden rounded-2xl p-8 md:p-10">
        <div className="cyber-grid absolute inset-0 opacity-60" />
        <div className="cyber-scanline absolute inset-0" />
        <GlowOrb className="-top-32 -right-32 w-80 h-80" />
        <GlowOrb className="-bottom-24 -left-24 w-64 h-64" color="#a855f7" />

        <div className="relative space-y-6">
          <div className="space-y-3">
            <h1 className="text-[1.65rem] md:text-[2rem] font-bold tracking-tight leading-[1.15] gradient-text-cyber">
              {getGreeting()}，创作者
            </h1>
            <p className="text-sm text-white/40 max-w-xl leading-relaxed">
              AI 驱动的图文创作工作流 —— 发现、评分、发布，一站式完成
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5 border-t border-white/[0.05]">
            {statusItems.map((item) => (
              <span key={item.label} className="flex items-center gap-2 text-xs text-white/35">
                <StatusDot ok={item.ok} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((item) => (
          <div
            key={item.label}
            onClick={() => item.path && navigate(item.path)}
            className="cyber-card group relative overflow-hidden rounded-xl p-6 md:p-7 text-center cursor-pointer"
          >
            <div className="cyber-accent-bar" />
            <div className="cyber-orb w-32 h-32 -top-12 -right-12 opacity-0" style={{ background: 'radial-gradient(circle, var(--accent), transparent)' }} />

            <div className="relative z-10">
              <div className="text-xl mb-2.5 text-white/20 group-hover:text-white/40 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3 inline-block">
                {item.icon}
              </div>
              <div className="text-2xl md:text-3xl font-bold tabular-nums tracking-tight leading-none mb-1.5 gradient-text-cyber">
                {item.value}
              </div>
              <div className="text-[11px] text-white/30 font-medium tracking-wider uppercase">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Studio Actions ── */}
      <section>
        <div className="cyber-header-bar mb-4">
          <span className="cyber-header">创作工作室</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {quickActions.map((a) => (
            <div
              key={a.path}
              onClick={() => navigate(a.path)}
              className="cyber-card group relative overflow-hidden rounded-xl p-8 md:p-9 text-center cursor-pointer"
            >
              <div className="cyber-accent-bar" />
              <div className="cyber-orb w-40 h-40 -top-16 -right-16 opacity-0" style={{ background: 'radial-gradient(circle, var(--accent), transparent)' }} />
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-white/[0.015] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative z-10">
                <div className="text-[2.5rem] mb-4 inline-block group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500 ease-out">
                  {a.icon}
                </div>
                <div className="text-sm font-semibold text-white/65 group-hover:text-white transition-colors duration-300">
                  {a.title}
                </div>
                <div className="text-xs text-white/25 mt-2 leading-relaxed group-hover:text-white/35 transition-colors duration-300">
                  {a.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Operations ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="cyber-header-bar">
            <span className="cyber-header">最近操作</span>
          </div>
          {ops.length > 0 && (
            <button
              onClick={handleClearOps}
              disabled={deleting}
              className="text-[11px] font-medium text-white/20 hover:text-white/40 tracking-widest uppercase transition-colors duration-200"
            >
              清空记录
            </button>
          )}
        </div>

        {ops.length === 0 ? (
          <div className="cyber-card relative overflow-hidden rounded-xl py-12 text-center">
            <div className="cyber-grid absolute inset-0 opacity-60" />
            <GlowOrb className="-top-32 -right-32 w-64 h-64" />
            <div className="relative space-y-2">
              <div className="text-3xl opacity-20">📋</div>
              <div className="text-sm text-white/30 font-medium">暂无操作记录</div>
              <div className="text-xs text-white/20">开始使用后，操作记录将展示在这里</div>
            </div>
          </div>
        ) : (
          <div className="cyber-card relative overflow-hidden rounded-xl">
            <div className="cyber-grid absolute inset-0 opacity-60" />
            <div className="relative max-h-64 overflow-y-auto">
              {ops.map((op, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 px-4 py-3.5 text-sm transition-all duration-200 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03]"
                >
                  <span className="text-base shrink-0 opacity-50 group-hover:opacity-80 transition-opacity">
                    {ACTION_ICONS[op.action] || '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white/45 truncate block group-hover:text-white/65 transition-colors duration-200">
                      {op.detail || op.action}
                    </span>
                  </div>
                  <span className="text-xs text-white/20 shrink-0 tabular-nums">{timeAgo(op.time)}</span>
                  <button
                    onClick={() => handleDeleteOp(i)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/15 opacity-0 group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-400 transition-all duration-200"
                    title="删除"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
