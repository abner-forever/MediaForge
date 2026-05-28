import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { effectsApi } from '../../api/client';
import type { PublishEffect } from '../../api/client';
import Select from '../ui/Select';

const SOURCE_PLATFORMS = [
  { value: '', label: '请选择' },
  { value: 'weibo', label: '微博' },
  { value: 'toutiao', label: '头条' },
  { value: 'xhs', label: '小红书' },
  { value: 'douyin', label: '抖音' },
  { value: 'rss', label: 'RSS' },
  { value: 'other', label: '其他' },
];

export function showEffectEntry(itemId: string, title?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    let done = false;

    function cleanup(saved: boolean) {
      if (done) return;
      done = true;
      root.unmount();
      if (el.parentNode) el.parentNode.removeChild(el);
      resolve(saved);
    }

    root.render(
      <EffectEntryModal itemId={itemId} title={title} onClose={() => cleanup(false)} onSaved={() => cleanup(true)} />
    );
  });
}

function EffectEntryModal({ itemId, title, onClose, onSaved }: {
  itemId: string; title?: string; onClose: () => void; onSaved: () => void;
}) {
  const [effect, setEffect] = useState<PublishEffect | null>(null);
  const [reads, setReads] = useState('');
  const [likes, setLikes] = useState('');
  const [shares, setShares] = useState('');
  const [favorites, setFavorites] = useState('');
  const [comments, setComments] = useState('');
  const [newFollowers, setNewFollowers] = useState('');
  const [contentType, setContentType] = useState<'image' | 'article' | ''>('');
  const [sourcePlatform, setSourcePlatform] = useState('');
  const [celebrity, setCelebrity] = useState('');
  const [saving, setSaving] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    effectsApi.get(itemId).then(({ effect: e }) => {
      if (e) {
        setEffect(e);
        setReads(String(e.reads || ''));
        setLikes(String(e.likes || ''));
        setShares(String(e.shares || ''));
        setFavorites(String(e.favorites || ''));
        setComments(String(e.comments || ''));
        setNewFollowers(String(e.new_followers || ''));
        setContentType(e.content_type || '');
        setSourcePlatform(e.source_platform || '');
        setCelebrity(e.celebrity || '');
      }
    }).catch(() => {});
  }, [itemId]);

  function handleClose() {
    setExiting(true);
    setTimeout(() => onClose(), 200);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await effectsApi.save(itemId, {
        reads: parseInt(reads) || 0,
        likes: parseInt(likes) || 0,
        shares: parseInt(shares) || 0,
        favorites: parseInt(favorites) || 0,
        comments: parseInt(comments) || 0,
        new_followers: parseInt(newFollowers) || 0,
        content_type: contentType || undefined,
        source_platform: sourcePlatform || undefined,
        celebrity: celebrity || undefined,
        title,
      });
      setExiting(true);
      setTimeout(() => onSaved(), 200);
    } catch { /* ignore */ }
    setSaving(false);
  }

  const labelStyle = 'text-xs text-text-muted mb-1 block';

  return (
    <div
      className={`fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm ${exiting ? 'animate-out' : 'animate-in'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-bg-card border border-border rounded-2xl p-6 shadow-xl min-w-[420px] max-w-[520px] ${exiting ? 'animate-scale-out' : 'animate-scale'}`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text mb-4">发布效果录入</h3>

        {/* 全部指标 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle}>阅读量</label>
            <input type="number" min="0" className="w-full text-sm" value={reads} onChange={e => setReads(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>点赞</label>
            <input type="number" min="0" className="w-full text-sm" value={likes} onChange={e => setLikes(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>分享</label>
            <input type="number" min="0" className="w-full text-sm" value={shares} onChange={e => setShares(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>收藏</label>
            <input type="number" min="0" className="w-full text-sm" value={favorites} onChange={e => setFavorites(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>评论数</label>
            <input type="number" min="0" className="w-full text-sm" value={comments} onChange={e => setComments(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>新增关注</label>
            <input type="number" min="0" className="w-full text-sm" value={newFollowers} onChange={e => setNewFollowers(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={labelStyle}>内容类型</label>
            <Select value={contentType} onChange={v => setContentType(v as typeof contentType)} options={[{ value: '', label: '请选择' }, { value: 'image', label: '图文' }, { value: 'article', label: '文章' }]} />
          </div>
          <div>
            <label className={labelStyle}>素材来源</label>
            <Select value={sourcePlatform} onChange={setSourcePlatform} options={SOURCE_PLATFORMS} />
          </div>
          <div className="col-span-2">
            <label className={labelStyle}>关联艺人</label>
            <input type="text" className="w-full text-sm" value={celebrity} onChange={e => setCelebrity(e.target.value)} placeholder="艺人名称" />
          </div>
        </div>

        {/* 历史数据摘要 */}
        {effect && (effect.reads > 0 || effect.likes > 0) && (
          <div className="flex items-center gap-2.5 text-xs text-text-muted mt-3 pt-3 border-t border-border flex-wrap">
            {effect.reads > 0 && <span>阅读 {effect.reads.toLocaleString()}</span>}
            {effect.likes > 0 && <span>点赞 {effect.likes}</span>}
            {effect.shares > 0 && <span>分享 {effect.shares}</span>}
            {effect.favorites > 0 && <span>收藏 {effect.favorites}</span>}
            {effect.comments ? <span>评论 {effect.comments}</span> : null}
            {effect.celebrity && <span>艺人 {effect.celebrity}</span>}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-border">
          <button className="btn" onClick={handleClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 保留默认导出：按钮形态，点击后通过函数调用拉起弹窗 */
export default function EffectEntry({ itemId, title }: { itemId: string; title?: string }) {
  return (
    <button className="btn btn-sm btn-ghost text-xs" onClick={() => showEffectEntry(itemId, title)}>
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 21V10a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11m0 0h8V6a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v14m6-8h.01"/><path d="M4 21h16"/></svg>
      效果录入
    </button>
  );
}
