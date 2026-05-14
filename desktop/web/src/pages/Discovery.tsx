import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../stores';
import { discoveryApi, downloadStream, queueApi, settingsApi, searchStream, platformApi, PlatformMeta } from '../api/client';
import Select from '../components/Select';
import NumberInput from '../components/NumberInput';
import SearchLoadingOverlay from '../components/SearchLoadingOverlay';
import ConfirmDialog from '../components/ConfirmDialog';
import Loading from '../components/Loading';
import { useLoading } from '../hooks/useLoading';

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
    setDiscoveryPosts, togglePostSelect, clearSelectedPosts,
    setImageScores, toggleImageSelect, selectAllImages, clearSelectedImages,
    openLightbox, addToast, setProgress,
  } = store;

  const [platform, setPlatform] = useState('weibo');
  const [platforms, setPlatforms] = useState<Record<string, PlatformMeta>>({});
  const [mode, setMode] = useState('celebrities');
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [celebs, setCelebs] = useState('');
  const [tags, setTags] = useState('');
  const [superTopics, setSuperTopics] = useState('');
  const [toutiaoKeywords, setToutiaoKeywords] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [filterWatermark, setFilterWatermark] = useState(false);
  const [minImages, setMinImages] = useState(5);
  const [watermarkedImages, setWatermarkedImages] = useState<Set<string>>(new Set());
  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'gallery'>('posts');
  const searchAbortRef = useRef<AbortController | null>(null);

  const { loading: scoring, withLoading: withScoring } = useLoading();
  const { loading: downloading, withLoading: withDownloading } = useLoading();
  const { loading: enqueuing, withLoading: withEnqueuing } = useLoading();

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

  // Filter posts by minimum image count
  const filteredIndices = useMemo(() =>
    discoveryPosts.reduce<number[]>((acc, p, i) => {
      if ((p.images?.length || 0) >= minImages) acc.push(i);
      return acc;
    }, []),
  [discoveryPosts, minImages]);

  // Has any local images across all posts (for AI score button)
  const hasLocalAny = discoveryPosts.some((p) => p.local_images && p.local_images.length > 0);

  // All local images from filtered posts, sorted by score
  const allLocalImages: { path: string; scoreInfo: { score: number; reason: string; method: string }; celebrity: string; scene: string; postIndex: number }[] = [];
  filteredIndices.forEach((origIdx) => {
    const p = discoveryPosts[origIdx];
    (p.local_images || []).forEach((img) => {
      const s = imageScores[img] || { score: 0, reason: '未评分', method: 'unknown' };
      allLocalImages.push({ path: img, scoreInfo: s, celebrity: p.celebrity, scene: p.scene, postIndex: origIdx });
    });
  });
  allLocalImages.sort((a, b) => b.scoreInfo.score - a.scoreInfo.score);

  // Group gallery images by post
  const galleryGroups = useMemo(() => {
    const groups: { postIndex: number; celebrity: string; scene: string; images: typeof allLocalImages }[] = [];
    const map = new Map<number, typeof allLocalImages>();
    allLocalImages.forEach((item) => {
      const list = map.get(item.postIndex);
      if (list) list.push(item);
      else map.set(item.postIndex, [item]);
    });
    for (const [postIndex, images] of map) {
      groups.push({ postIndex, celebrity: images[0].celebrity, scene: images[0].scene, images });
    }
    groups.sort((a, b) => {
      const maxA = Math.max(...a.images.map(i => i.scoreInfo.score));
      const maxB = Math.max(...b.images.map(i => i.scoreInfo.score));
      return maxB - maxA;
    });
    return groups;
  }, [allLocalImages]);

  const imgSrc = (p: string) => {
    if (p.startsWith('http')) return `/proxy?url=${encodeURIComponent(p)}`;
    if (!p.startsWith('/')) return `/images/${encodeURIComponent(p).replace(/%2F/g, '/')}`;
    const idx = p.indexOf('data/images/');
    const rel = idx >= 0 ? p.slice(idx + 'data/images/'.length) : (p.split('/').pop() || '');
    return `/images/${encodeURIComponent(rel).replace(/%2F/g, '/')}`;
  };

  async function doSearch() {
    setSearching(true); setSearchMessage('正在搜索…');
    setCurrentPage(1);
    const ctrl = new AbortController(); searchAbortRef.current = ctrl;
    try {
      await searchStream({
        platform, mode,
        celebrities: celebs.split(',').map(s => s.trim()).filter(Boolean),
        search_tags: platform === 'toutiao' ? toutiaoKeywords.split(',').map(s => s.trim()).filter(Boolean) : tags.split(',').map(s => s.trim()).filter(Boolean),
        super_topics: superTopics.split(',').map(s => s.trim()).filter(Boolean),
        max_pages: 1, post_limit: limit, page: 1,
      }, (evt) => {
        if (evt.type === 'progress') setSearchMessage(evt.message!);
        else if (evt.type === 'done') {
          discoveryApi.get().then(r => setDiscoveryPosts(r.posts));
          clearSelectedPosts(); setImageScores({}); clearSelectedImages();
          setActiveTab('posts');
          addToast(`找到 ${evt.total_posts} 条帖子，${evt.total_images} 张图片`, 'success');
        } else if (evt.type === 'error') addToast(evt.message || '搜索失败', 'error');
      }, ctrl.signal);
    } catch (err: any) {
      if (err.name !== 'AbortError') addToast(err.message, 'error');
    }
    setSearching(false); searchAbortRef.current = null;
  }

  async function loadMore() {
    const nextPage = currentPage + 1;
    setSearching(true); setSearchMessage(`正在加载第 ${nextPage} 页…`);
    const ctrl = new AbortController(); searchAbortRef.current = ctrl;
    try {
      await searchStream({
        platform, mode,
        celebrities: celebs.split(',').map(s => s.trim()).filter(Boolean),
        search_tags: platform === 'toutiao' ? toutiaoKeywords.split(',').map(s => s.trim()).filter(Boolean) : tags.split(',').map(s => s.trim()).filter(Boolean),
        super_topics: superTopics.split(',').map(s => s.trim()).filter(Boolean),
        max_pages: 1, post_limit: limit, page: nextPage,
      }, (evt) => {
        if (evt.type === 'progress') setSearchMessage(evt.message!);
        else if (evt.type === 'done') {
          discoveryApi.get().then(r => setDiscoveryPosts(r.posts));
          setCurrentPage(nextPage);
          addToast(`已加载第 ${nextPage} 页，共 ${evt.total_posts} 条帖子`, 'success');
        } else if (evt.type === 'error') addToast(evt.message || '加载失败', 'error');
      }, ctrl.signal);
    } catch (err: any) {
      if (err.name !== 'AbortError') addToast(err.message, 'error');
    }
    setSearching(false); searchAbortRef.current = null;
  }

  function cancelSearch() { searchAbortRef.current?.abort(); }

  async function doDownload(indicesStr: string) {
    await withDownloading(async () => {
      const indices = indicesStr ? indicesStr.split(',').map(Number) : discoveryPosts.map((_, i) => i);
      const totalImages = indices.reduce((s, i) => s + (discoveryPosts[i]?.images?.length || 0), 0);
      if (!totalImages) { addToast('没有可下载的图片', 'error'); return; }
      setProgress({ current: 0, total: totalImages, detail: '开始下载...' });
      try {
        await downloadStream(indicesStr, (evt) => {
          if (evt.type === 'start') setProgress({ current: 0, total: evt.total!, detail: '准备下载...' });
          else if (evt.type === 'progress') setProgress({ current: evt.current!, total: evt.total!, detail: `${evt.celebrity} · ${evt.scene}` });
          else if (evt.type === 'done') {
            discoveryApi.get().then(r => {
              setDiscoveryPosts(r.posts);
              const downloaded = r.posts.flatMap(p => p.local_images || []);
              if (downloaded.length) {
                setActiveTab('gallery');
                discoveryApi.checkWatermark(downloaded).then(res => setWatermarkedImages(new Set(res.watermarked)));
              }
            });
            addToast(`下载完成！${evt.downloaded} 张成功${evt.dropped ? `，${evt.dropped} 张跳过` : ''}`, 'success');
          }
        }, filterWatermark);
      } catch (err: any) { addToast(err.message, 'error'); }
      setProgress(null);
    });
  }

  async function doDownloadSelected() {
    if (!selectedPosts.size) { addToast('请先勾选要下载的帖子', 'error'); return; }
    await doDownload([...selectedPosts].join(',')); clearSelectedPosts();
  }

  async function doScore() {
    await withScoring(async () => {
      try { const r = await discoveryApi.score(true); setImageScores(r.scores); addToast(`评分完成！Vision: ${r.vision_count}，启发式: ${r.heuristic_count}`, 'success'); }
      catch (err: any) { addToast(err.message, 'error'); }
    });
  }

  async function removePost(index: number) {
    try { await discoveryApi.removePost(index); const n = [...discoveryPosts]; n.splice(index, 1); setDiscoveryPosts(n); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  function clearDiscovery() { setDiscoveryPosts([]); setCurrentPage(1); clearSelectedPosts(); setImageScores({}); clearSelectedImages(); }

  async function enqueueSelected() {
    if (!selectedImages.length) { addToast('请先选择图片', 'error'); return; }
    await withEnqueuing(async () => {
      setProgress({ current: 0, total: 0, detail: '正在加入队列...' });
      try { const r = await queueApi.enqueueSelected(selectedImages); clearSelectedImages(); addToast(`已加入队列：《${r.title}》`, 'success'); }
      catch (err: any) { addToast(err.message, 'error'); }
      setProgress(null);
    });
  }

  function handleSelectAllFiltered() {
    const allSelected = filteredIndices.every((i) => selectedPosts.has(i));
    if (allSelected) {
      filteredIndices.forEach((i) => { if (selectedPosts.has(i)) togglePostSelect(i); });
    } else {
      filteredIndices.forEach((i) => { if (!selectedPosts.has(i)) togglePostSelect(i); });
    }
  }

  function openPostLightbox(pi: number, ii: number) {
    const p = discoveryPosts[pi]; if (!p) return;
    openLightbox((p.local_images || p.images).map(imgSrc), ii);
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">图片发现</h1>
        <p className="text-sm text-text-secondary mt-1">从平台搜寻美图，AI 智能评分筛选</p>
      </div>

      {/* Search */}
      <div className="card space-y-4">
        <div className="section-header">搜索参数</div>
        <div className="grid grid-cols-2 gap-4">
          <label>内容平台
            <Select value={platform} onChange={handlePlatformChange} options={Object.values(platforms).map(p => ({ label: p.name, value: p.id }))} />
          </label>
          <label>抓取模式
            <Select value={mode} onChange={setMode} options={modeOptions} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label>处理条数<NumberInput value={limit} onChange={setLimit} min={1} max={20} /></label>
          <label>最少图片<NumberInput value={minImages} onChange={setMinImages} min={0} max={20} /></label>
        </div>
        {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed') && (
          <label>明星列表<input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} placeholder="迪丽热巴,杨幂（逗号分隔）" /></label>
        )}
        {platform === 'weibo' && mode === 'super_topic' && (
          <label>超话列表<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="迪丽热巴超话,杨幂超话（逗号分隔）" /></label>
        )}
        {platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed' || mode === 'keyword') && (
          <label>搜索标签<input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍,活动（逗号分隔）" /></label>
        )}
        {platform === 'toutiao' && mode === 'keyword' && (
          <label>搜索关键词<input type="text" value={toutiaoKeywords} onChange={e => setToutiaoKeywords(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" /></label>
        )}
        <div className="flex justify-start">
          <label className="toggle">
            <input type="checkbox" checked={filterWatermark} onChange={e => setFilterWatermark(e.target.checked)} />
            <span className="toggle-track" />
            <span className="toggle-label">下载时过滤疑似水印图片</span>
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
            {searching ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 搜索中</> : '开始搜索'}
          </button>
          <button className="btn" onClick={doDownloadSelected} disabled={!selectedPosts.size || downloading}>
            {downloading ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 下载中</> : <>下载选中{selectedPosts.size > 0 ? ` (${selectedPosts.size})` : ''}</>}
          </button>
          <button className="btn" onClick={() => doDownload(filteredIndices.join(','))} disabled={!filteredIndices.length || downloading}>
            {downloading ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 下载中</> : '全部下载'}
          </button>
          <button className="btn" onClick={doScore} disabled={!hasLocalAny || scoring}>
            {scoring ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" /> 评分中</> : 'AI 评分'}
          </button>
          <button className="btn btn-ghost" onClick={() => setClearConfirm(true)}>清除</button>
        </div>
      </div>

      {/* Tabbed posts + gallery */}
      {discoveryPosts.length > 0 && (
        <div className="card stagger">
          {/* Tab bar */}
          <div className="flex items-center gap-4 mb-4 border-b border-border pb-3">
            <button
              className={`section-header shrink-0 cursor-pointer transition-colors ${activeTab !== 'posts' ? 'text-text-muted hover:text-text' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              搜索结果
              <span className="text-xs ml-1 font-normal">({filteredIndices.length} 篇)</span>
            </button>
            {allLocalImages.length > 0 && (
              <button
                className={`section-header shrink-0 cursor-pointer transition-colors ${activeTab !== 'gallery' ? 'text-text-muted hover:text-text' : ''}`}
                onClick={() => setActiveTab('gallery')}
              >
                图片画廊
                <span className="text-xs ml-1 font-normal">({allLocalImages.length} 张)</span>
              </button>
            )}
          </div>

          {/* Posts tab */}
          {activeTab === 'posts' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                {allLocalImages.length > 0 && <span className="tag tag-accent">已下载 {allLocalImages.length} 张</span>}
                <button className="btn btn-xs ml-auto" onClick={handleSelectAllFiltered}>全选/取消</button>
              </div>
              {filteredIndices.length > 0 ? (
                <div className="space-y-3">
                  {filteredIndices.map((origIdx) => {
                    const p = discoveryPosts[origIdx];
                    const imgs = p.local_images || [];
                    const remoteImgs = p.images || [];
                    const displayImgs = imgs.length ? imgs : remoteImgs;
                    const isChecked = selectedPosts.has(origIdx);
                    return (
                      <div key={origIdx} className={`rounded-xl p-4 border transition-all ${isChecked ? 'bg-accent-soft border-accent' : 'bg-bg-card border-border hover:border-accent/30'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <input type="checkbox" checked={isChecked} onChange={() => togglePostSelect(origIdx)} className="w-4 h-4 accent-accent cursor-pointer rounded" />
                          <span className="text-sm font-semibold text-text">{p.celebrity}</span>
                          {p.screen_name && (
                            p.screen_name === p.celebrity
                              ? <span className="tag tag-accent text-[10px]">本人</span>
                              : <span className="tag text-[10px]">@{p.screen_name}</span>
                          )}
                          <span className="tag text-[10px]">{p.scene}</span>
                          <span className="text-xs text-text-muted">{remoteImgs.length} 张图{imgs.length ? ` · 已下载 ${imgs.length}` : ''}</span>
                          {p.created_at && <span className="text-xs text-text-muted">{fmtTime(p.created_at)}</span>}
                          <div className="ml-auto flex gap-1">
                            <button className="btn btn-xs btn-ghost" onClick={() => doDownload(String(origIdx))} disabled={downloading}>下载</button>
                            <button className="btn btn-xs btn-ghost text-text-muted hover:text-danger" onClick={() => setRemoveConfirmIndex(origIdx)}>删除</button>
                          </div>
                        </div>
                        {p.text && <div className="text-xs text-text-muted mb-3 line-clamp-2 leading-relaxed">{p.text.slice(0, 100)}</div>}
                        <div className="flex flex-wrap gap-2">
                          {displayImgs.slice(0, 12).map((img, ii) => (
                            <img key={ii} src={imgSrc(img)} alt="" className="w-[80px] h-[80px] object-cover rounded-xl border border-border cursor-pointer transition-all hover:border-accent hover:shadow-md hover:-translate-y-0.5" onClick={() => openPostLightbox(origIdx, ii)} onError={e => (e.currentTarget.style.display = 'none')} loading="lazy" />
                          ))}
                          {displayImgs.length > 12 && (
                            <div className="w-[80px] h-[80px] rounded-xl border border-border flex items-center justify-center text-xs text-text-muted bg-bg-secondary">+{displayImgs.length - 12}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-text-muted text-sm">没有图片数 ≥ {minImages} 的帖子</div>
              )}
              {/* Pagination */}
              {filteredIndices.length > 0 && (
                <div className="flex items-center justify-center gap-4 pt-4 border-t border-border mt-4">
                  <span className="text-sm text-text-muted">第 {currentPage} 页</span>
                  <button className="btn" onClick={loadMore} disabled={searching}>
                    {searching ? <Loading size="sm" inline text="加载中" /> : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Gallery tab */}
          {activeTab === 'gallery' && allLocalImages.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-text-muted">已选 <strong className="text-text tabular-nums">{selectedImages.length}</strong></span>
                {selectedImages.length > 0 && <button className="btn btn-primary btn-xs" onClick={enqueueSelected} disabled={enqueuing}>
                  {enqueuing ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 加入中</> : '加入发布队列'}
                </button>}
              </div>
              <div className="space-y-6">
                {galleryGroups.map((group) => {
                  const groupPaths = group.images.map(i => i.path);
                  const allSelected = groupPaths.every(p => selectedImages.includes(p));
                  return (
                    <div key={group.postIndex}>
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span className="text-sm font-semibold text-text truncate">{group.celebrity}</span>
                        <span className="text-xs text-text-muted shrink-0">· {group.scene}</span>
                        <span className="text-xs text-text-muted shrink-0">({group.images.length} 张)</span>
                        <button className="btn btn-xs ml-auto" onClick={() => selectAllImages(groupPaths)}>
                          {allSelected ? '取消' : '全选'}
                        </button>
                      </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                      {group.images.map((item) => {
                        const s = item.scoreInfo;
                        const scoreClass = s.score >= 70 ? 'score-high' : s.score >= 40 ? 'score-mid' : 'score-low';
                        const isSel = selectedImages.includes(item.path);
                        return (
                          <div key={item.path} className={`bg-bg-card border rounded-xl overflow-hidden transition-all ${isSel ? 'ring-2 ring-accent border-accent' : 'border-border hover:border-accent/50 hover:shadow-md'}`}>
                            <div className="relative">
                              <img src={imgSrc(item.path)} alt="" className="w-full h-[160px] object-cover cursor-pointer" onClick={() => { const paths = allLocalImages.map(x => imgSrc(x.path)); openLightbox(paths, allLocalImages.findIndex(x => x.path === item.path)); }} loading="lazy" />
                              <span className={`score-badge absolute top-2 left-2 ${scoreClass}`}>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                                {s.score}
                              </span>
                            </div>
                            <div className="px-2.5 py-2 flex items-center justify-between">
                              <span className="text-[10px] text-text-muted truncate max-w-[110px]">{s.reason}</span>
                              <input type="checkbox" checked={isSel} onChange={() => toggleImageSelect(item.path)} className="w-3.5 h-3.5 accent-accent rounded" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {discoveryPosts.length === 0 && (
        <div className="card">
          <div className="empty-state py-16">
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
