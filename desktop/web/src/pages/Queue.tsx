import React, { useEffect, useState, useRef, useCallback } from 'react';
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
            <div className="empty-state-desc">请在「图片发现」页面选图并加入队列</div>
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
          return sortedIndices.map(({ i }, idx) => (
            <div key={i} className="flex gap-3">
              {/* Timeline track */}
              <div className="relative w-4 flex flex-col items-center shrink-0">
                {sortedIndices.length > 1 && (
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />
                )}
                <div className="relative z-10 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-accent/20 shrink-0 mt-0.5" />
              </div>
              {/* Content */}
              <div className={`flex-1 min-w-0 ${idx < sortedIndices.length - 1 ? 'pb-6' : ''}`}>
                <div className="text-[11px] text-text-muted leading-none mb-2 pt-px">{formatTime(queue[i].time)}</div>
                <QueueCard item={queue[i]} index={i} />
              </div>
            </div>
          ));
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
  const logsLenRef = useRef(logs.length);

  useEffect(() => {
    // 只在日志追加时（发布过程中）滚动到底部，挂载时已有的日志不触发
    if (logEndRef.current && logs.length > logsLenRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
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

  const pollLogs = useCallback(async () => {
    for (let i = 0; i < 6; i++) { const d = await publishLogsApi.get(0); if (d.active) break; await new Promise(r => setTimeout(r, 500)); }
    let offset = 0;
    while (true) {
      try { const d = await publishLogsApi.get(offset); if (d.logs.length) { setLogs(p => [...p, ...d.logs]); offset = d.total; } if (!d.active && offset > 0) break; } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setPublishing(false);
  }, []);

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

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Cover / Images Sidebar */}
        <div className="md:w-48 p-4 bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0">
          {cover && (
            <div className="relative mb-3 rounded-xl overflow-hidden">
              <img src={imgSrc(cover)} alt="" className="w-full h-28 object-cover" loading="lazy" onError={e => (e.currentTarget.style.display = 'none')} />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl" />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {images.map((img, ii) => (
              <img key={ii} src={imgSrc(img)} alt="" loading="lazy"
                className={`w-9 h-9 object-cover rounded-lg border cursor-pointer transition-all hover:border-accent hover:shadow-sm ${img === cover ? 'ring-2 ring-accent border-accent' : 'border-border'}`}
                onClick={() => openLightbox(images.map(imgSrc), ii)}
                onError={e => (e.currentTarget.style.display = 'none')} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          {item.celebrity && (
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span className="font-medium text-text-secondary">{item.celebrity}</span>
            </div>
          )}
          {item.status === 'saved' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">保存成功</span>
          )}
          {item.status === 'published' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">发布成功</span>
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

          <ConfirmDialog open={showDeleteConfirm} title="删除队列项" message={`确认删除《${title || '无标题'}》？`} confirmText="删除" danger onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }} onCancel={() => setShowDeleteConfirm(false)} />

          {/* Logs */}
          {(logs.length > 0 || publishing) && (
            <div className="bg-bg-secondary border border-border rounded-xl p-3 max-h-44 overflow-y-auto">
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
