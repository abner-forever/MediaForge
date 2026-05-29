import { useState, useEffect, useCallback } from 'react';
import { effectsApi } from '../../api/client';
import type { MpArticlesResponse } from '../../types';
import Select from '../../components/Select';

type SortKey = 'reads' | 'likes' | 'shares' | 'publish_time';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

export default function MpArticlesTable({ onCleared }: { onCleared?: () => void }) {
  const [data, setData] = useState<MpArticlesResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [celebFilter, setCelebFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('publish_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState(false);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    const isFirst = !data;
    if (isFirst) setInitialLoading(true);
    else setFetching(true);
    try {
      const res = await effectsApi.mpArticles({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
        celebrity: celebFilter,
        sort_key: sortKey,
        sort_dir: sortDir,
      });
      setData(res);
    } catch {
      if (isFirst) setData(null);
    } finally {
      setInitialLoading(false);
      setFetching(false);
    }
  }, [page, debouncedSearch, celebFilter, sortKey, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 筛选变化时重置到第 1 页
  useEffect(() => { setPage(1); }, [debouncedSearch, celebFilter]);

  const articles = data?.articles ?? [];
  const total = data?.total ?? 0;
  const celebrities = data?.celebrities ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  async function handleClear() {
    if (!confirm('确定清除所有效果数据？此操作不可恢复。')) return;
    setClearing(true);
    try {
      await effectsApi.clearMpArticles();
      setData(null);
      fetchData();
      onCleared?.();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }

  if (!initialLoading && total === 0 && !debouncedSearch && !celebFilter) return null;

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-text-muted/40 ml-0.5">↕</span>;
    return <span className="text-accent ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-text-muted">
            已发布文章数据{total > 0 && `，共 ${total} 篇`}
          </p>
        </div>
        {total > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="btn btn-sm text-red-500 hover:bg-red-500/10"
          >
            {clearing ? '清除中...' : '清除数据'}
          </button>
        )}
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          className="text-sm w-52"
          placeholder="搜索标题..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {celebrities.length > 0 && (
          <div className="w-32">
            <Select
              value={celebFilter}
              onChange={setCelebFilter}
              options={[
                { label: '全部艺人', value: '' },
                ...celebrities.map(c => ({ label: c, value: c })),
              ]}
            />
          </div>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {debouncedSearch || celebFilter ? `筛选结果 ${total} 篇` : total > 0 ? `共 ${total} 篇` : ''}
        </span>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto relative">
        {fetching && (
          <div className="absolute inset-0 bg-bg/40 z-10 flex items-center justify-center"
            style={{ backdropFilter: 'blur(1px)' }}>
            <span className="text-xs text-text-muted">加载中...</span>
          </div>
        )}
        {initialLoading ? (
          <div className="py-8 text-center text-text-muted text-sm">加载中...</div>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs">
              <th className="text-left py-2 pr-2 font-medium w-12">封面</th>
              <th className="text-left py-2 pr-3 font-medium">标题</th>
              <th className="text-left py-2 pr-3 font-medium">艺人</th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer select-none hover:text-text" onClick={() => toggleSort('reads')}>
                阅读<SortIcon k="reads" />
              </th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer select-none hover:text-text" onClick={() => toggleSort('likes')}>
                点赞<SortIcon k="likes" />
              </th>
              <th className="text-right py-2 pr-3 font-medium cursor-pointer select-none hover:text-text" onClick={() => toggleSort('shares')}>
                分享<SortIcon k="shares" />
              </th>
              <th className="text-right py-2 pr-3 font-medium">推荐</th>
              <th className="text-right py-2 pr-3 font-medium">留言</th>
              <th className="text-left py-2 font-medium cursor-pointer select-none hover:text-text" onClick={() => toggleSort('publish_time')}>
                发布时间<SortIcon k="publish_time" />
              </th>
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-text-muted">无匹配数据</td></tr>
            ) : articles.map((art, i) => (
              <tr key={art.item_id} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-bg/50'}`}>
                <td className="py-2 pr-2">
                  {art.cover ? (
                    <img
                      src={`/proxy?url=${encodeURIComponent(art.cover)}&platform=wechat&thumbnail=1`}
                      alt=""
                      className="w-10 h-10 rounded object-cover bg-border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-border flex items-center justify-center text-text-muted text-xs">-</div>
                  )}
                </td>
                <td className="py-2 pr-3 max-w-[280px]">
                  {art.content_url ? (
                    <a href={art.content_url} target="_blank" rel="noopener noreferrer"
                      className="text-text hover:text-accent truncate block" title={art.title}>
                      {art.title || '-'}
                    </a>
                  ) : (
                    <span className="text-text truncate block" title={art.title}>{art.title || '-'}</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-text-secondary">{art.celebrity || '-'}</td>
                <td className="py-2 pr-3 text-right font-mono text-text">{(art.reads || 0).toLocaleString()}</td>
                <td className="py-2 pr-3 text-right font-mono text-text-secondary">{art.likes || 0}</td>
                <td className="py-2 pr-3 text-right font-mono text-text-secondary">{art.shares || 0}</td>
                <td className="py-2 pr-3 text-right font-mono text-text-secondary">{art.recommendations || 0}</td>
                <td className="py-2 pr-3 text-right font-mono text-text-secondary">{art.comment_num ?? '-'}</td>
                <td className="py-2 text-text-muted text-xs whitespace-nowrap">
                  {art.publish_time ? formatTime(art.publish_time) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-sm text-text-muted">第 {page}/{totalPages} 页</span>
          <div className="flex items-center gap-1.5">
            <PageBtn disabled={page <= 1} onClick={() => setPage(1)}>«</PageBtn>
            <PageBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</PageBtn>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (page <= 3) {
                p = i + 1;
              } else if (page >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = page - 2 + i;
              }
              return (
                <PageBtn key={p} active={p === page} onClick={() => setPage(p)}>
                  {p}
                </PageBtn>
              );
            })}
            <PageBtn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>›</PageBtn>
            <PageBtn disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function PageBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="text-sm"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 32, height: 32, padding: '0 8px',
        borderRadius: 6, border: '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}
