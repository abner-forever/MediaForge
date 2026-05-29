import { useRef, useEffect, useState } from 'react';
import Loading from '../../components/Loading';
import FilterTab from './FilterTab';
import { TabKey, TAB_LABELS, STATUS_LABELS, fmtTime } from './utils';
import type { ArticleItem } from '../../api/client';

export default function ArticleList({
  articles, articleFilter, editingId, loading,
  onSelectArticle, onSwitchFilter, onDelete,
  expanded, onToggleExpanded, fillHeight,
}: {
  articles: ArticleItem[]; articleFilter: TabKey; editingId: string | null; loading: boolean;
  onSelectArticle: (a: ArticleItem) => void; onSwitchFilter: (tab: TabKey) => void; onDelete: (id: string) => void;
  expanded: boolean; onToggleExpanded: () => void; fillHeight?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 250);
    return () => clearTimeout(timer);
  }, [expanded]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0, ...(fillHeight ? { flex: 1, overflow: 'hidden' } : {}) }}>
      {/* Header — always visible (hidden in fillHeight mode since Drawer has its own title) */}
      {!fillHeight && (
      <div
        onClick={onToggleExpanded}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', padding: '6px 0', userSelect: 'none',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.color = ''}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{
              transition: 'transform 0.25s var(--ease-out)',
              transform: expanded ? 'rotate(90deg)' : 'none',
              flexShrink: 0,
            }}
          >
            <path d="m9 18 6-6-6-6"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            文章列表
          </span>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--text-muted)',
          background: 'var(--bg-secondary)', padding: '1px 7px', borderRadius: 9999,
          lineHeight: 1.6,
        }}>
          {articles.length}
        </span>
      </div>
      )}

      {/* Content area */}
      <div
        ref={innerRef}
        style={fillHeight ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {
          overflow: 'hidden',
          maxHeight: expanded ? (innerRef.current?.scrollHeight || 600) + 'px' : '0px',
          opacity: expanded ? 1 : 0,
          transition: `max-height 0.3s ${expanded ? 'var(--ease-out)' : 'ease-in'}, opacity 0.2s ${expanded ? '0.05s' : '0s'} ease`,
        }}
      >
        <div style={{ paddingTop: fillHeight ? 0 : 4, ...(fillHeight ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}) }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <FilterTab key={tab} active={articleFilter === tab} onClick={() => onSwitchFilter(tab)}>
                {TAB_LABELS[tab]}
              </FilterTab>
            ))}
          </div>

          {/* Article list */}
          <div style={fillHeight ? { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 } : { maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading && articles.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Loading /></div>
            )}
            {!loading && articles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>暂无文章</p>
              </div>
            )}
            {articles.map((a) => {
              const statusInfo = STATUS_LABELS[a.status] || STATUS_LABELS.draft;
              const isActive = editingId === a.id;
              return (
                <div key={a.id} onClick={() => onSelectArticle(a)} style={{
                  padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                  transition: 'all 0.15s',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  background: isActive ? 'var(--accent-softer)' : 'transparent',
                }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title || '无标题'}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.summary || a.content?.slice(0, 50) || ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: a.status === 'queued' ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {statusInfo.text}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(a.updated_at || a.created_at)}</span>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} style={{
                      fontSize: 10, color: '#e5484d', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0, transition: 'opacity 0.15s',
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
