import type { EffectCompareItem } from '../../types';
import { formatCount } from '../../utils/format';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const CONTENT_TYPE_MAP: Record<string, string> = {
  image: '图文',
  article: '文章',
};

function BarGroup({ title, items, labelMap }: {
  title: string; items: EffectCompareItem[]; labelMap?: Record<string, string>;
}) {
  if (!items.length) return null;
  const maxReads = Math.max(...items.map(i => i.reads), 1);
  const top = items.slice(0, 8);

  return (
    <div className="card p-4" style={{ minWidth: 0 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map((item, i) => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 56, fontSize: 12, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
              flexShrink: 0,
            }}>
              {labelMap?.[item.key] || item.key || '未知'}
            </span>
            <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'var(--border)', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${(item.reads / maxReads) * 100}%`,
                background: COLORS[i % COLORS.length],
                transition: 'width 0.6s ease-out',
              }} />
              <span
                title={item.reads.toLocaleString()}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, fontWeight: 600, color: 'var(--text)',
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {formatCount(item.reads)}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 40, textAlign: 'right', flexShrink: 0 }}>
              {item.posts}篇
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompareChart({ data }: {
  data: { by_source_platform: EffectCompareItem[]; by_content_type: EffectCompareItem[]; by_celebrity: EffectCompareItem[] };
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      <BarGroup title="按内容类型" items={data.by_content_type} labelMap={CONTENT_TYPE_MAP} />
      <BarGroup title="按艺人" items={data.by_celebrity} />
    </div>
  );
}
