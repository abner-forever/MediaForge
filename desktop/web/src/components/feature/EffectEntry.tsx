import { useEffect, useState } from 'react';
import { effectsApi } from '../../api/client';
import type { PublishEffect } from '../../api/client';

export default function EffectEntry({
  itemId, title,
}: {
  itemId: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [effect, setEffect] = useState<PublishEffect | null>(null);
  const [reads, setReads] = useState('');
  const [likes, setLikes] = useState('');
  const [shares, setShares] = useState('');
  const [favorites, setFavorites] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    effectsApi.get(itemId).then(({ effect: e }) => {
      if (e) {
        setEffect(e);
        setReads(String(e.reads || ''));
        setLikes(String(e.likes || ''));
        setShares(String(e.shares || ''));
        setFavorites(String(e.favorites || ''));
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open, itemId, loaded]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await effectsApi.save(itemId, {
        reads: parseInt(reads) || 0,
        likes: parseInt(likes) || 0,
        shares: parseInt(shares) || 0,
        favorites: parseInt(favorites) || 0,
        title,
      });
      setEffect(r.effect);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div>
      {!open ? (
        <button className="btn btn-sm btn-ghost text-xs" onClick={() => setOpen(true)}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 21V10a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v11m0 0h8V6a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v14m6-8h.01"/><path d="M4 21h16"/></svg>
          效果录入
        </button>
      ) : (
        <div className="border border-border rounded-xl p-3 bg-bg-secondary space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted">发布效果</span>
            <button className="text-xs text-text-muted hover:text-text" onClick={() => setOpen(false)}>收起</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <label className="text-xs text-text-muted">阅读量</label>
              <input type="number" min="0" className="w-full text-sm" value={reads} onChange={e => setReads(e.target.value)}
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-text-muted">点赞</label>
              <input type="number" min="0" className="w-full text-sm" value={likes} onChange={e => setLikes(e.target.value)}
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-text-muted">分享</label>
              <input type="number" min="0" className="w-full text-sm" value={shares} onChange={e => setShares(e.target.value)}
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-text-muted">收藏</label>
              <input type="number" min="0" className="w-full text-sm" value={favorites} onChange={e => setFavorites(e.target.value)}
                placeholder="0" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
          {effect && (effect.reads > 0 || effect.likes > 0) && (
            <div className="flex items-center gap-3 text-xs text-text-muted pt-1 border-t border-border">
              {effect.reads > 0 && <span>阅读 {effect.reads}</span>}
              {effect.likes > 0 && <span>点赞 {effect.likes}</span>}
              {effect.shares > 0 && <span>分享 {effect.shares}</span>}
              {effect.favorites > 0 && <span>收藏 {effect.favorites}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
