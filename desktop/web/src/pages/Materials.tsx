import React, { useEffect, useState } from 'react';
import { useStore } from '../stores';
import { materialsApi, queueApi } from '../api/client';
import ContextMenu, { type MenuItem } from '../components/ContextMenu';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Materials() {
  const {
    materialsData, matFilter, matSelected,
    setMaterialsData, setMatFilter, matToggleSelect, matSelectAll, matClearSelection,
    openLightbox, addToast,
  } = useStore();
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  useEffect(() => { materialsApi.list().then(setMaterialsData); }, [setMaterialsData]);

  const filteredGroups = matFilter ? materialsData.groups.filter(g => g.celebrity.includes(matFilter)) : materialsData.groups;

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  const allImages: string[] = [];
  filteredGroups.forEach(g => g.scenes.forEach(s => s.posts.forEach(p => p.images.forEach(img => allImages.push(img)))));

  async function matDeleteSelected() {
    if (!matSelected.size) return;
    try { await materialsApi.delete([...matSelected]); matClearSelection(); setMaterialsData(await materialsApi.list()); addToast(`已删除`, 'success'); } catch (err: any) { addToast(err.message, 'error'); }
  }

  async function matEnqueueSelected() {
    const paths = [...matSelected]; if (!paths.length) return;
    try { await queueApi.add({ title: '', desc: '', images: paths, cover: paths[0] }); matClearSelection(); addToast(`已加入队列`, 'success'); } catch (err: any) { addToast(err.message, 'error'); }
  }

  function openMatLightbox(path: string) {
    const idx = allImages.indexOf(path);
    openLightbox(allImages.map(imgSrc), idx >= 0 ? idx : 0);
  }

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h2 className="text-xl font-bold text-text tracking-tight">本地素材</h2>
        <p className="text-sm text-text-secondary mt-1">管理已下载的图片素材</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 flex-wrap">
          <input type="text" placeholder="搜索明星..." value={matFilter} onChange={e => setMatFilter(e.target.value)} className="flex-1 min-w-[180px]" />
          <div className="flex gap-4 text-xs text-text-muted">
            <span>共 <strong className="text-text">{materialsData.total_images}</strong> 张</span>
            <span><strong className="text-text">{materialsData.groups.length}</strong> 位明星</span>
            <span>已选 <strong className="text-text">{matSelected.size}</strong></span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-sm" onClick={matSelectAll}>全选当前</button>
          <button className="btn btn-sm" onClick={matClearSelection} disabled={!matSelected.size}>取消选择</button>
          <button className="btn btn-sm" onClick={matEnqueueSelected} disabled={!matSelected.size}>加入发布队列</button>
          <button className="btn btn-sm btn-danger" onClick={() => setShowBatchDeleteConfirm(true)} disabled={!matSelected.size}>删除所选</button>
        </div>
      </div>

      <ConfirmDialog open={showBatchDeleteConfirm} title="批量删除" message={`确认删除 ${matSelected.size} 张图片？`} confirmText="删除" danger onConfirm={() => { setShowBatchDeleteConfirm(false); matDeleteSelected(); }} onCancel={() => setShowBatchDeleteConfirm(false)} />

      {filteredGroups.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <div className="empty-state-icon">🖼️</div>
            <div className="empty-state-title">{matFilter ? '没有匹配的素材' : '暂无本地素材'}</div>
            <div className="empty-state-desc">{!matFilter && '请在「图片发现」页面下载图片'}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {filteredGroups.map(group => <CelebrityGroup key={group.celebrity} group={group} imgSrc={imgSrc} openMatLightbox={openMatLightbox} />)}
        </div>
      )}
    </div>
  );
}

function CelebrityGroup({ group, imgSrc, openMatLightbox }: {
  group: { celebrity: string; scenes: { scene: string; posts: { post_id: string; images: string[] }[]; total: number }[]; total: number };
  imgSrc: (p: string) => string; openMatLightbox: (p: string) => void;
}) {
  const { matSelected, matToggleSelect, addToast } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; img: string; scene: string } | null>(null);
  const [ctxDeleteConfirm, setCtxDeleteConfirm] = useState(false);

  function handleContextMenu(e: React.MouseEvent, img: string, scene: string) { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, img, scene }); }

  function getCtxMenuItems(): MenuItem[] {
    if (!ctxMenu) return [];
    const fn = ctxMenu.img.split('/').pop() || '';
    return [
      { label: '查看大图', onClick: () => openMatLightbox(ctxMenu.img), icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg> },
      { label: '加入发布队列', onClick: async () => { try { await queueApi.add({ title: '', desc: '', images: [ctxMenu.img], cover: ctxMenu.img }); addToast('已加入队列', 'success'); } catch (err: any) { addToast(err.message, 'error'); } }, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg> },
      { label: fn, disabled: true, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 opacity-50"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/></svg> },
      { label: `场景：${ctxMenu.scene}`, disabled: true, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 opacity-50"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> },
      { label: '删除此图片', danger: true, onClick: () => setCtxDeleteConfirm(true), icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> },
    ];
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
        <span className={`text-[10px] text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
        <span className="text-sm font-bold text-text">{group.celebrity}</span>
        <span className="text-xs text-text-muted ml-auto">{group.total} 张 · {group.scenes.length} 场景</span>
      </div>
      {!collapsed && (
        <div className="mt-4 space-y-4">
          {group.scenes.map(scene => (
            <div key={scene.scene}>
              <div className="section-header mb-2.5">{scene.scene}<span className="text-xs ml-1 lowercase">({scene.total})</span></div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
                {scene.posts.flatMap(post => post.images.map(img => {
                  const isSel = matSelected.has(img);
                  return (
                    <div key={img} onContextMenu={e => handleContextMenu(e, img, scene.scene)} className={`bg-bg-card border rounded-lg overflow-hidden transition-all ${isSel ? 'ring-1 ring-accent border-accent' : 'border-border hover:border-accent/50'}`}>
                      <img src={imgSrc(img)} alt="" className="w-full h-[160px] object-cover cursor-pointer" onClick={() => openMatLightbox(img)} loading="lazy" />
                      <div className="px-2.5 py-2 flex items-center justify-between">
                        <span className="text-[10px] text-text-muted truncate max-w-[110px]">{(img.split('/').pop() || '').slice(0, 18)}</span>
                        <input type="checkbox" checked={isSel} onChange={() => matToggleSelect(img)} className="w-3 h-3 accent-accent" />
                      </div>
                    </div>
                  );
                }))}
              </div>
            </div>
          ))}
        </div>
      )}
      {ctxMenu && <ContextMenu items={getCtxMenuItems()} position={{ x: ctxMenu.x, y: ctxMenu.y }} onClose={() => setCtxMenu(null)} />}
      <ConfirmDialog open={ctxDeleteConfirm} title="删除图片" message={`确认删除 ${ctxMenu?.img.split('/').pop() || ''}？`} confirmText="删除" danger onConfirm={async () => { setCtxDeleteConfirm(false); if (!ctxMenu) return; try { await materialsApi.delete([ctxMenu.img]); addToast('已删除', 'success'); useStore.getState().setMaterialsData(await materialsApi.list()); } catch (err: any) { addToast(err.message, 'error'); } }} onCancel={() => setCtxDeleteConfirm(false)} />
    </div>
  );
}
