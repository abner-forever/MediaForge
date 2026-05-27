import { I, CARD_THEMES } from './Icons';

const actionList = [
  { icon: I.search(36), title: '找图发文', desc: '搜索帖子、下载图片、筛选封面并加入队列', path: '/discovery', theme: CARD_THEMES[0] },
  { icon: I.edit(36), title: '写文章发文', desc: '选择模板、AI 写作、确认后发布', path: '/articles', theme: CARD_THEMES[1] },
  { icon: I.upload(36), title: '发布队列', desc: '管理和发布待处理内容', path: '/queue', theme: CARD_THEMES[2] },
  { icon: I.gear(36), title: '设置', desc: '配置大模型和平台账号', path: '/settings', theme: CARD_THEMES[3] },
];

export default function StudioActions({ navigate }: { navigate: (path: string) => void }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #7868d0, #a078d0)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.04em' }}>创作工作室</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {actionList.map((a) => (
          <div
            key={a.path}
            onClick={() => navigate(a.path)}
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: `${a.theme.bg}, var(--bg-card)`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${a.theme.border}`,
              borderRadius: 16,
              padding: '32px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s var(--ease-out)',
              boxShadow: 'var(--card-shadow)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = a.theme.accent;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = `0 12px 32px ${a.theme.glow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = a.theme.border;
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'var(--card-shadow)';
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: '20%',
              right: '20%',
              height: 3,
              background: `linear-gradient(90deg, transparent, ${a.theme.accent}, transparent)`,
              borderRadius: '0 0 4px 4px',
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
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
