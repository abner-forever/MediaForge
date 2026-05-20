import type { OperationItem } from '../../api/client';
import GlowOrb from './GlowOrb';
import { I, ACTION_ICONS } from './Icons';
import { timeAgo } from './StatusDot';

export default function OperationsList({
  ops, opsTotal, loadingOps, deleting, onLoadMore, onDelete, onClear,
}: {
  ops: OperationItem[]; opsTotal: number; loadingOps: boolean; deleting: boolean;
  onLoadMore: () => void; onDelete: (id: string) => void; onClear: () => void;
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: 'linear-gradient(180deg, #4f8cff, #a855f7)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', letterSpacing: '0.04em' }}>最近操作</span>
          {opsTotal > 0 && (
            <span style={{ fontSize: 12, color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>共 {opsTotal} 条</span>
          )}
        </div>
        {ops.length > 0 && (
          <button onClick={onClear} disabled={deleting}
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
              <div key={op.id} style={{
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
                <button onClick={() => onDelete(op.id)} style={{
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
            {ops.length < opsTotal && (
              <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={onLoadMore}
                  disabled={loadingOps}
                  style={{
                    fontSize: 13, fontWeight: 500, color: '#4f8cff', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '4px 16px',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#3b6fd4'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#4f8cff'}
                >
                  {loadingOps ? '加载中…' : `加载更多（${opsTotal - ops.length} 条）`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
