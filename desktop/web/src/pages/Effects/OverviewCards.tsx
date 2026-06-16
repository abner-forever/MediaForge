import type { EffectSummary } from '../../types';
import { formatCount } from '../../utils/format';

const CARDS = [
  { key: 'total_posts' as const, label: '发布总数', color: '#7868d0' },
  { key: 'total_reads' as const, label: '总阅读量', color: '#3b82f6' },
  { key: 'total_comments' as const, label: '总评论', color: '#10b981' },
  { key: 'total_likes' as const, label: '总点赞', color: '#f59e0b' },
];

export default function OverviewCards({ summary }: { summary: EffectSummary }) {
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}
    >
      {CARDS.map(({ key, label, color }) => (
        <div
          key={key}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: `linear-gradient(135deg, ${color}08, ${color}04), var(--bg-card)`,
            border: `1px solid ${color}20`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
            transition: 'all 0.3s',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '15%',
              right: '15%',
              height: 3,
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              borderRadius: '0 0 4px 4px',
            }}
          />
          <div
            title={summary[key].toLocaleString()}
            style={{
              fontSize: 32,
              fontWeight: 700,
              lineHeight: 1,
              marginBottom: 6,
              fontFeatureSettings: '"tnum"',
              background: `linear-gradient(135deg, var(--text), ${color})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {formatCount(summary[key])}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </section>
  );
}
