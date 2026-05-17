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

/* ---------- SVG icons ---------- */
function Svg({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }}>
      {children}
    </svg>
  );
}

const I = {
  image: (s: number) => <Svg size={s}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></Svg>,
  upload: (s: number) => <Svg size={s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Svg>,
  check: (s: number) => <Svg size={s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Svg>,
  target: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Svg>,
  search: (s: number) => <Svg size={s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></Svg>,
  edit: (s: number) => <Svg size={s}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></Svg>,
  gear: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>,
  download: (s: number) => <Svg size={s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Svg>,
  plus: (s: number) => <Svg size={s}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></Svg>,
  cpu: (s: number) => <Svg size={s}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M1 9h3"/><path d="M20 9h3"/><path d="M1 15h3"/><path d="M20 15h3"/></Svg>,
  save: (s: number) => <Svg size={s}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></Svg>,
  send: (s: number) => <Svg size={s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Svg>,
  pin: (s: number) => <Svg size={s}><line x1="12" y1="17" x2="12" y2="22"/><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17h8v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2"/></Svg>,
  plug: (s: number) => <Svg size={s}><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/></Svg>,
  list: (s: number) => <Svg size={s}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="16" y2="15"/><path d="M9 3v2"/><path d="M15 3v2"/></Svg>,
};

/* ---------- Decorative glow orb (light version) ---------- */
function GlowOrb({ color = '#4f8cff', size = 320, style }: { color?: string; size?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'absolute',
      borderRadius: '50%',
      width: size,
      height: size,
      background: `radial-gradient(circle at center, ${color}, transparent 70%)`,
      filter: 'blur(80px)',
      pointerEvents: 'none',
      ...style,
    }} />
  );
}

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
  const bg = ok === undefined ? '#94a3b8' : ok ? '#10b981' : '#ef4444';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: bg }} />
      {ok && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: bg, animation: 'pulse-ring 2s ease-out infinite', opacity: 0.5 }} />}
    </span>
  );
}

/* Color themes for stat cards */
const CARD_THEMES = [
  { accent: '#06b6d4', glow: 'rgba(6,182,212,0.2)', bg: 'linear-gradient(135deg, rgba(6,182,212,0.08), transparent 70%)', border: 'rgba(6,182,212,0.2)' },
  { accent: '#4f8cff', glow: 'rgba(79,140,255,0.2)', bg: 'linear-gradient(135deg, rgba(79,140,255,0.08), transparent 70%)', border: 'rgba(79,140,255,0.2)' },
  { accent: '#10b981', glow: 'rgba(16,185,129,0.2)', bg: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent 70%)', border: 'rgba(16,185,129,0.2)' },
  { accent: '#a855f7', glow: 'rgba(168,85,247,0.2)', bg: 'linear-gradient(135deg, rgba(168,85,247,0.08), transparent 70%)', border: 'rgba(168,85,247,0.2)' },
];

const ACTION_ICONS: Record<string, React.ReactNode> = {
  '搜索': I.search(14), '下载图片': I.download(14), '加入队列': I.plus(14),
  'AI 生成': I.cpu(14), '保存草稿': I.save(14), '发布': I.send(14),
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

  const statusItems: { label: string; ok: boolean | undefined }[] = [
    { label: '平台认证', ok: health?.platform_auth },
    { label: '微博 Cookie', ok: health?.weibo_cookie },
    { label: 'AI API Key', ok: health?.ai_api_key },
    { label: 'AI Base URL', ok: health?.ai_base_url },
  ];

  const statList = [
    { label: '本地图片', value: stats?.local_images ?? 0, path: '/materials', icon: I.image(24) },
    { label: '发布队列', value: stats?.queue_size ?? 0, path: '/queue', icon: I.upload(24) },
    { label: '已选图片', value: stats?.selected_count ?? 0, icon: I.check(24) },
    { label: '搜索结果', value: stats?.discovery_count ?? 0, icon: I.target(24) },
  ];

  const actionList = [
    { icon: I.search(36), title: '发现图文', desc: '从微博 / 头条搜索优质内容', path: '/discovery', theme: CARD_THEMES[0] },
    { icon: I.edit(36), title: '发布队列', desc: '管理和发布待处理内容', path: '/queue', theme: CARD_THEMES[1] },
    { icon: I.gear(36), title: '系统设置', desc: '配置大模型和平台账号', path: '/settings', theme: CARD_THEMES[3] },
  ];

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Hero ── */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        background: [
          'radial-gradient(ellipse at 80% 0%, rgba(79,140,255,0.12), transparent 60%)',
          'radial-gradient(ellipse at 20% 100%, rgba(168,85,247,0.08), transparent 50%)',
          'radial-gradient(ellipse at 50% 50%, rgba(6,182,212,0.04), transparent 40%)',
          '#ffffff',
        ].join(', '),
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Grid mesh */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: [
            'linear-gradient(rgba(79,140,255,0.04) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(79,140,255,0.04) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '36px 36px',
        }} />
        {/* Glow orbs */}
        <GlowOrb color="rgba(79,140,255,0.12)" size={320} style={{ top: -100, right: -80 }} />
        <GlowOrb color="rgba(168,85,247,0.08)" size={260} style={{ bottom: -80, left: -60 }} />
        {/* Glass card */}
        <div style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '32px 40px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h1 style={{
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.6px',
                margin: 0,
                background: 'linear-gradient(135deg, #1e293b 0%, #4f8cff 60%, #a855f7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {getGreeting()}，创作者
              </h1>
              <p style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: '#64748b', margin: '8px 0 0', maxWidth: 520 }}>
                AI 驱动的图文创作工作流 — 发现、评分、发布，一站式完成
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              {statusItems.map((item) => (
                <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
                  <StatusDot ok={item.ok} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {statList.map((item, i) => {
          const theme = CARD_THEMES[i];
          return (
            <div
              key={item.label}
              onClick={() => item.path && navigate(item.path)}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: `${theme.bg}, #ffffff`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: '24px 20px',
                textAlign: 'center',
                cursor: item.path ? 'pointer' : 'default',
                transition: 'all 0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={(e) => {
                if (item.path) {
                  e.currentTarget.style.borderColor = theme.accent;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 8px 25px ${theme.glow}`;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
            >
              {/* Accent bar */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: '20%',
                right: '20%',
                height: 2.5,
                background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
                borderRadius: '0 0 3px 3px',
              }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  marginBottom: 12,
                  color: theme.accent,
                  transition: 'transform 0.3s',
                }}
                  className="stats-icon"
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1) rotate(-3deg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  {item.icon}
                </div>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  lineHeight: 1,
                  marginBottom: 6,
                  fontFeatureSettings: '"tnum"',
                  background: `linear-gradient(135deg, #1e293b, ${theme.accent})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  {item.value}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: '0.04em' }}>
                  {item.label}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Studio Actions ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #4f8cff, #a855f7)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', letterSpacing: '0.04em' }}>创作工作室</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {actionList.map((a) => (
            <div
              key={a.path}
              onClick={() => navigate(a.path)}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: `${a.theme.bg}, #ffffff`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${a.theme.border}`,
                borderRadius: 12,
                padding: '32px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = a.theme.accent;
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 8px 25px ${a.theme.glow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = a.theme.border;
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
            >
              {/* Accent bar */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: '25%',
                right: '25%',
                height: 2.5,
                background: `linear-gradient(90deg, transparent, ${a.theme.accent}, transparent)`,
                borderRadius: '0 0 3px 3px',
              }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  marginBottom: 16,
                  color: a.theme.accent,
                  transition: 'transform 0.3s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15) rotate(-3deg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  {a.icon}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Operations ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #4f8cff, #a855f7)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', letterSpacing: '0.04em' }}>最近操作</span>
          </div>
          {ops.length > 0 && (
            <button onClick={handleClearOps} disabled={deleting}
              style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#64748b'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              清空记录
            </button>
          )}
        </div>

        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {ops.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <GlowOrb color="rgba(79,140,255,0.1)" size={220} style={{ top: -60, right: -60 }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ opacity: 0.2, marginBottom: 8, color: '#4f8cff', display: 'flex', justifyContent: 'center' }}>{I.list(36)}</div>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>暂无操作记录</div>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: 256, overflowY: 'auto' }}>
              {ops.map((op, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: i < ops.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ opacity: 0.4, color: '#94a3b8', display: 'flex' }}>{ACTION_ICONS[op.action] || I.pin(14)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {op.detail || op.action}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0, fontFeatureSettings: '"tnum"' }}>{timeAgo(op.time)}</span>
                  <button onClick={() => handleDeleteOp(i)} style={{
                    flexShrink: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', opacity: 0,
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; }}
                    title="删除"
                  >
                    <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
