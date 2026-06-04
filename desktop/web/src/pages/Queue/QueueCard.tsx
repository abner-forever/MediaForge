import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../stores';
import { queueApi, publishLogsApi, type QueueItem, type WeChatAccount } from '../../api/client';
import Select from '../../components/Select';
import { useLoading } from '../../hooks/useLoading';
import { imgSrc, thumbSrc } from './utils';
import ArticleCard from './ArticleCard';
import LazyImage from '../Discovery/LazyImage';
import { Modal } from '../../components/modalApi.tsx';

const MAX_VISIBLE_THUMBS = 3;

function withCacheBust(url: string, versions: Record<string, number>, img: string): string {
  const v = versions[img];
  if (!v) return url;
  return url + (url.includes('?') ? '&' : '?') + 'v=' + v;
}

const QueueCard = React.memo(function QueueCard({ item, seq, accounts }: { item: QueueItem; seq?: number; accounts: WeChatAccount[] }) {
  const itemId = item.id!;
  const openLightbox = useStore(s => s.openLightbox);
  const addToast = useStore(s => s.addToast);
  const setQueue = useStore(s => s.setQueue);
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  const [cover, setCover] = useState(item.cover);
  const [logs, setLogs] = useState<string[]>(() => item.publish_logs || []);
  const [publishingAction, setPublishingAction] = useState<'draft' | 'publish' | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(() => {
    const hasLogs = (item.publish_logs || []).length > 0;
    const isActive = ['publishing'].includes(item.status || '');
    return isActive || !hasLogs;
  });
  const [selectedAccountId, setSelectedAccountId] = useState(item.account_id || '');
  const isPublished = item.status === 'published';

  // 注册/注销进行中的发布任务
  const registerTask = useStore(s => s.registerTask);
  const unregisterTask = useStore(s => s.unregisterTask);
  const taskName = publishingAction === 'draft' ? '队列存草稿' : publishingAction === 'publish' ? '队列发布文章' : null;
  useEffect(() => {
    if (taskName) {
      registerTask(taskName);
      return () => unregisterTask(taskName);
    }
  }, [taskName, registerTask, unregisterTask]);
  const { loading: generating, withLoading: withGenerating } = useLoading();
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsLenRef = useRef(logs.length);
  const pollReceivedRef = useRef(false);
  const [thumbStart, setThumbStart] = useState(0);
  const [thumbVersions, setThumbVersions] = useState<Record<string, number>>({});
  const [removingWm, setRemovingWm] = useState<string | null>(null);
  const [batchRemovingWm, setBatchRemovingWm] = useState(false);

  async function handleRemoveWatermark(img: string) {
    const filename = img.split('/').pop() || img;
    const { confirmed } = await Modal.confirm({
      title: '去除水印',
      message: `将尝试去除此图片的水印：\n${filename}`,
      confirmText: '去除',
    });
    if (!confirmed) return;
    setRemovingWm(img);
    try {
      const r = await queueApi.removeWatermark(itemId, img);
      if (r.success && r.action !== 'none') {
        setQueue(r.queue);
        setThumbVersions(prev => ({ ...prev, [img]: Date.now() }));
        addToast(r.message || '水印已去除', 'success');
      } else if (r.success) {
        addToast(r.message || '未检测到水印', 'info');
      } else {
        addToast(r.message || '去除失败', 'error');
      }
    } catch (err: any) {
      addToast(err.message || '去除失败', 'error');
    } finally {
      setRemovingWm(null);
    }
  }

  async function handleBatchRemoveWatermarks() {
    const { confirmed } = await Modal.confirm({
      title: '批量去水印',
      message: `将对全部 ${images.length} 张图片检测并去除水印，是否继续？`,
      confirmText: '开始处理',
    });
    if (!confirmed) return;
    setBatchRemovingWm(true);
    try {
      const r = await queueApi.batchRemoveWatermarks(itemId);
      setQueue(r.queue);
      if (r.processed > 0) {
        const now = Date.now();
        setThumbVersions(prev => {
          const next = { ...prev };
          images.forEach(img => { next[img] = now; });
          return next;
        });
      }
      const parts = [];
      if (r.processed > 0) parts.push(`${r.processed} 张已去除`);
      if (r.skipped > 0) parts.push(`${r.skipped} 张无需处理`);
      if (r.failed > 0) parts.push(`${r.failed} 张失败`);
      addToast(parts.join('，') || '处理完成', r.failed > 0 ? 'info' : 'success');
    } catch (err: any) {
      addToast(err.message || '批量去水印失败', 'error');
    } finally {
      setBatchRemovingWm(false);
    }
  }

  // 账号列表由父组件传入，不再独立请求
  useEffect(() => {
    if (!item.account_id) {
      const def = accounts.find(a => a.is_default);
      if (def) setSelectedAccountId(def.account_id);
    }
  }, [item.account_id, accounts]);

  useEffect(() => {
    if (logs.length > logsLenRef.current) {
      const el = logContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
    logsLenRef.current = logs.length;
  }, [logs]);

  useEffect(() => {
    if (pollReceivedRef.current) return;
    const isTerminal = ['failed', 'saved_to_wechat', 'published'].includes(item.status || '');
    if ((!publishingAction || isTerminal) && item.publish_logs && item.publish_logs.length > logs.length) {
      setLogs(item.publish_logs);
    }
  }, [item.publish_logs, publishingAction, item.status]);

  async function updateField(field: string, value: string) { await queueApi.update(itemId, { [field]: value } as any); }

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

  async function deleteItem(deleteLocal: boolean) {
    try {
      await queueApi.remove(itemId, deleteLocal);
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
    for (let i = 0; i < 6; i++) {
      if (signal.aborted) return;
      try { const d = await publishLogsApi.get(0, sid); if (d.active) break; } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    while (!signal.aborted) {
      try {
        const d = await publishLogsApi.get(offset, sid);
        if (d.logs.length) {
          pollReceivedRef.current = true;
          setLogs(p => [...p, ...d.logs]);
          offset = d.total;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }, [logSessionId]);

  const publishRef = useRef(false);

  async function pollUntilDone(signal: AbortSignal): Promise<boolean> {
    for (let i = 0; i < 150; i++) {
      if (signal.aborted) return false;
      try {
        const refreshed = await queueApi.get();
        setQueue(refreshed.queue);
        const updated = refreshed.queue.find(q => q.id === itemId);
        if (updated) {
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

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean; headless?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info'); setLogs([]); setPublishingAction(opts.save_draft !== false ? 'draft' : 'publish'); setLogsExpanded(true); publishRef.current = true; pollReceivedRef.current = false;
    const pubPromise = queueApi.publish(itemId, { ...opts, account_id: selectedAccountId || undefined });
    await new Promise(r => setTimeout(r, 300));
    const ac = new AbortController();
    pollLogs({ signal: ac.signal });
    let success = false;
    let started = false;
    try { const r = await pubPromise; if (r.started) { started = true; } else { success = r.success; if (r.success) Modal.alert({ message: `${action}成功${r.message ? '：' + r.message : ''}` }); else addToast(`${action}失败：${r.message}`, 'error'); } } catch (err: any) { /* empty */ }
    publishRef.current = false;

    if (started) {
      success = await pollUntilDone(ac.signal);
      if (success) Modal.alert({ message: `${action}成功` }); else addToast('发布失败', 'error');
    } else {
      await new Promise(r => setTimeout(r, 800));
    }
    ac.abort();
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
    return <ArticleCard item={item} seq={seq} accounts={accounts} />;
  }

  return (
    <div
      className="card overflow-visible"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 280px' }}
    >
      <div className="flex flex-col md:flex-row">
        <div className="md:w-48 p-4 bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0 relative md:rounded-bl-xl">
          {seq !== undefined && (
            <div className="absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shadow-sm ring-2 ring-bg-card">
              {seq}
            </div>
          )}
          {cover && (
            <div className="relative mb-3 rounded-xl overflow-hidden cursor-pointer group"
              onClick={() => openLightbox(images.map(i => withCacheBust(imgSrc(i), thumbVersions, i)), images.indexOf(cover))}>
              <LazyImage src={withCacheBust(thumbSrc(cover), thumbVersions, cover)} alt="" className="w-full h-28 transition-transform duration-300 group-hover:scale-105" />
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
                  <LazyImage key={globalIdx} src={withCacheBust(thumbSrc(img), thumbVersions, img)} alt=""
                    className={`shrink-0 w-12 h-12 rounded-lg border cursor-pointer transition-all hover:border-accent hover:shadow-sm ${img === cover ? 'border-accent' : 'border-border'}`}
                    onClick={() => openLightbox(images.map(i => withCacheBust(imgSrc(i), thumbVersions, i)), globalIdx)} />
                );
              })}
              {hiddenCount > 0 && (
                <div className="shrink-0 w-12 h-12 rounded-lg border border-border bg-bg-secondary flex items-center justify-center cursor-pointer hover:border-accent hover:bg-accent-softer transition-all"
                  onClick={() => openLightbox(images.map(i => withCacheBust(imgSrc(i), thumbVersions, i)), thumbStart + MAX_VISIBLE_THUMBS)}
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

        <div className="flex-1 p-4 space-y-3 min-w-0">
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
          {accounts.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-sm text-text-muted shrink-0 w-14 pt-2.5">发布到</span>
              <div className="flex-1">
                <Select
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                  options={accounts.map(acc => ({
                      label: `${acc.name}${acc.logged_in ? '' : ' (未登录)'}`,
                      value: acc.account_id,
                    }))}
                />
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="text-sm text-text-muted shrink-0 w-14 pt-2.5">标题</span>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} placeholder="输入标题…" disabled={isPublished} className="flex-1" />
          </div>
          <div className="flex items-start gap-3">
            <span className="text-sm text-text-muted shrink-0 w-14 pt-2.5">正文</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} rows={3} placeholder="正文内容（可选）…" disabled={isPublished} className="flex-1" />
          </div>
          <div className="flex items-start gap-3">
            <span className="text-sm text-text-muted shrink-0 w-14 pt-2.5">封面</span>
            <div className="flex-1 min-w-0">
              {images.length === 0 ? (
                <span className="text-xs text-text-muted/50">暂无图片</span>
              ) : (
                <div className="relative">
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin flex-nowrap">
                    {images.map((img, i) => {
                      const isActive = img === cover;
                      return (
                        <div key={i} className="relative shrink-0 w-[88px] aspect-[3/4] group/img">
                          <button type="button"
                            className={`w-full h-full rounded-lg border-2 overflow-hidden transition-all focus:outline-none ${
                              isActive
                                ? 'border-accent shadow-sm'
                                : 'border-border hover:border-accent/50 hover:shadow-xs'
                            } ${isPublished ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                            onClick={() => { setCover(img); updateField('cover', img); }}
                            disabled={isPublished}
                            title={img.split('/').pop() || img}>
                            <LazyImage src={withCacheBust(thumbSrc(img), thumbVersions, img)} alt="" className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2 min-w-[16px] h-4 px-1 rounded bg-black/50 text-white text-[10px] font-medium flex items-center justify-center backdrop-blur-sm">{i + 1}</div>
                            {isActive && (
                              <div className="absolute bottom-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center shadow-sm">
                                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                              </div>
                            )}
                          </button>
                          <button type="button"
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/80 backdrop-blur-sm"
                            title="查看大图"
                            onClick={(e) => { e.stopPropagation(); openLightbox(images.map(j => withCacheBust(imgSrc(j), thumbVersions, j)), i); }}>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                          </button>
                          {!isPublished && (
                            <>
                              <button type="button"
                                className="absolute top-1 left-1 z-10 w-5 h-5 rounded-full bg-danger/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-danger shadow-sm"
                                title="删除此图片"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const filename = img.split('/').pop() || img;
                                  const { confirmed, checked: checkboxChecked } = await Modal.confirm({
                                    title: '删除图片',
                                    message: `确认从队列中移除此图片？\n${filename}`,
                                    confirmText: '删除',
                                    danger: true,
                                    checkboxLabel: '同时删除本地资源',
                                    defaultChecked: true,
                                  });
                                  if (!confirmed) return;
                                  try {
                                    const r = await queueApi.removeImage(itemId, img, checkboxChecked);
                                    setQueue(r.queue);
                                    addToast('已删除图片', 'info');
                                  } catch (err: any) {
                                    addToast(err.message || '删除失败', 'error');
                                  }
                                }}>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                              <button type="button"
                                className={`absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-accent/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-accent shadow-sm ${removingWm === img ? 'animate-pulse pointer-events-none' : ''}`}
                                title="去除水印"
                                onClick={(e) => { e.stopPropagation(); handleRemoveWatermark(img); }}>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {images.length > 1 && (
                    <div className="text-[10px] text-text-muted/40 text-right mt-1 select-none">
                      共 {images.length} 张 · 点击设封面 · 悬停查看大图
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap pt-1">
            {!isPublished && (
              <>
                <button className="btn btn-primary" onClick={async () => {
                  const { confirmed, headless: hl } = await Modal.publishConfirm({ action: 'draft', account: accounts.find(a => a.account_id === selectedAccountId) || null, title, content: desc, cover, images });
                  if (confirmed) publish({ save_draft: true, headless: hl });
                }} disabled={!!publishingAction || generating}>
                  {publishingAction === 'draft' ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存草稿中...</> : '保存草稿'}
                </button>
                <button className="btn" onClick={async () => {
                  const { confirmed, headless: hl } = await Modal.publishConfirm({ action: 'publish', account: accounts.find(a => a.account_id === selectedAccountId) || null, title, content: desc, cover, images });
                  if (confirmed) publish({ save_draft: false, headless: hl });
                }} disabled={!!publishingAction || generating}>
                  {publishingAction === 'publish' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 发布中...</> : '直接发布'}
                </button>
                <button className="btn" onClick={generateContent} disabled={!!publishingAction || generating}>
                  {generating ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 润色中</> : (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 2v4"/><path d="M12 22a10 10 0 0 1-10-10"/><path d="M12 22v-4"/><path d="M22 12h-4"/><path d="M2 12h4"/></svg>
                    AI 润色</>
                  )}
                </button>
                <button className="btn" onClick={handleBatchRemoveWatermarks} disabled={!!publishingAction || batchRemovingWm || generating}>
                  {batchRemovingWm ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 去水印中...</> : (
                    <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                    批量去水印</>
                  )}
                </button>
              </>
            )}
            <button className="btn btn-ghost text-danger" onClick={async () => {
              const { confirmed, checked: checkboxChecked } = await Modal.confirm({ title: '删除发布队列项', message: `确认删除《${title || '无标题'}》？`, confirmText: '删除', danger: true, checkboxLabel: '同时删除本地资源', defaultChecked: true });
              if (confirmed) deleteItem(checkboxChecked);
            }} disabled={!!publishingAction}>删除</button>
          </div>

          {(logs.length > 0 || publishingAction) && (
            <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
              <button type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
                onClick={() => setLogsExpanded(v => !v)}>
                {publishingAction && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />}
                <span>{publishingAction ? '发布中...' : '发布日志'}</span>
                <span className="text-text-muted/50">({logs.length})</span>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {!publishingAction && logs.length > 0 && (
                    <span className="text-text-muted hover:text-accent transition-colors"
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(logs.join('\n')); addToast('日志已复制', 'info'); }}>
                      复制
                    </span>
                  )}
                  <svg className={`w-3 h-3 transition-transform duration-200 ${logsExpanded ? 'rotate-0' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </button>
              <div
                ref={logContainerRef}
                className="overflow-y-auto transition-all duration-300 ease-in-out"
                style={{ maxHeight: logsExpanded ? '11rem' : '0px', opacity: logsExpanded ? 1 : 0, paddingBlock: logsExpanded ? undefined : 0, paddingInline: logsExpanded ? '0.75rem' : '0.75rem' }}
              >
                <div className="pb-3">
                  <div className="space-y-0.5 select-text">
                    {logs.map((msg, i) => <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed">{msg}</div>)}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default QueueCard;
