import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../stores';
import { queueApi, publishLogsApi, wechatAccountApi, type QueueItem, type WeChatAccount } from '../../api/client';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';
import PublishConfirmModal from '../../components/PublishConfirmModal';
import EffectEntry from '../../components/EffectEntry';
import { useLoading } from '../../hooks/useLoading';
import { imgSrc } from './utils';
import ArticleCard from './ArticleCard';
import LazyImage from '../Discovery/LazyImage';

const MAX_VISIBLE_THUMBS = 3;

const QueueCard = React.memo(function QueueCard({ item, seq }: { item: QueueItem; seq?: number }) {
  const itemId = item.id!;
  const { openLightbox, addToast, setQueue } = useStore();
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  const [cover, setCover] = useState(item.cover);
  const [logs, setLogs] = useState<string[]>(() => item.publish_logs || []);
  const [publishingAction, setPublishingAction] = useState<'draft' | 'publish' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState<'draft' | 'publish' | null>(null);
  const [wechatAccounts, setWechatAccounts] = useState<WeChatAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(item.account_id || '');
  const isPublished = item.status === 'published';
  const { loading: generating, withLoading: withGenerating } = useLoading();
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsLenRef = useRef(logs.length);
  const pollReceivedRef = useRef(false);
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

  // 当队列项从服务端刷新后含有完整发布日志时，同步到本地
  // 注意：发布中的轮询结束后 pollReceivedRef=true，不再用缓存的 publish_logs 覆盖
  useEffect(() => {
    if (pollReceivedRef.current) return;
    const isTerminal = ['failed', 'saved_to_wechat', 'published'].includes(item.status || '');
    if ((!publishingAction || isTerminal) && item.publish_logs && item.publish_logs.length > logs.length) {
      setLogs(item.publish_logs);
    }
  }, [item.publish_logs, publishingAction, item.status]);

  async function updateField(field: string, value: string) { await queueApi.update(itemId, { [field]: value } as any); }

  // 标题/正文自动保存（防抖 800ms）
  const autoSave = useCallback((field: string, value: string) => {
    if (value !== item[field as keyof QueueItem]) {
      updateField(field, value);
    }
  }, [item]);

  const titleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (title === item.title) return;
    clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => autoSave('title', title), 800);
    return () => clearTimeout(titleTimerRef.current);
  }, [title, item.title, autoSave]);

  const descTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (desc === item.desc) return;
    clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => autoSave('desc', desc), 800);
    return () => clearTimeout(descTimerRef.current);
  }, [desc, item.desc, autoSave]);

  async function deleteItem() {
    try {
      await queueApi.remove(itemId);
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
        const r = await queueApi.generate(itemId);
        setTitle(r.title);
        if (r.success) setDesc('');
        setQueue((await queueApi.get()).queue);
        if (r.message) {
          addToast(r.message, 'error');
        } else {
          addToast('已润色完成', 'success');
        }
      } catch (err: any) { addToast(err.message, 'error'); }
    });
  }

  const logSessionId = item.id || '';
  const pollLogs = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    let offset = 0;
    const sid = logSessionId;
    // 等待后端发布开始（active=true），最多 3 秒
    for (let i = 0; i < 6; i++) {
      if (signal.aborted) return;
      try { const d = await publishLogsApi.get(0, sid); if (d.active) break; } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    // 持续轮询直到 publish 完成（信号被主动 abort），不再依赖 active 标志提前停止
    while (!signal.aborted) {
      try {
        const d = await publishLogsApi.get(offset, sid);
        if (d.logs.length) {
          pollReceivedRef.current = true;
          setLogs(p => [...p, ...d.logs]);
          offset = d.total;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
  }, [logSessionId]);

  const publishRef = useRef(false);

  /** 发布任务已后台启动，持续轮询直到队列状态变为终态。返回 true=成功。 */
  async function pollUntilDone(signal: AbortSignal): Promise<boolean> {
    for (let i = 0; i < 150; i++) { // ~5 分钟上限
      if (signal.aborted) return false;
      try {
        const refreshed = await queueApi.get();
        setQueue(refreshed.queue);
        const updated = refreshed.queue.find(q => q.id === itemId);
        if (updated) {
          // 只在队列项有最终完整日志时更新（发布中 publish_logs 为空，靠 pollLogs 增量拉取）
          if (updated.publish_logs && updated.publish_logs.length > 0) {
            const queueLogs = updated.publish_logs;
            setLogs(prev => queueLogs.length > prev.length ? queueLogs : prev);
          }
          if (updated.status === 'saved_to_wechat' || updated.status === 'published') return true;
          if (updated.status === 'failed') return false;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info'); setLogs([]); setPublishingAction(opts.save_draft !== false ? 'draft' : 'publish'); publishRef.current = true; pollReceivedRef.current = false;
    const pubPromise = queueApi.publish(itemId, { ...opts, account_id: selectedAccountId || undefined });
    await new Promise(r => setTimeout(r, 300));
    const ac = new AbortController();
    pollLogs({ signal: ac.signal });
    let success = false;
    let started = false;
    try { const r = await pubPromise; if (r.started) { started = true; } else { success = r.success; addToast(r.success ? `${action}成功：${r.message}` : `${action}失败：${r.message}`, r.success ? 'success' : 'error'); } } catch (err: any) { /* 后端已启动后台任务，HTTP 可能先断，忽略 */ }
    publishRef.current = false;

    if (started) {
      // 后台执行，靠轮询等终态
      success = await pollUntilDone(ac.signal);
      addToast(success ? `${action}成功` : '发布失败', success ? 'success' : 'error');
    } else {
      await new Promise(r => setTimeout(r, 800));
    }
    ac.abort();
    // 刷新队列确保本地状态与服务端一致
    try {
      const refreshed = await queueApi.get();
      setQueue(refreshed.queue);
      if (!started) {
        const updatedItem = refreshed.queue.find(q => q.id === itemId);
        if (updatedItem?.publish_logs && !pollReceivedRef.current) {
          setLogs(updatedItem.publish_logs);
        }
      }
    } catch {}
    if (!success) {
      const q = useStore.getState().queue;
      const idx = q.findIndex(qi => qi.id === itemId);
      if (idx >= 0 && !['failed', 'saved_to_wechat', 'published'].includes(q[idx].status || '')) {
        const newQueue = [...q];
        newQueue[idx] = { ...newQueue[idx], status: 'failed' as QueueItem['status'] };
        setQueue(newQueue);
      }
    }
    setPublishingAction(null);
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
    return <ArticleCard item={item} seq={seq} />;
  }

  return (
    <div className="card overflow-visible">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-48 p-4 bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0 relative">
          {seq !== undefined && (
            <div className="absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shadow-sm ring-2 ring-bg-card">
              {seq}
            </div>
          )}
          {cover && (
            <div className="relative mb-3 rounded-xl overflow-hidden cursor-pointer group"
              onClick={() => openLightbox(images.map(imgSrc), images.indexOf(cover))}>
              <LazyImage src={imgSrc(cover)} alt="" className="w-full h-28 transition-transform duration-300 group-hover:scale-105" />
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
                  <LazyImage key={globalIdx} src={imgSrc(img)} alt=""
                    className={`shrink-0 w-12 h-12 rounded-lg border cursor-pointer transition-all hover:border-accent hover:shadow-sm ${img === cover ? 'outline outline-2 outline-offset-[-1px] outline-accent border-accent' : 'border-border'}`}
                    onClick={() => openLightbox(images.map(imgSrc), globalIdx)} />
                );
              })}
              {hiddenCount > 0 && (
                <div className="shrink-0 w-12 h-12 rounded-lg border border-border bg-bg-secondary flex items-center justify-center cursor-pointer hover:border-accent hover:bg-accent-softer transition-all"
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
          {images.length > 0 && (
            <div className="text-[10px] text-text-muted/40 text-center mt-1.5 select-none">
              共 {images.length} 张
            </div>
          )}
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
            {item.status === 'saved_to_wechat' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">公众号草稿</span>
            )}
            {item.status === 'published' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">已发布</span>
            )}
            {item.status === 'failed' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/20">发布失败</span>
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
            {!isPublished ? (
              <>
                <button className="btn btn-primary" onClick={() => setPublishConfirm('draft')} disabled={!!publishingAction || generating}>
                  {publishingAction === 'draft' ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存草稿中...</> : '保存草稿'}
                </button>
                <button className="btn" onClick={() => setPublishConfirm('publish')} disabled={!!publishingAction || generating}>
                  {publishingAction === 'publish' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 发布中...</> : '直接发布'}
                </button>
                <button className="btn" onClick={generateContent} disabled={!!publishingAction || generating}>
                  {generating ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 润色中</> : (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 2v4"/><path d="M12 22a10 10 0 0 1-10-10"/><path d="M12 22v-4"/><path d="M22 12h-4"/><path d="M2 12h4"/></svg>
                    AI 润色</>
                  )}
                </button>
                <button className="btn btn-ghost text-danger" onClick={() => setShowDeleteConfirm(true)} disabled={!!publishingAction}>删除</button>
              </>
            ) : (
              <EffectEntry itemId={itemId} title={title} />
            )}
          </div>

          <ConfirmDialog open={showDeleteConfirm} title="删除发布队列项" message={`确认删除《${title || '无标题'}》？`} confirmText="删除" danger onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }} onCancel={() => setShowDeleteConfirm(false)} />
          <PublishConfirmModal
            open={!!publishConfirm}
            action={publishConfirm || 'draft'}
            account={wechatAccounts.find(a => a.account_id === selectedAccountId) || null}
            title={title}
            content={desc}
            cover={cover}
            images={images}
            loading={!!publishingAction}
            onConfirm={() => {
              const action = publishConfirm;
              setPublishConfirm(null);
              publish({ save_draft: action !== 'publish' });
            }}
            onCancel={() => setPublishConfirm(null)}
          />

          {(logs.length > 0 || publishingAction) && (
            <div ref={logContainerRef} className="bg-bg-secondary border border-border rounded-xl p-3 max-h-44 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                {publishingAction && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />}
                <span className="text-xs font-medium text-text-muted">{publishingAction ? '发布中...' : '发布日志'}</span>
                {!publishingAction && logs.length > 0 && (
                  <button className="ml-auto text-xs text-text-muted hover:text-accent transition-colors shrink-0"
                    onClick={() => { navigator.clipboard.writeText(logs.join('\n')); addToast('日志已复制', 'info'); }}>
                    复制日志
                  </button>
                )}
              </div>
              <div className="space-y-0.5 select-text">
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
