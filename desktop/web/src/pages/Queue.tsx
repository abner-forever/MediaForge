import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../stores';
import { queueApi, publishLogsApi, type QueueItem } from '../api/client';
import Select from '../components/Select';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Queue() {
  const { queue, setQueue, addToast } = useStore();

  useEffect(() => { queueApi.get().then((d) => setQueue(d.queue)); }, [setQueue]);

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">发布队列</h2>
        <p className="text-xs text-text-muted mt-0.5">预览和发布图文内容到公众号</p>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <div className="text-3xl mb-2 opacity-40">📭</div>
          <p className="text-sm">发布队列为空，请先在「图片发现」页面选图并加入队列</p>
        </div>
      ) : (
        queue.map((item, i) => <QueueCard key={i} item={item} index={i} imgSrc={imgSrc} />)
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

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  async function updateField(field: string, value: string) {
    await queueApi.update(index, { [field]: value } as any);
  }

  async function deleteItem() {
    await queueApi.remove(index);
    setQueue((await queueApi.get()).queue);
    addToast('已删除', 'info');
  }

  async function generateContent() {
    addToast('AI 正在生成文案...', 'info');
    try {
      const res = await queueApi.generate(index);
      setTitle(res.title); setDesc(res.desc);
      setQueue((await queueApi.get()).queue);
      if (res.message) {
        addToast(res.message, 'error');
      } else {
        addToast(`已生成文案`, 'success');
      }
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  // 轮询发布日志：只在发布中（active=true）时记录日志
  const pollLogs = useCallback(async () => {
    // 等待后端发布开始（最多等 3 秒）
    for (let i = 0; i < 6; i++) {
      const data = await publishLogsApi.get(0);
      if (data.active) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    let offset = 0;
    while (true) {
      try {
        const data = await publishLogsApi.get(offset);
        if (data.logs.length > 0) {
          setLogs((prev) => [...prev, ...data.logs]);
          offset = data.total;
        }
        if (!data.active && offset > 0) break;
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    setPublishing(false);
  }, []);

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info');
    setLogs([]);
    setPublishing(true);

    // 先发请求，等后端清空日志后再轮询
    const pubPromise = queueApi.publish(index, opts);
    // 延迟一小段时间确保后端已调用 clear_publish_logs
    await new Promise((r) => setTimeout(r, 300));
    pollLogs();

    try {
      const res = await pubPromise;
      addToast(res.success ? `${action}成功：${res.message}` : `${action}失败：${res.message}`, res.success ? 'success' : 'error');
    } catch (err: any) { addToast(err.message, 'error'); }
    setQueue((await queueApi.get()).queue);
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl shadow-sm">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-56 p-4 bg-bg-secondary border-b md:border-b-0 md:border-r border-border overflow-hidden">
          {cover && (
            <img src={imgSrc(cover)} alt="" className="w-full h-32 object-cover rounded-lg mb-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <div className="flex flex-wrap gap-1">
            {(item.images || []).map((img, ii) => (
              <img key={ii} src={imgSrc(img)} alt="" className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:border-accent/50 transition-colors" onClick={() => openLightbox(item.images.map(imgSrc), ii)} onError={(e) => (e.currentTarget.style.display = 'none')} />
            ))}
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {item.celebrity && (
            <div className="flex items-center gap-2 text-[13px] text-text-muted">
              <span className="text-base">👤</span>
              <span>{item.celebrity}</span>
            </div>
          )}
          <label>标题
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} />
          </label>
          <label>文案
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} />
          </label>
          <label>封面
            <Select value={cover} onChange={(v) => { setCover(v); updateField('cover', v); }} options={(item.images || []).map((img) => ({ label: img.split('/').pop() || img, value: img }))} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={() => publish({ save_draft: true })} disabled={publishing}>保存草稿</button>
            <button className="btn" onClick={() => publish({ save_draft: false })} disabled={publishing}>直接发布</button>
            <button className="btn" onClick={() => publish({ dry_run: true })} disabled={publishing}>预览</button>
            <button className="btn" onClick={generateContent} disabled={publishing}>AI 生成文案</button>
            <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={publishing}>删除</button>
          </div>

          <ConfirmDialog
            open={showDeleteConfirm}
            title="删除队列项"
            message={`确认删除《${title || '无标题'}》？此操作不可恢复。`}
            confirmText="删除"
            danger
            onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />

          {(logs.length > 0 || publishing) && (
            <div className="bg-bg-secondary border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                {publishing && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />}
                <span className="text-[12px] font-medium text-text-muted">{publishing ? '发布中...' : '发布日志'}</span>
              </div>
              <div className="space-y-0.5">
                {logs.map((msg, i) => (
                  <div key={i} className="text-[12px] text-text-secondary font-mono leading-relaxed">{msg}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
