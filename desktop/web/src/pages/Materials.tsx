import React, { useEffect, useState } from 'react';
import { useStore } from '../stores';
import { materialsApi, queueApi } from '../api/client';
import ContextMenu, { type MenuItem } from '../components/ContextMenu';

export default function Materials() {
  const {
    materialsData, matFilter, matSelected,
    setMaterialsData, setMatFilter, matToggleSelect, matSelectAll, matClearSelection,
    openLightbox, addToast,
  } = useStore();

  useEffect(() => { materialsApi.list().then(setMaterialsData); }, [setMaterialsData]);

  const filteredGroups = matFilter
    ? materialsData.groups.filter((g) => g.celebrity.includes(matFilter))
    : materialsData.groups;

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  const allImages: string[] = [];
  filteredGroups.forEach((g) => g.scenes.forEach((s) => s.posts.forEach((p) => p.images.forEach((img) => allImages.push(img)))));

  async function matDeleteSelected() {
    const paths = [...matSelected];
    if (!paths.length) return;
    if (!confirm(`确认删除 ${paths.length} 张图片？此操作不可恢复。`)) return;
    try {
      await materialsApi.delete(paths);
      matClearSelection();
      setMaterialsData(await materialsApi.list());
      addToast(`已删除 ${paths.length} 张图片`, 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  async function matEnqueueSelected() {
    const paths = [...matSelected];
    if (!paths.length) return;
    try {
      await queueApi.add({ title: '', desc: '', images: paths, cover: paths[0] });
      matClearSelection();
      addToast(`已加入队列，共 ${paths.length} 张图片`, 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  function openMatLightbox(path: string) {
    const idx = allImages.indexOf(path);
    openLightbox(allImages.map(imgSrc), idx >= 0 ? idx : 0);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">本地素材</h2>
        <p className="text-xs text-text-muted mt-0.5">管理已下载的图片素材</p>
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <input type="text" placeholder="搜索明星..." value={matFilter} onChange={(e) => setMatFilter(e.target.value)} className="flex-1 min-w-[200px]" />
          <div className="flex gap-4 text-[11px] text-text-muted">
            <span>共 {materialsData.total_images} 张图片</span>
            <span>{materialsData.groups.length} 位明星</span>
            <span>已选 <strong className="text-text-secondary">{matSelected.size}</strong> 张</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-sm" onClick={matSelectAll}>全选当前</button>
          <button className="btn btn-sm" onClick={matClearSelection} disabled={!matSelected.size}>取消选择</button>
          <button className="btn btn-sm" onClick={matEnqueueSelected} disabled={!matSelected.size}>加入发布队列</button>
          <button className="btn btn-sm btn-danger" onClick={matDeleteSelected} disabled={!matSelected.size}>删除所选</button>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <div className="text-3xl mb-2 opacity-40">🖼️</div>
          <p className="text-sm">{matFilter ? '没有匹配的素材' : '暂无本地素材，请先在「图片发现」页面下载图片'}</p>
        </div>
      ) : (
        filteredGroups.map((group) => <CelebrityGroup key={group.celebrity} group={group} imgSrc={imgSrc} openMatLightbox={openMatLightbox} />)
      )}
    </div>
  );
}

function CelebrityGroup({ group, imgSrc, openMatLightbox }: {
  group: { celebrity: string; scenes: { scene: string; posts: { post_id: string; images: string[] }[]; total: number }[]; total: number };
  imgSrc: (p: string) => string;
  openMatLightbox: (p: string) => void;
}) {
  const { matSelected, matToggleSelect, addToast } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; img: string; scene: string } | null>(null);

  function handleContextMenu(e: React.MouseEvent, img: string, scene: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, img, scene });
  }

  function getCtxMenuItems(): MenuItem[] {
    if (!ctxMenu) return [];
    const fileName = ctxMenu.img.split('/').pop() || '';
    return [
      { label: '查看大图', onClick: () => openMatLightbox(ctxMenu.img),
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg> },
      { label: '加入发布队列', onClick: async () => {
          try { await queueApi.add({ title: '', desc: '', images: [ctxMenu.img], cover: ctxMenu.img }); addToast('已加入发布队列', 'success'); } catch (err: any) { addToast(err.message, 'error'); }
        },
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg> },
      { label: `${fileName}`, disabled: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 opacity-50"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/></svg> },
      { label: `场景：${ctxMenu.scene}`, disabled: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 opacity-50"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> },
      { label: '删除此图片', danger: true, onClick: async () => {
          if (!confirm(`确认删除 ${fileName}？`)) return;
          try { await materialsApi.delete([ctxMenu.img]); addToast('已删除', 'success'); useStore.getState().setMaterialsData(await materialsApi.list()); } catch (err: any) { addToast(err.message, 'error'); }
        },
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> },
    ];
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-secondary transition-colors select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={`text-[10px] text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
        <span className="text-sm font-semibold text-text">{group.celebrity}</span>
        <span className="text-[11px] text-text-muted ml-auto">{group.total} 张 · {group.scenes.length} 场景</span>
      </div>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {group.scenes.map((scene) => (
            <div key={scene.scene}>
              <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider py-1 px-0.5">{scene.scene} · {scene.total}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
                {scene.posts.flatMap((post) =>
                  post.images.map((img) => {
                    const isSel = matSelected.has(img);
                    const fileName = img.split('/').pop() || '';
                    return (
                      <div key={img} onContextMenu={(e) => handleContextMenu(e, img, scene.scene)} className={`bg-bg border rounded-lg overflow-hidden transition-all ${isSel ? 'ring-1 ring-accent border-accent' : 'border-border hover:shadow-sm'}`}>
                        <img src={imgSrc(img)} alt="" className="w-full h-[180px] object-cover cursor-pointer" onClick={() => openMatLightbox(img)} loading="lazy" />
                        <div className="px-2.5 py-2 flex items-center justify-between">
                          <div className="text-[10px] text-text-muted truncate max-w-[100px]" title={fileName}>{fileName.slice(0, 18)}</div>
                          <input type="checkbox" checked={isSel} onChange={() => matToggleSelect(img)} className="w-3.5 h-3.5 accent-[var(--accent)]" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {ctxMenu && (
        <ContextMenu
          items={getCtxMenuItems()}
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
