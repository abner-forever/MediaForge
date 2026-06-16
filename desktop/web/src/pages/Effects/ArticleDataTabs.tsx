import { useState } from 'react';
import TopArticles from './TopArticles';
import MpArticlesTable from './MpArticlesTable';

type Tab = 'hot' | 'raw';

export default function ArticleDataTabs({ onCleared }: { onCleared?: () => void }) {
  const [tab, setTab] = useState<Tab>('raw');

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {[
          { key: 'raw' as const, label: '原始数据' },
          { key: 'hot' as const, label: '爆款文章' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: 'transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
            {tab === t.key && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 16,
                  right: 16,
                  height: 2,
                  borderRadius: 1,
                  background: 'var(--accent)',
                }}
              />
            )}
          </button>
        ))}
      </div>
      <div style={{ padding: 16, minHeight: 400 }}>
        <div style={{ display: tab === 'hot' ? 'block' : 'none' }}>
          <TopArticles />
        </div>
        <div style={{ display: tab === 'raw' ? 'block' : 'none' }}>
          <MpArticlesTable onCleared={onCleared} />
        </div>
      </div>
    </div>
  );
}
