import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../../stores';
import { discoveryApi, downloadStream, queueApi, settingsApi, searchStream, platformApi, PlatformMeta } from '../../api/client';
import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import SearchLoadingOverlay from '../../components/SearchLoadingOverlay';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useLoading } from '../../hooks/useLoading';
import { fmtTime, imgSrc, thumbSrc } from './utils';
import SearchParams from './SearchParams';
import PostList from './PostList';
import GalleryTab from './GalleryTab';

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

  const filteredIndices = useMemo(() =>
    discoveryPosts.reduce<number[]>((acc, p, i) => {
      if ((p.images?.length || 0) >= minImages) acc.push(i);
      return acc;
    }, []),
  [discoveryPosts, minImages]);

  const hasLocalAny = discoveryPosts.some((p) => p.local_images && p.local_images.length > 0);

  const allLocalImages = useMemo(() => {
    const result: { path: string; scoreInfo: { score: number; reason: string; method: string }; celebrity: string; scene: string; postIndex: number }[] = [];
    filteredIndices.forEach((origIdx) => {
      const p = discoveryPosts[origIdx];
      (p.local_images || []).forEach((img: string) => {
        const s = imageScores[img] || { score: 0, reason: '未评分', method: 'unknown' };
        result.push({ path: img, scoreInfo: s, celebrity: p.celebrity, scene: p.scene, postIndex: origIdx });
      });
    });
    result.sort((a, b) => b.scoreInfo.score - a.scoreInfo.score);
    return result;
  }, [filteredIndices, discoveryPosts, imageScores]);

  const galleryGroups = useMemo(() => {
    const groups: { postIndex: number; celebrity: string; scene: string; images: typeof allLocalImages }[] = [];
    const map = new Map<number, (typeof allLocalImages)[number][]>();
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
      setProgress({ current: 0, total: 0, detail: '正在加入发布队列...' });
      try { const r = await queueApi.enqueueSelected(selectedImages); clearSelectedImages(); addToast(`已加入发布队列：《${r.title}》`, 'success'); }
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

      <SearchParams
        platform={platform} mode={mode} limit={limit} minImages={minImages}
        celebs={celebs} tags={tags} superTopics={superTopics} toutiaoKeywords={toutiaoKeywords}
        filterWatermark={filterWatermark} searching={searching}
        platforms={platforms} activePlatform={activePlatform} modeOptions={modeOptions}
        onPlatformChange={handlePlatformChange} onSearch={doSearch}
        onDownloadSelected={doDownloadSelected} onDownloadAll={() => doDownload(filteredIndices.join(','))}
        onScore={doScore} onClear={() => setClearConfirm(true)}
        setMode={setMode} setLimit={setLimit} setMinImages={setMinImages}
        setCelebs={setCelebs} setTags={setTags} setSuperTopics={setSuperTopics}
        setToutiaoKeywords={setToutiaoKeywords} setFilterWatermark={setFilterWatermark}
        selectedPosts={selectedPosts} downloading={downloading} scoring={scoring}
        hasLocalAny={hasLocalAny} filteredIndices={filteredIndices}
      />

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

          {activeTab === 'posts' && (
            <PostList
              filteredIndices={filteredIndices}
              discoveryPosts={discoveryPosts}
              selectedPosts={selectedPosts}
              allLocalImages={allLocalImages}
              onTogglePostSelect={togglePostSelect}
              onHandleSelectAllFiltered={handleSelectAllFiltered}
              onDownload={doDownload}
              onRemovePost={removePost}
              setRemoveConfirmIndex={setRemoveConfirmIndex}
              onOpenLightbox={openPostLightbox}
              downloading={downloading}
              loadMore={loadMore}
              searching={searching}
              currentPage={currentPage}
              minImages={minImages}
              imgSrc={imgSrc}
              thumbSrc={thumbSrc}
            />
          )}

          {activeTab === 'gallery' && allLocalImages.length > 0 && (
            <GalleryTab
              allLocalImages={allLocalImages}
              galleryGroups={galleryGroups}
              selectedImages={selectedImages}
              onToggleImageSelect={toggleImageSelect}
              onSelectAllImages={selectAllImages}
              onEnqueueSelected={enqueueSelected}
              onOpenLightbox={openLightbox}
              enqueuing={enqueuing}
              imgSrc={imgSrc}
              thumbSrc={thumbSrc}
            />
          )}
        </div>
      )}

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
      <ConfirmDialog open={clearConfirm} title="清除搜索结果" message="确认清除所有搜索结果？" confirmText="清除" danger noLoading onConfirm={() => { setClearConfirm(false); clearDiscovery(); }} onCancel={() => setClearConfirm(false)} />
    </div>
  );
}
