import { useEffect, useState } from 'react';
import { useStore } from '../stores';
import { queueApi, type QueueItem } from '../api/client';

export default function Queue() {
  const { queue, setQueue, addToast } = useStore();

  useEffect(() => { queueApi.get().then((d) => setQueue(d.queue)); }, [setQueue]);

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  return (
    <div className="space-y-5 max-w-4xl">
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

  async function updateField(field: string, value: string) {
    await queueApi.update(index, { [field]: value } as any);
  }

  async function deleteItem() {
    await queueApi.remove(index);
    setQueue((await queueApi.get()).queue);
    addToast('已删除', 'info');
  }

  async function generateContent() {
    addToast('AI 正在生成标题和文案...', 'info');
    try {
      const res = await queueApi.generate(index);
      setTitle(res.title); setDesc(res.desc);
      setQueue((await queueApi.get()).queue);
      addToast(`已生成：《${res.title}》`, 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  async function publish(opts: { dry_run?: boolean; save_draft?: boolean }) {
    const action = opts.dry_run ? '预览' : opts.save_draft === false ? '发布' : '保存草稿';
    addToast(`正在${action}...`, 'info');
    try {
      const res = await queueApi.publish(index, opts);
      addToast(res.success ? `${action}成功：${res.message}` : `${action}失败：${res.message}`, res.success ? 'success' : 'error');
    } catch (err: any) { addToast(err.message, 'error'); }
    setQueue((await queueApi.get()).queue);
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-56 p-4 bg-bg-secondary border-b md:border-b-0 md:border-r border-border">
          {item.cover && (
            <img src={imgSrc(item.cover)} alt="" className="w-full h-32 object-cover rounded-lg mb-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <div className="flex flex-wrap gap-1">
            {(item.images || []).map((img, ii) => (
              <img key={ii} src={imgSrc(img)} alt="" className="w-10 h-10 object-cover rounded border border-border cursor-pointer hover:border-text-muted transition-colors" onClick={() => openLightbox(item.images.map(imgSrc), ii)} onError={(e) => (e.currentTarget.style.display = 'none')} />
            ))}
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          <label>标题
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => updateField('title', title)} maxLength={64} />
          </label>
          <label>文案
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => updateField('desc', desc)} />
          </label>
          <label>封面
            <select value={cover} onChange={(e) => { setCover(e.target.value); updateField('cover', e.target.value); }}>
              {(item.images || []).map((img) => <option key={img} value={img}>{img.split('/').pop()}</option>)}
            </select>
          </label>
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={() => publish({ save_draft: true })}>保存草稿</button>
            <button className="btn" onClick={() => publish({ save_draft: false })}>直接发布</button>
            <button className="btn" onClick={() => publish({ dry_run: true })}>预览</button>
            <button className="btn" onClick={generateContent}>AI 生成</button>
            <button className="btn btn-danger" onClick={deleteItem}>删除</button>
          </div>
        </div>
      </div>
    </div>
  );
}
