import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../stores';
import { queueApi, publishLogsApi, type QueueItem } from '../api/client';
import Select from '../components/Select';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Queue() {
  const { queue, setQueue, addToast } = useStore();
  useEffect(() => { queueApi.get().then(d => setQueue(d.queue)); }, [setQueue]);

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h2 className="text-xl font-bold text-text tracking-tight">发布队列</h2>
        <p className="text-sm text-text-secondary mt-1">预览和发布图文内容到公众号</p>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">发布队列为空</div>
            <div className="empty-state-desc">请在「图片发现」页面选图并加入队列</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {queue.map((item, i) => <QueueCard key={i} item={item} index={i} imgSrc={imgSrc} />)}
        </div>
      )}
    </div>
  );
}

function QueueCard({ item, index, imgSrc }: { item: QueueItem; index: number; imgSrc: (p: string) => string }) {
  const { openLightbox, addToast, setQueue } = useStore();
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  const [cover, setCover] = useState(item.cover);
  const [logs, setLogs] = useState<string[]>(() => item.publish_logs || []);
  const [publishing, setPublishing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  async function updateField(field: string, value: string) { await queueApi.update(index, { [field]: value } as any); }
  async function deleteItem() { await queueApi.remove(index); setQueue((await queueApi.get()).queue); addToast('已删除', 'info'); }

  async function generateContent() {
    addToast('AI 正在生成文案...', 'info');
    try {
      const r = await queueApi.generate(index); setTitle(r.title); setDesc(r.desc); setQueue((await queueApi.get()).queue);
      addToast(r.message || '已生成文案', r.message ? 'error' : 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
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
    setQueue((await queueApi.get()).queue);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-52 p-4 bg-accent-soft/60 border-b md:border-b-0 md:border-r border-border-subtle">
          {cover && <img src={imgSrc(cover)} alt="" className="w-full h-28 object-cover rounded-lg mb-2" onError={e => (e.currentTarget.style.display = 'none')} />}
          <div className="flex flex-wrap gap-1">
            {(item.images || []).map((img, ii) => (
              <img key={ii} src={imgSrc(img)} alt="" className="w-9 h-9 object-cover rounded border border-border cursor-pointer hover:border-accent transition-colors" onClick={() => openLightbox(item.images.map(imgSrc), ii)} onError={e => (e.currentTarget.style.display = 'none')} />
            ))}
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {item.celebrity && <div className="flex items-center gap-2 text-sm text-text-muted"><span>👤</span><span className="font-medium text-text-secondary">{item.celebrity}</span></div>}
          <label>标题
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} />
          </label>
          <label>文案
            <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} rows={3} />
          </label>
          <label>封面
            <Select value={cover} onChange={v => { setCover(v); updateField('cover', v); }} options={(item.images || []).map(img => ({ label: img.split('/').pop() || img, value: img }))} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={() => publish({ save_draft: true })} disabled={publishing}>保存草稿</button>
            <button className="btn" onClick={() => publish({ save_draft: false })} disabled={publishing}>直接发布</button>
            <button className="btn" onClick={() => publish({ dry_run: true })} disabled={publishing}>预览</button>
            <button className="btn" onClick={generateContent} disabled={publishing}>AI 生成文案</button>
            <button className="btn btn-ghost text-danger" onClick={() => setShowDeleteConfirm(true)} disabled={publishing}>删除</button>
          </div>

          <ConfirmDialog open={showDeleteConfirm} title="删除队列项" message={`确认删除《${title || '无标题'}》？`} confirmText="删除" danger onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }} onCancel={() => setShowDeleteConfirm(false)} />

          {(logs.length > 0 || publishing) && (
            <div className="bg-bg-secondary border border-border rounded-lg p-3 max-h-44 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                {publishing && <span className="inline-block w-2 h-2 rounded-full bg-accent" />}
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
}
