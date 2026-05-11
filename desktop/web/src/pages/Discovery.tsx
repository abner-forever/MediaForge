import { useEffect, useState, useRef } from 'react';
import { useStore } from '../stores';
import { discoveryApi, downloadStream, queueApi, settingsApi, searchStream, platformApi, PlatformMeta } from '../api/client';
import Select from '../components/Select';
import NumberInput from '../components/NumberInput';
import SearchLoadingOverlay from '../components/SearchLoadingOverlay';
import ConfirmDialog from '../components/ConfirmDialog';

function fmtTime(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function Discovery() {
  const store = useStore();
  const {
    discoveryPosts, selectedPosts, imageScores, selectedImages,
    setDiscoveryPosts, togglePostSelect, clearSelectedPosts, selectAllPosts,
    setImageScores, toggleImageSelect, selectAllImages, clearSelectedImages,
    openLightbox, addToast, setProgress,
  } = store;

  const [platform, setPlatform] = useState('weibo');
  const [platforms, setPlatforms] = useState<Record<string, PlatformMeta>>({});
  const [mode, setMode] = useState('celebrities');
  const [pages, setPages] = useState(2);
  const [limit, setLimit] = useState(5);
  const [celebs, setCelebs] = useState('');
  const [tags, setTags] = useState('');
  const [superTopics, setSuperTopics] = useState('');
  const [toutiaoKeywords, setToutiaoKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [filterWatermark, setFilterWatermark] = useState(false);
  const [watermarkedImages, setWatermarkedImages] = useState<Set<string>>(new Set());
  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  const activePlatform = platforms[platform];
  const modeOptions = activePlatform
    ? Object.entries(activePlatform.fetch_modes).map(([k, v]) => ({ label: v, value: k }))
    : [];

  useEffect(() => {
    Promise.all([platformApi.list(), settingsApi.get()]).then(([p, s]) => {
      setPlatforms(p.platforms);
      const def = p.default || 'weibo';
      if (p.platforms[def]) { setPlatform(def); setMode(p.platforms[def].default_fetch_mode); }
      if (s.weibo_celebrities) setCelebs(s.weibo_celebrities);
      if (s.weibo_search_tags) setTags(s.weibo_search_tags);
      if (s.weibo_super_topics) setSuperTopics(s.weibo_super_topics);
      if (s.weibo_pages) setPages(s.weibo_pages);
      if (s.post_limit) setLimit(s.post_limit);
      if (s.toutiao_search_tags) setToutiaoKeywords(s.toutiao_search_tags);
    }).catch(() => {});
  }, []);

  function handlePlatformChange(p: string) {
    setPlatform(p);
    const meta = platforms[p];
    if (meta) setMode(meta.default_fetch_mode);
    setCelebs(''); setTags(''); setSuperTopics(''); setToutiaoKeywords('');
  }

  const hasLocal = discoveryPosts.some((p) => p.local_images && p.local_images.length > 0);

  const allLocalImages: { path: string; scoreInfo: { score: number; reason: string; method: string }; celebrity: string; scene: string }[] = [];
  discoveryPosts.forEach((p) => {
    (p.local_images || []).forEach((img) => {
      const s = imageScores[img] || { score: 0, reason: '未评分', method: 'unknown' };
      allLocalImages.push({ path: img, scoreInfo: s, celebrity: p.celebrity, scene: p.scene });
    });
  });
  allLocalImages.sort((a, b) => b.scoreInfo.score - a.scoreInfo.score);

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    const idx = p.indexOf('data/images/');
    return `/images/${idx >= 0 ? p.slice(idx + 'data/images/'.length) : p.split('/').pop()}`;
  };

  async function doSearch() {
    setSearching(true); setSearchMessage('正在搜索…');
    const ctrl = new AbortController(); searchAbortRef.current = ctrl;
    try {
      await searchStream({
        platform, mode,
        celebrities: celebs.split(',').map(s => s.trim()).filter(Boolean),
        search_tags: platform === 'toutiao' ? toutiaoKeywords.split(',').map(s => s.trim()).filter(Boolean) : tags.split(',').map(s => s.trim()).filter(Boolean),
        super_topics: superTopics.split(',').map(s => s.trim()).filter(Boolean),
        max_pages: pages, post_limit: limit,
      }, (evt) => {
        if (evt.type === 'progress') setSearchMessage(evt.message!);
        else if (evt.type === 'done') {
          discoveryApi.get().then(r => setDiscoveryPosts(r.posts));
          clearSelectedPosts(); setImageScores({}); clearSelectedImages();
          addToast(`找到 ${evt.total_posts} 条帖子，${evt.total_images} 张图片`, 'success');
        } else if (evt.type === 'error') addToast(evt.message || '搜索失败', 'error');
      }, ctrl.signal);
    } catch (err: any) {
      if (err.name !== 'AbortError') addToast(err.message, 'error');
    }
    setSearching(false); searchAbortRef.current = null;
  }

  function cancelSearch() { searchAbortRef.current?.abort(); }

  async function doDownload(indicesStr: string) {
    const indices = indicesStr ? indicesStr.split(',').map(Number) : discoveryPosts.map((_, i) => i);
    const totalImages = indices.reduce((s, i) => s + (discoveryPosts[i]?.images?.length || 0), 0);
    if (!totalImages) { addToast('没有可下载的图片', 'error'); return; }
    setProgress({ current: 0, total: totalImages, detail: '开始下载...' });
    try {
      await downloadStream(indicesStr, (evt) => {
        if (evt.type === 'start') setProgress({ current: 0, total: evt.total!, detail: '准备下载...' });
        else if (evt.type === 'progress') setProgress({ current: evt.current!, total: evt.total!, detail: `${evt.celebrity} · ${evt.scene}` });
        else if (evt.type === 'done') {
          discoveryApi.get().then(r => { setDiscoveryPosts(r.posts); if (r.posts.flatMap(p => p.local_images || []).length) discoveryApi.checkWatermark(r.posts.flatMap(p => p.local_images || [])).then(res => setWatermarkedImages(new Set(res.watermarked))); });
          addToast(`下载完成！${evt.downloaded} 张成功${evt.dropped ? `，${evt.dropped} 张跳过` : ''}`, 'success');
        }
      }, filterWatermark);
    } catch (err: any) { addToast(err.message, 'error'); }
    setProgress(null);
  }

  async function doDownloadSelected() {
    if (!selectedPosts.size) { addToast('请先勾选要下载的帖子', 'error'); return; }
    await doDownload([...selectedPosts].join(',')); clearSelectedPosts();
  }

  async function doScore() {
    setLoading(true);
    try { const r = await discoveryApi.score(true); setImageScores(r.scores); addToast(`评分完成！Vision: ${r.vision_count}，启发式: ${r.heuristic_count}`, 'success'); }
    catch (err: any) { addToast(err.message, 'error'); }
    setLoading(false);
  }

  async function removePost(index: number) {
    try { await discoveryApi.removePost(index); const n = [...discoveryPosts]; n.splice(index, 1); setDiscoveryPosts(n); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  function clearDiscovery() { setDiscoveryPosts([]); clearSelectedPosts(); setImageScores({}); clearSelectedImages(); }

  async function enqueueSelected() {
    if (!selectedImages.length) { addToast('请先选择图片', 'error'); return; }
    setProgress({ current: 0, total: 0, detail: '正在生成文案并加入队列...' });
    try { const r = await queueApi.enqueueSelected(selectedImages); clearSelectedImages(); addToast(`已加入队列：《${r.title}》`, 'success'); }
    catch (err: any) { addToast(err.message, 'error'); }
    setProgress(null);
  }

  function openPostLightbox(pi: number, ii: number) {
    const p = discoveryPosts[pi]; if (!p) return;
    openLightbox((p.local_images || p.images).map(imgSrc), ii);
  }

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h2 className="text-xl font-bold text-text tracking-tight">图片发现</h2>
        <p className="text-sm text-text-secondary mt-1">从平台搜寻美图，AI 智能评分筛选</p>
      </div>

      {/* Search */}
      <div className="card space-y-4">
        <div className="section-header">搜索参数</div>
        <div className="grid grid-cols-3 gap-3">
          <label>内容平台
            <Select value={platform} onChange={handlePlatformChange} options={Object.values(platforms).map(p => ({ label: p.name, value: p.id }))} />
          </label>
          <label>抓取模式
            <Select value={mode} onChange={setMode} options={modeOptions} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label>抓取页数<NumberInput value={pages} onChange={setPages} min={1} max={5} /></label>
          <label>处理帖子数<NumberInput value={limit} onChange={setLimit} min={1} max={20} /></label>
        </div>
        {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed') && (
          <label>明星列表（逗号分隔）<input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} /></label>
        )}
        {platform === 'weibo' && mode === 'super_topic' && (
          <label>超话列表（逗号分隔）<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="如：迪丽热巴超话,杨幂超话" /></label>
        )}
        {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed' || mode === 'keyword') && (
          <label>搜索标签（逗号分隔）<input type="text" value={tags} onChange={e => setTags(e.target.value)} /></label>
        )}
        {platform === 'toutiao' && mode === 'keyword' && (
          <label>搜索关键词（逗号分隔）<input type="text" value={toutiaoKeywords} onChange={e => setToutiaoKeywords(e.target.value)} placeholder="时尚,明星,穿搭" /></label>
        )}
        <label className="flex-row items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={filterWatermark} onChange={e => setFilterWatermark(e.target.checked)} className="w-3.5 h-3.5 accent-accent" />
          <span className="text-xs font-normal text-text-secondary">下载时过滤疑似水印图片</span>
        </label>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={doSearch} disabled={loading}>开始搜索</button>
          <button className="btn" onClick={doDownloadSelected} disabled={!selectedPosts.size}>下载选中{selectedPosts.size > 0 ? ` (${selectedPosts.size})` : ''}</button>
          <button className="btn" onClick={() => doDownload('')} disabled={!discoveryPosts.length}>全部下载</button>
          <button className="btn" onClick={doScore} disabled={!hasLocal}>AI 评分</button>
          <button className="btn btn-ghost" onClick={() => setClearConfirm(true)}>清除</button>
        </div>
      </div>

      {/* Posts */}
      {discoveryPosts.length > 0 && (
        <div className="card stagger">
          <div className="flex items-center gap-2 mb-3">
            <div className="section-header shrink-0">搜索结果</div>
            <span className="text-xs text-text-muted">({discoveryPosts.reduce((s, p) => s + (p.images?.length || 0), 0)} 张)</span>
            {hasLocal && <span className="tag tag-accent">已下载 {allLocalImages.length} 张</span>}
            <button className="btn btn-xs ml-auto" onClick={selectAllPosts}>全选/取消</button>
          </div>
          <div className="space-y-2">
            {discoveryPosts.map((p, pi) => {
              const imgs = p.local_images || [];
              const remoteImgs = p.images || [];
              const displayImgs = imgs.length ? imgs : remoteImgs;
              const isChecked = selectedPosts.has(pi);
              return (
                <div key={pi} className={`rounded-lg p-3 border transition-all ${isChecked ? 'bg-accent-soft border-accent' : 'bg-bg-card border-border'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={isChecked} onChange={() => togglePostSelect(pi)} className="w-3.5 h-3.5 accent-accent cursor-pointer" />
                    <span className="text-sm font-semibold text-text">{p.celebrity}</span>
                    {p.screen_name && (
                      p.screen_name === p.celebrity
                        ? <span className="tag tag-accent">本人</span>
                        : <span className="tag">@{p.screen_name}</span>
                    )}
                    <span className="tag">{p.scene}</span>
                    <span className="text-xs text-text-muted">{remoteImgs.length} 张图{imgs.length ? ` · 已下载 ${imgs.length}` : ''}</span>
                    {p.created_at && <span className="text-xs text-text-muted">{fmtTime(p.created_at)}</span>}
                    <div className="ml-auto flex gap-1">
                      <button className="btn btn-xs btn-ghost" onClick={() => doDownload(String(pi))}>下载</button>
                      <button className="btn btn-xs btn-ghost text-text-muted hover:text-danger" onClick={() => setRemoveConfirmIndex(pi)}>删除</button>
                    </div>
                  </div>
                  {p.text && <div className="text-xs text-text-muted mb-2 line-clamp-2 leading-relaxed">{p.text.slice(0, 100)}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    {displayImgs.slice(0, 12).map((img, ii) => (
                      <img key={ii} src={imgSrc(img)} alt="" className="w-[76px] h-[76px] object-cover rounded-lg border border-border cursor-pointer transition-all hover:border-accent hover:shadow-sm" onClick={() => openPostLightbox(pi, ii)} onError={e => (e.currentTarget.style.display = 'none')} loading="lazy" />
                    ))}
                    {displayImgs.length > 12 && (
                      <div className="w-[76px] h-[76px] rounded-lg border border-border flex items-center justify-center text-xs text-text-muted bg-bg-card">+{displayImgs.length - 12}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gallery */}
      {allLocalImages.length > 0 && (
        <div className="card stagger">
          <div className="flex items-center gap-2 mb-3">
            <div className="section-header shrink-0">图片画廊</div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-text-muted">已选 <strong className="text-text">{selectedImages.length}</strong></span>
              <button className="btn btn-xs" onClick={() => selectAllImages(allLocalImages.map(i => i.path))}>全选/取消</button>
              {selectedImages.length > 0 && <button className="btn btn-primary btn-xs" onClick={enqueueSelected}>加入发布队列</button>}
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
            {allLocalImages.map((item, i) => {
              const s = item.scoreInfo;
              const scoreColor = s.score >= 70 ? 'text-emerald-600' : s.score >= 40 ? 'text-amber-600' : 'text-red-500';
              const isSel = selectedImages.includes(item.path);
              return (
                <div key={item.path} className={`bg-bg-card border rounded-lg overflow-hidden transition-all ${isSel ? 'ring-1 ring-accent border-accent' : 'border-border hover:border-accent/50'}`}>
                  <img src={imgSrc(item.path)} alt="" className="w-full h-[160px] object-cover cursor-pointer" onClick={() => { const paths = allLocalImages.map(x => imgSrc(x.path)); openLightbox(paths, i); }} loading="lazy" />
                  <div className="px-2.5 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>{s.score}</span>
                      <span className="text-[10px] text-text-muted truncate max-w-[70px]">{s.reason}</span>
                    </div>
                    <input type="checkbox" checked={isSel} onChange={() => toggleImageSelect(item.path)} className="w-3 h-3 accent-accent" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {discoveryPosts.length === 0 && (
        <div className="card">
          <div className="empty-state py-12">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">配置搜索参数后点击「开始搜索」</div>
          </div>
        </div>
      )}

      {searching && <SearchLoadingOverlay message={searchMessage} platformName={activePlatform?.name} onCancel={cancelSearch} />}

      <ConfirmDialog open={removeConfirmIndex !== null} title="删除帖子" message={`确认删除第 ${removeConfirmIndex !== null ? removeConfirmIndex + 1 : ''} 条帖子？`} confirmText="删除" danger onConfirm={() => { if (removeConfirmIndex !== null) removePost(removeConfirmIndex); setRemoveConfirmIndex(null); }} onCancel={() => setRemoveConfirmIndex(null)} />
      <ConfirmDialog open={clearConfirm} title="清除搜索结果" message="确认清除所有搜索结果？" confirmText="清除" danger onConfirm={() => { setClearConfirm(false); clearDiscovery(); }} onCancel={() => setClearConfirm(false)} />
    </div>
  );
}
