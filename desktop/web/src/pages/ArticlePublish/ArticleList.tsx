import Loading from '../../components/Loading';
import FilterTab from './FilterTab';
import { TabKey, TAB_LABELS, STATUS_LABELS, fmtTime } from './utils';
import type { ArticleItem } from '../../api/client';

export default function ArticleList({
  articles, articleFilter, editingId, loading,
  onSelectArticle, onSwitchFilter, onDelete,
  articleListExpanded, onToggleExpanded,
}: {
  articles: ArticleItem[]; articleFilter: TabKey; editingId: string | null; loading: boolean;
  onSelectArticle: (a: ArticleItem) => void; onSwitchFilter: (tab: TabKey) => void; onDelete: (id: string) => void;
  articleListExpanded: boolean; onToggleExpanded: () => void;
}) {
  return (
    <div style={{
      width: 320,
      opacity: articleListExpanded ? 1 : 0,
      transition: 'opacity 0.25s ease',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div className="card" style={{ padding: 16 }}>
        <div
          onClick={onToggleExpanded}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <path d="m9 18 6-6-6-6"/>
            </svg>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              文章列表
            </h2>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{articles.length} 篇</span>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
            <FilterTab key={tab} active={articleFilter === tab} onClick={() => onSwitchFilter(tab)}>
              {TAB_LABELS[tab]}
            </FilterTab>
          ))}
        </div>

        <div style={{ maxHeight: 'calc(100vh - 440px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && articles.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Loading /></div>
          )}
          {!loading && articles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>暂无文章</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>在左侧编辑器中开始创作</p>
            </div>
          )}
          {articles.map((a) => {
            const statusInfo = STATUS_LABELS[a.status] || STATUS_LABELS.draft;
            const isActive = editingId === a.id;
            return (
              <div key={a.id} onClick={() => onSelectArticle(a)} style={{
                padding: 8, borderRadius: 6, cursor: 'pointer',
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
                      {a.summary || a.content?.slice(0, 60) || ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, color: a.status === 'queued' ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {statusInfo.text}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
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
  );
}
