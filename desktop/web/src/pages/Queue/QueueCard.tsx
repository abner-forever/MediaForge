import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../stores';
import { queueApi, publishLogsApi, wechatAccountApi, type QueueItem, type WeChatAccount } from '../../api/client';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useLoading } from '../../hooks/useLoading';
import { imgSrc } from './utils';
import ArticleCard from './ArticleCard';

const MAX_VISIBLE_THUMBS = 9;

const QueueCard = React.memo(function QueueCard({ item, index }: { item: QueueItem; index: number }) {
  const { openLightbox, addToast, setQueue } = useStore();
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  const [cover, setCover] = useState(item.cover);
  const [logs, setLogs] = useState<string[]>(() => item.publish_logs || []);
  const [publishing, setPublishing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [wechatAccounts, setWechatAccounts] = useState<WeChatAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(item.account_id || '');
  const isPublished = item.status === 'published';
  const { loading: generating, withLoading: withGenerating } = useLoading();
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsLenRef = useRef(logs.length);
  const [thumbStart, setThumbStart] = useState(0);

  useEffect(() => {
    wechatAccountApi.list().then(({ accounts }) => {
      setWechatAccounts(accounts);
      if (!item.account_id) {
        const def = accounts.find(a => a.is_default);
        if (def) setSelectedAccountId(def.account_id);
      }
    }).catch(() => {});
  }, [item.account_id]);

  useEffect(() => {
    if (logs.length > logsLenRef.current) {
      const el = logContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
    logsLenRef.current = logs.length;
  }, [logs]);

  async function updateField(field: string, value: string) { await queueApi.update(index, { [field]: value } as any); }
  async function deleteItem() {
    try {
      await queueApi.remove(index);
      setQueue((await queueApi.get()).queue);
      addToast('已删除', 'info');
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    }
  }

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

  const pollLogs = useCallback(async (initialOffset = 0, { signal }: { signal?: AbortSignal } = {}) => {
    let offset = initialOffset;
    if (offset === 0) {
      for (let i = 0; i < 6; i++) {
        if (signal?.aborted) return;
        try { const d = await publishLogsApi.get(0); if (d.active) break; } catch {}
        await new Promise(r => setTimeout(r, 500));
      }
    }
    while (true) {
      if (signal?.aborted) return;
      try { const d = await publishLogsApi.get(offset); if (d.logs.length) { setLogs(p => [...p, ...d.logs]); offset = d.total; } if (!d.active && offset > 0) break; } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setPublishing(false);
  }, []);

  const publishRef = useRef(false);

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info'); setLogs([]); setPublishing(true); publishRef.current = true;
    const pubPromise = queueApi.publish(index, { ...opts, account_id: selectedAccountId || undefined });
    await new Promise(r => setTimeout(r, 300));
    const ac = new AbortController();
    pollLogs(0, { signal: ac.signal });
    try { const r = await pubPromise; addToast(r.success ? `${action}成功：${r.message}` : `${action}失败：${r.message}`, r.success ? 'success' : 'error'); } catch (err: any) { addToast(err.message, 'error'); }
    publishRef.current = false;
    ac.abort();
    try { setQueue((await queueApi.get()).queue); } catch {}
    setPublishing(false);
  }

  const images = item.images || [];
  const visibleImages = images.slice(thumbStart, thumbStart + MAX_VISIBLE_THUMBS);
  const hiddenCount = images.length - (thumbStart + MAX_VISIBLE_THUMBS);
  const canScrollLeft = thumbStart > 0;
  const canScrollRight = hiddenCount > 0;
  const thumbScroll = (dir: -1 | 1) => {
    setThumbStart(prev => {
      const step = Math.min(MAX_VISIBLE_THUMBS, 3);
      if (dir === -1) return Math.max(0, prev - step);
      const max = images.length - 1;
      return Math.min(max, prev + step);
    });
  };

  if (item.type === 'article') {
    return <ArticleCard item={item} index={index} />;
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
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
                    className={`shrink-0 w-9 h-9 object-cover rounded-lg border cursor-pointer transition-all hover:border-accent hover:shadow-sm ${img === cover ? 'outline outline-2 outline-offset-[-1px] outline-accent border-accent' : 'border-border'}`}
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

        <div className="flex-1 p-4 space-y-3">
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
          {wechatAccounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted shrink-0">发布到</span>
              <div className="w-44">
                <Select
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                  options={wechatAccounts.map(acc => ({
                      label: `${acc.name}${acc.logged_in ? '' : ' (未登录)'}`,
                      value: acc.account_id,
                    }))}
                />
              </div>
            </div>
          )}
          <label>标题
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} placeholder="输入标题…" disabled={isPublished} />
          </label>
          <label>正文
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} rows={3} placeholder="正文内容（可选）…" disabled={isPublished} />
          </label>
          <label>封面
            <Select value={cover} onChange={v => { setCover(v); updateField('cover', v); }} options={images.map(img => ({ label: img.split('/').pop() || img, value: img }))} disabled={isPublished} />
          </label>

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

export default QueueCard;
