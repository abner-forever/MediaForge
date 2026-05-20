import type { DashboardStats } from '../../api/client';
import { CARD_THEMES, I } from './Icons';

export default function StatCards({ stats, navigate }: { stats: DashboardStats | null; navigate: (path: string) => void }) {
  const statList = [
    { label: '本地图片', value: stats?.local_images ?? 0, path: '/materials', icon: I.image(24) },
    { label: '发布队列', value: stats?.queue_size ?? 0, path: '/queue', icon: I.upload(24) },
    { label: '已选图片', value: stats?.selected_count ?? 0, icon: I.check(24) },
    { label: '搜索结果', value: stats?.discovery_count ?? 0, icon: I.target(24) },
  ];

  return (
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
  );
}
