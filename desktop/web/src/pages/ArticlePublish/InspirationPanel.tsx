import type { InspirationTopic } from '../../api/client';
import Loading from '../../components/Loading';

export default function InspirationPanel({
  inspirationExpanded,
  inspirationKeyword,
  inspirationResults,
  inspirationLoading,
  onToggle,
  onKeywordChange,
  onSearch,
  onPickTopic,
}: {
  inspirationExpanded: boolean;
  inspirationKeyword: string;
  inspirationResults: InspirationTopic[];
  inspirationLoading: boolean;
  onToggle: () => void;
  onKeywordChange: (v: string) => void;
  onSearch: () => void;
  onPickTopic: (topic: InspirationTopic) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 6,
          background: inspirationExpanded ? 'var(--accent-softer)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-muted)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!inspirationExpanded) {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!inspirationExpanded) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            transform: inspirationExpanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        灵感探索
        {!inspirationExpanded && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
            搜索热点话题填入标题与来源
          </span>
        )}
      </button>
      {inspirationExpanded && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="输入话题关键词…"
              value={inspirationKeyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <button className="btn btn-sm" onClick={onSearch} disabled={inspirationLoading}>
              {inspirationLoading ? <Loading size="sm" /> : '搜索'}
            </button>
          </div>
          {inspirationResults.length > 0 && (
            <div
              style={{
                marginTop: 8,
                maxHeight: 200,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {inspirationResults.map((t, i) => (
                <div
                  key={i}
                  onClick={() => onPickTopic(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontSize: 13,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-softer)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    {t.source === 'weibo' ? 'WB' : 'TT'}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {t.text}
                  </span>
                  {t.celebrity && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {t.celebrity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!inspirationLoading && inspirationResults.length === 0 && inspirationKeyword && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>未找到相关话题</p>
          )}
        </div>
      )}
    </div>
  );
}
