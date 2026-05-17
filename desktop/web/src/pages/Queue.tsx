import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../stores';
import { queueApi, publishLogsApi, type QueueItem } from '../api/client';
import Select from '../components/Select';
import ConfirmDialog from '../components/ConfirmDialog';
import { useLoading } from '../hooks/useLoading';

const imgSrc = (p: string) => {
  if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
  // 相对路径（相对 DOWNLOAD_DIR）
  if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
  // 绝对路径向后兼容（包含 data/images/）
  const idx = p.indexOf('data/images/');
  const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
  return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
};

function formatTime(timeStr?: string): string {
  if (!timeStr) return '';
  const now = Date.now();
  const time = new Date(timeStr).getTime();
  if (isNaN(time)) return '';
  const diff = now - time;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}

export default function Queue() {
  const { queue, setQueue, addToast } = useStore();
  useEffect(() => { queueApi.get().then(d => setQueue(d.queue)); }, [setQueue]);

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">发布队列</h1>
        <p className="text-sm text-text-secondary mt-1">预览和发布图文内容到公众号</p>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <div className="empty-state py-16">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">发布队列为空</div>
            <div className="empty-state-desc">请在「图片发现」页面选图并加入发布队列</div>
          </div>
        </div>
      ) : (
        (() => {
          const sortedIndices = queue
            .map((item, i) => ({ item, i }))
            .sort((a, b) => {
              const tA = a.item.time || '';
              const tB = b.item.time || '';
              return tB.localeCompare(tA);
            });
          return (
            <div className="relative">
              {sortedIndices.length > 1 && (
                <div className="absolute left-[10px] top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
              )}
              {sortedIndices.map(({ i }, idx) => (
                <div key={i} className="flex gap-4">
                  {/* Timeline dot */}
                  <div className="w-5 flex justify-center shrink-0">
                    <div className={`relative z-10 w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                      idx === 0 ? 'bg-accent ring-[3px] ring-accent/15' : 'bg-border'
                    }`} />
                  </div>
                  {/* Content */}
                  <div className={`flex-1 min-w-0 ${idx < sortedIndices.length - 1 ? 'pb-7' : ''}`}>
                    <div className="text-[11px] text-text-muted/60 leading-none mb-2 mt-1.5">{formatTime(queue[i].time)}</div>
                    <QueueCard item={queue[i]} index={i} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}

const QueueCard = React.memo(function QueueCard({ item, index }: { item: QueueItem; index: number }) {
  const { openLightbox, addToast, setQueue } = useStore();
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  const [cover, setCover] = useState(item.cover);
  const [logs, setLogs] = useState<string[]>(() => item.publish_logs || []);
  const [publishing, setPublishing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isPublished = item.status === 'published';
  const { loading: generating, withLoading: withGenerating } = useLoading();
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsLenRef = useRef(logs.length);

  useEffect(() => {
    // 只在日志追加时（发布过程中）滚动到底部，挂载时已有的日志不触发
    if (logs.length > logsLenRef.current) {
      const el = logContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
    logsLenRef.current = logs.length;
  }, [logs]);

  async function updateField(field: string, value: string) { await queueApi.update(index, { [field]: value } as any); }
  async function deleteItem() { await queueApi.remove(index); setQueue((await queueApi.get()).queue); addToast('已删除', 'info'); }

  async function generateContent() {
    await withGenerating(async () => {
      addToast('AI 正在润色...', 'info');
      try {
        const r = await queueApi.generate(index);
        setTitle(r.title);
        setDesc('');
        setQueue((await queueApi.get()).queue);
        if (r.message) {
          addToast(r.message, 'error');
        } else {
          addToast('已润色完成', 'success');
        }
      } catch (err: any) { addToast(err.message, 'error'); }
    });
  }

  const pollLogs = useCallback(async (initialOffset = 0) => {
    let offset = initialOffset;
    if (offset === 0) {
      for (let i = 0; i < 6; i++) { const d = await publishLogsApi.get(0); if (d.active) break; await new Promise(r => setTimeout(r, 500)); }
    }
    while (true) {
      try { const d = await publishLogsApi.get(offset); if (d.logs.length) { setLogs(p => [...p, ...d.logs]); offset = d.total; } if (!d.active && offset > 0) break; } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setPublishing(false);
  }, []);

  // 切回页面时恢复发布状态和日志轮询
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await publishLogsApi.get(0);
        if (cancelled || item.status === 'published') return;
        if (d.active) {
          setLogs(d.logs);
          setPublishing(true);
          pollLogs(d.logs.length);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info'); setLogs([]); setPublishing(true);
    const pubPromise = queueApi.publish(index, opts);
    await new Promise(r => setTimeout(r, 300)); pollLogs();
    try { const r = await pubPromise; addToast(r.success ? `${action}成功：${r.message}` : `${action}失败：${r.message}`, r.success ? 'success' : 'error'); } catch (err: any) { addToast(err.message, 'error'); }
    try { setQueue((await queueApi.get()).queue); } catch {}
    setPublishing(false);
  }

  const images = item.images || [];

  /* ── 文章类型卡片 ─────────────────────────── */
  if (item.type === 'article') {
    return <ArticleCard item={item} index={index} />;
  }

  /* ── 缩略图分页：最多展示 9 张，左右滑动 ── */
  const MAX_VISIBLE_THUMBS = 9;
  const [thumbStart, setThumbStart] = useState(0);
  const visibleImages = images.slice(thumbStart, thumbStart + MAX_VISIBLE_THUMBS);
  const hiddenCount = images.length - (thumbStart + MAX_VISIBLE_THUMBS);
  const canScrollLeft = thumbStart > 0;
  const canScrollRight = hiddenCount > 0;
  const thumbScroll = (dir: -1 | 1) => {
    setThumbStart(prev => {
      const step = Math.min(MAX_VISIBLE_THUMBS, 3); // 按 3 格步进，不跳太远
      if (dir === -1) return Math.max(0, prev - step);
      const max = images.length - 1;
      return Math.min(max, prev + step);
    });
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Cover / Images Sidebar */}
        <div className="md:w-48 p-4 bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0">
          {cover && (
            <div className="relative mb-3 rounded-xl overflow-hidden cursor-pointer group"
              onClick={() => openLightbox(images.map(imgSrc), images.indexOf(cover))}>
              <img src={imgSrc(cover)} alt="" className="w-full h-28 object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" onError={e => (e.currentTarget.style.display = 'none')} />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/40 text-white/70 text-[10px] font-medium backdrop-blur">封面</div>
            </div>
          )}
          {/* Thumbnail strip with carousel */}
          <div className="relative">
            {canScrollLeft && (
              <button onClick={() => thumbScroll(-1)}
                className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-bg-card border border-border shadow-sm flex items-center justify-center hover:border-accent hover:text-accent transition-all"
                title="向左滚动">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            )}
            <div className="flex gap-1.5 overflow-hidden">
              {visibleImages.map((img, ii) => {
                const globalIdx = thumbStart + ii;
                return (
                  <img key={globalIdx} src={imgSrc(img)} alt="" loading="lazy" decoding="async"
                    className={`shrink-0 w-9 h-9 object-cover rounded-lg border cursor-pointer transition-all hover:border-accent hover:shadow-sm ${img === cover ? 'ring-2 ring-accent border-accent' : 'border-border'}`}
                    onClick={() => openLightbox(images.map(imgSrc), globalIdx)}
                    onError={e => (e.currentTarget.style.display = 'none')} />
                );
              })}
              {hiddenCount > 0 && (
                <div className="shrink-0 w-9 h-9 rounded-lg border border-border bg-bg-secondary flex items-center justify-center cursor-pointer hover:border-accent hover:bg-accent-softer transition-all"
                  onClick={() => openLightbox(images.map(imgSrc), thumbStart + MAX_VISIBLE_THUMBS)}
                  title={`查看全部 ${images.length} 张图片`}>
                  <span className="text-xs font-semibold text-text-muted">+{hiddenCount}</span>
                </div>
              )}
            </div>
            {canScrollRight && (
              <button onClick={() => thumbScroll(1)}
                className="absolute -right-1 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-bg-card border border-border shadow-sm flex items-center justify-center hover:border-accent hover:text-accent transition-all"
                title="向右滚动">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          {/* Header: celebrity name + status tag */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {item.celebrity && (
              <>
                <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="font-medium text-text-secondary">{item.celebrity}</span>
              </>
            )}
            {item.status === 'saved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">保存成功</span>
            )}
            {item.status === 'published' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">已发布</span>
            )}
          </div>
          <label>标题
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} placeholder="输入标题…" disabled={isPublished} />
          </label>
          <label>正文
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} rows={3} placeholder="正文内容（可选）…" disabled={isPublished} />
          </label>
          <label>封面
            <Select value={cover} onChange={v => { setCover(v); updateField('cover', v); }} options={images.map(img => ({ label: img.split('/').pop() || img, value: img }))} disabled={isPublished} />
          </label>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-1">
            {!isPublished && (
              <>
                <button className="btn btn-primary" onClick={() => publish({ save_draft: true })} disabled={publishing || generating}>
                  {publishing ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 处理中</> : '保存草稿'}
                </button>
                <button className="btn" onClick={() => publish({ save_draft: false })} disabled={publishing || generating}>
                  {publishing ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 处理中</> : '直接发布'}
                </button>
                <button className="btn" onClick={generateContent} disabled={publishing || generating}>
                  {generating ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 润色中</> : (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 2v4"/><path d="M12 22a10 10 0 0 1-10-10"/><path d="M12 22v-4"/><path d="M22 12h-4"/><path d="M2 12h4"/></svg>
                    AI 润色</>
                  )}
                </button>
                <button className="btn btn-ghost text-danger" onClick={() => setShowDeleteConfirm(true)} disabled={publishing}>删除</button>
              </>
            )}
          </div>

          <ConfirmDialog open={showDeleteConfirm} title="删除发布队列项" message={`确认删除《${title || '无标题'}》？`} confirmText="删除" danger onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }} onCancel={() => setShowDeleteConfirm(false)} />

          {/* Logs */}
          {(logs.length > 0 || publishing) && (
            <div ref={logContainerRef} className="bg-bg-secondary border border-border rounded-xl p-3 max-h-44 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                {publishing && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />}
                <span className="text-xs font-medium text-text-muted">{publishing ? '发布中...' : '发布日志'}</span>
              </div>
              <div className="space-y-0.5">
                {logs.map((msg, i) => <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed">{msg}</div>)}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/* ── 文章类型卡片 ────────────────────────────── */
const ArticleCard = React.memo(function ArticleCard({ item, index }: { item: QueueItem; index: number }) {
  const navigate = useNavigate();
  const { addToast, setQueue } = useStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const tags = item.tags || [];

  async function deleteItem() {
    await queueApi.remove(index);
    setQueue((await queueApi.get()).queue);
    addToast('已删除', 'info');
  }

  async function publish(opts: { save_draft?: boolean }) {
    addToast(`正在${opts.save_draft ? '保存草稿' : '发布'}...`, 'info');
    try {
      const r = await queueApi.publish(index, opts);
      addToast(r.success ? `${opts.save_draft ? '保存' : '发布'}成功` : `失败：${r.message}`, r.success ? 'success' : 'error');
      setQueue((await queueApi.get()).queue);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  }

  const isPublished = item.status === 'published';

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* 文章图标侧栏 */}
        <div className="md:w-48 p-4 bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0 flex flex-col items-center justify-center min-h-[140px]">
          <svg className="w-12 h-12 text-[var(--accent)]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="text-xs text-[var(--text-muted)] mt-2">文章</span>
        </div>

        {/* 内容 */}
        <div className="flex-1 p-4 space-y-3">
          {/* 状态 */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {item.celebrity && (
              <span className="font-medium text-[var(--text-secondary)]">{item.celebrity}</span>
            )}
            {item.status === 'saved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">保存成功</span>
            )}
            {item.status === 'published' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">已发布</span>
            )}
          </div>

          {/* 标题 */}
          <h3 className="text-base font-semibold leading-snug">{item.title || '无标题'}</h3>

          {/* 正文摘要 */}
          {item.content && (
            <p className="text-sm text-[var(--text-secondary)] line-clamp-4 leading-relaxed">{item.content}</p>
          )}

          {/* 标签 */}
          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--bg-secondary)] text-[var(--text-muted)]">{tag}</span>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 flex-wrap pt-1">
            <button className="btn btn-sm" onClick={() => navigate(`/articles`)}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              编辑
            </button>
            {!isPublished && (
              <>
                <button className="btn btn-sm" onClick={() => publish({ save_draft: true })}>保存草稿</button>
                <button className="btn btn-sm" onClick={() => publish({ save_draft: false })}>直接发布</button>
                <button className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => setShowDeleteConfirm(true)}>删除</button>
              </>
            )}
          </div>

          <ConfirmDialog
            open={showDeleteConfirm}
            title="删除发布队列项"
            message={`确认删除《${item.title || '无标题'}》？`}
            confirmText="删除"
            danger
            onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        </div>
      </div>
    </div>
  );
});
