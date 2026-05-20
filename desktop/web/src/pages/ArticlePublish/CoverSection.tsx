import type { CoverImage } from '../../api/client';
import Loading from '../../components/Loading';

export default function CoverSection({
  cover, coverKeyword, coverResults, coverLoading,
  coverSearchLoading, showCoverSearch,
  onCoverImageUrl, onCoverSearch, onSelectCoverImage,
  onRemoveCover, onToggleCoverSearch, onCoverKeywordChange,
  onOpenLightbox, onCoverLoad, onAddCover,
}: {
  cover: string; coverKeyword: string; coverResults: CoverImage[]; coverLoading: boolean;
  coverSearchLoading: boolean; showCoverSearch: boolean;
  onCoverImageUrl: (path: string, source?: string) => string;
  onCoverSearch: (kw: string) => void;
  onSelectCoverImage: (img: CoverImage) => void;
  onRemoveCover: () => void;
  onToggleCoverSearch: () => void;
  onCoverKeywordChange: (v: string) => void;
  onOpenLightbox: (paths: string[], index: number) => void;
  onCoverLoad?: () => void;
  onAddCover?: () => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {cover ? (
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <img
            key={cover}
            src={onCoverImageUrl(cover)}
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', display: coverLoading ? 'none' : 'block' }}
            onClick={() => onOpenLightbox([onCoverImageUrl(cover)], 0)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; onCoverLoad?.(); }}
            onLoad={() => onCoverLoad?.()}
          />
          {coverLoading && (
            <div style={{ width: '100%', height: 160, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loading size="sm" />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>正在加载封面…</span>
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
            <button
              onClick={onToggleCoverSearch}
              className="btn btn-sm"
              style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
            >
              更换
            </button>
            <button
              onClick={onRemoveCover}
              className="btn btn-sm"
              style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
            >
              移除
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onAddCover || onToggleCoverSearch} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 6,
          background: 'transparent', border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)',
          transition: 'all 0.15s',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          添加封面
        </button>
      )}

      {showCoverSearch && (
        <div style={{ marginTop: 12, padding: 16, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              placeholder="输入关键词搜索配图…"
              value={coverKeyword}
              onChange={(e) => onCoverKeywordChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCoverSearch(coverKeyword)}
              autoFocus
              style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
            />
            <button className="btn btn-sm" onClick={() => onCoverSearch(coverKeyword)} disabled={coverSearchLoading}>
              {coverSearchLoading ? <Loading size="sm" /> : '搜索'}
            </button>
          </div>
          {coverSearchLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <Loading size="sm" /><span>正在搜索配图…</span>
              </div>
            </div>
          )}
          {!coverSearchLoading && coverResults.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(() => {
                const local = coverResults.filter(r => r.source === 'local');
                const web = coverResults.filter(r => r.source === 'web');
                return (<>
                  {local.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>本地素材 ({local.length})</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                        {local.map((img, i) => (
                          <div key={`local-${i}`} onClick={() => onSelectCoverImage(img)} style={{ position: 'relative', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1/1', background: 'var(--bg-inset)', transition: 'border-color 0.15s' }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                            <img src={onCoverImageUrl(img.path, img.source)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            {img.celebrity && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.celebrity}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {web.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>网络图片 ({web.length})</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                        {web.map((img, i) => (
                          <div key={`web-${i}`} onClick={() => onSelectCoverImage(img)} style={{ position: 'relative', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1/1', background: 'var(--bg-inset)', transition: 'border-color 0.15s' }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                            <img src={onCoverImageUrl(img.path, img.source)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            <span style={{ position: 'absolute', top: 2, right: 2, padding: '2px 4px', fontSize: 8, color: '#fff', background: 'rgba(94,106,210,0.7)', borderRadius: 4 }}>WEB</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>);
              })()}
            </div>
          )}
          {!coverSearchLoading && coverResults.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              {coverKeyword ? '未找到相关配图，换个关键词试试' : '输入关键词搜索配图'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
