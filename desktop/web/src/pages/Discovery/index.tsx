import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { discoveryApi, downloadStream, queueApi, settingsApi, searchStream, platformApi, PlatformMeta } from '../../api/client';
import SearchLoadingOverlay from '../../components/SearchLoadingOverlay';
import Dialog from '../../components/Dialog';
import HelpGuide from '../../components/ui/HelpGuide';
import { useLoading } from '../../hooks/useLoading';
import { imgSrc, thumbSrc, lightboxSrc } from './utils';
import SearchParams from './SearchParams';
import PostList from './PostList';
import GalleryTab from './GalleryTab';

export default function Discovery() {
  const {
    discoveryPosts, selectedPosts, imageScores, selectedImages,
    setDiscoveryPosts, togglePostSelect, clearSelectedPosts,
    setImageScores, toggleImageSelect, selectAllImages, clearSelectedImages,
    openLightbox, addToast, setProgress,
    recommendedCelebs, setRecommendedCelebs,
    discoveryCelebs: celebs, setDiscoveryCelebs: _setCelebs,
    discoveryTags: tags, setDiscoveryTags: _setTags,
    discoverySuperTopics: superTopics, setDiscoverySuperTopics: _setSuperTopics,
    discoveryToutiaoKeywords: toutiaoKeywords, setDiscoveryToutiaoKeywords: _setToutiaoKeywords,
  } = useStore(useShallow(s => ({
    discoveryPosts: s.discoveryPosts,
    selectedPosts: s.selectedPosts,
    imageScores: s.imageScores,
    selectedImages: s.selectedImages,
    setDiscoveryPosts: s.setDiscoveryPosts,
    togglePostSelect: s.togglePostSelect,
    clearSelectedPosts: s.clearSelectedPosts,
    setImageScores: s.setImageScores,
    toggleImageSelect: s.toggleImageSelect,
    selectAllImages: s.selectAllImages,
    clearSelectedImages: s.clearSelectedImages,
    openLightbox: s.openLightbox,
    addToast: s.addToast,
    setProgress: s.setProgress,
    recommendedCelebs: s.recommendedCelebs,
    setRecommendedCelebs: s.setRecommendedCelebs,
    discoveryCelebs: s.discoveryCelebs,
    setDiscoveryCelebs: s.setDiscoveryCelebs,
    discoveryTags: s.discoveryTags,
    setDiscoveryTags: s.setDiscoveryTags,
    discoverySuperTopics: s.discoverySuperTopics,
    setDiscoverySuperTopics: s.setDiscoverySuperTopics,
    discoveryToutiaoKeywords: s.discoveryToutiaoKeywords,
    setDiscoveryToutiaoKeywords: s.setDiscoveryToutiaoKeywords,
  })));

  const markEdited = useCallback(() => { userEditedRef.current = true; }, []);
  const setCelebs = useCallback((v: string) => { markEdited(); _setCelebs(v); }, [markEdited, _setCelebs]);
  const setTags = useCallback((v: string) => { markEdited(); _setTags(v); }, [markEdited, _setTags]);
  const setSuperTopics = useCallback((v: string) => { markEdited(); _setSuperTopics(v); }, [markEdited, _setSuperTopics]);
  const setToutiaoKeywords = useCallback((v: string) => { markEdited(); _setToutiaoKeywords(v); }, [markEdited, _setToutiaoKeywords]);

  const [platform, setPlatform] = useState('weibo');
  const [platforms, setPlatforms] = useState<Record<string, PlatformMeta>>({});
  const [mode, setMode] = useState('celebrities');
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [filterWatermark, setFilterWatermark] = useState(false);
  const [minImages, setMinImages] = useState(5);
  const [watermarkedImages, setWatermarkedImages] = useState<Set<string>>(new Set());
  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'gallery'>('posts');
  const [recommending, setRecommending] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const userEditedRef = useRef(false);

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
      if (!userEditedRef.current) {
        if (s.weibo_celebrities) setCelebs(s.weibo_celebrities);
        if (s.weibo_search_tags) setTags(s.weibo_search_tags);
        if (s.weibo_super_topics) setSuperTopics(s.weibo_super_topics);
        if (s.toutiao_search_tags) setToutiaoKeywords(s.toutiao_search_tags);
      }
      if (s.post_limit) setLimit(s.post_limit);
    }).catch(() => {});
  }, []);

  function handlePlatformChange(p: string) {
    setPlatform(p);
    const meta = platforms[p];
    if (meta) setMode(meta.default_fetch_mode);
    setCelebs(''); setTags(''); setSuperTopics(''); setToutiaoKeywords('');
    if (p === 'weibo') {
      settingsApi.get().then(s => { if (s.weibo_search_tags) setTags(s.weibo_search_tags); });
    } else if (p === 'toutiao') {
      settingsApi.get().then(s => { if (s.toutiao_search_tags) setToutiaoKeywords(s.toutiao_search_tags); });
    }
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

  async function doSearch(overrideCelebs?: string, overrides?: { tags?: string; superTopics?: string; toutiaoKeywords?: string }) {
    setSearching(true); setSearchMessage('正在搜索…');
    setCurrentPage(1);
    const ctrl = new AbortController(); searchAbortRef.current = ctrl;
    const celebsToUse = overrideCelebs ?? celebs;
    const tagsToUse = overrides?.tags ?? tags;
    const superTopicsToUse = overrides?.superTopics ?? superTopics;
    const toutiaoKeywordsToUse = overrides?.toutiaoKeywords ?? toutiaoKeywords;
    try {
      await searchStream({
        platform, mode,
        celebrities: celebsToUse.split(',').map(s => s.trim()).filter(Boolean),
        search_tags: platform === 'toutiao' ? toutiaoKeywordsToUse.split(',').map(s => s.trim()).filter(Boolean) : tagsToUse.split(',').map(s => s.trim()).filter(Boolean),
        super_topics: superTopicsToUse.split(',').map(s => s.trim()).filter(Boolean),
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

  function openPostLightboxPreview(pi: number, ii: number) {
    const p = discoveryPosts[pi]; if (!p) return;
    openLightbox((p.local_images || p.images).map(lightboxSrc), ii);
  }

  async function handleAiRecommend() {
    setRecommending(true);
    try {
      const res = await discoveryApi.trendingCelebrities();
      setRecommendedCelebs(res.celebrities);
      addToast(recommendedCelebs.length ? '已刷新推荐' : 'AI 已推荐热门女星，点击名字即可搜索', 'success');
    } catch (err: any) {
      addToast(err.message || '推荐失败', 'error');
    }
    setRecommending(false);
  }

  const hasContent = discoveryPosts.length > 0;

  return (
    <div className="py-6 px-4 max-w-[1280px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-text tracking-tight flex items-center gap-2.5">
            <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            图片发现
          </h1>
          <p className="text-sm text-text-muted mt-1">
            从各平台搜索美图，AI 智能评分筛选，一键下载并加入发布队列
          </p>
        </div>
        <HelpGuide title="图片发现 — 使用说明">
          <p><b>1. 选择平台与模式</b>：顶部选择内容来源（微博/头条等），以及搜索模式（按艺人、标签、关键词等）。</p>
          <p><b>2. 设置筛选条件</b>：输入艺人名或关键词，可设置页数和每页数量。开启「过滤水印」可自动跳过带水印的图片。</p>
          <p><b>3. 搜索与浏览</b>：点击「搜索」后结果以帖子卡片展示，可切换「帖子」和「图片墙」两种视图。</p>
          <p><b>4. 选择图片</b>：勾选帖子或单张图片，底部操作栏可一键「AI 评分」「下载到本地」「加入发布队列」。</p>
          <p><b>5. AI 评分</b>：对选中图片调用 Vision API 打分（0-100），按分数排序帮助筛选高质量图片。</p>
          <p><b>6. 快捷操作</b>：点击图片可放大预览，支持左右键翻页；长按帖子卡片可快速全选该帖所有图片。</p>
        </HelpGuide>
      </div>

      <SearchParams
        platform={platform} mode={mode} limit={limit} minImages={minImages}
        celebs={celebs} tags={tags} superTopics={superTopics} toutiaoKeywords={toutiaoKeywords}
        filterWatermark={filterWatermark} searching={searching}
        platforms={platforms} activePlatform={activePlatform} modeOptions={modeOptions}
        onPlatformChange={handlePlatformChange} onSearch={() => doSearch()}
        onDownloadSelected={doDownloadSelected} onDownloadAll={() => doDownload(filteredIndices.join(','))}
        onScore={doScore} onClear={() => setClearConfirm(true)}
        setMode={setMode} setLimit={setLimit} setMinImages={setMinImages}
        setCelebs={setCelebs} setTags={setTags} setSuperTopics={setSuperTopics}
        setToutiaoKeywords={setToutiaoKeywords} setFilterWatermark={setFilterWatermark}
        selectedPosts={selectedPosts} downloading={downloading} scoring={scoring}
        hasLocalAny={hasLocalAny} filteredIndices={filteredIndices}
        recommending={recommending} recommendedCelebs={recommendedCelebs}
        onAiRecommend={handleAiRecommend}
        onSearchCeleb={(name) => {
          if (platform === 'weibo' && (mode === 'celebrities' || mode === 'mixed')) {
            setCelebs(name); doSearch(name);
          } else if (mode === 'super_topic') {
            const topic = `${name}超话`;
            setSuperTopics(topic); doSearch(undefined, { superTopics: topic });
          } else if (mode === 'keyword') {
            if (platform === 'toutiao') {
              setToutiaoKeywords(name); doSearch(undefined, { toutiaoKeywords: name });
            } else {
              setTags(name); doSearch(undefined, { tags: name });
            }
          }
        }}
      />

      {/* 搜索结果区域 */}
      {hasContent && (
        <div className="card p-0 overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-border">
            <button
              className={`px-5 py-3 text-sm font-medium cursor-pointer transition-all relative ${
                activeTab === 'posts' ? 'text-accent' : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setActiveTab('posts')}
            >
              搜索结果
              <span className="text-xs ml-2 font-normal opacity-70">({filteredIndices.length} 篇)</span>
              {activeTab === 'posts' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
            </button>
            {allLocalImages.length > 0 && (
              <button
                className={`px-5 py-3 text-sm font-medium cursor-pointer transition-all relative ${
                  activeTab === 'gallery' ? 'text-accent' : 'text-text-muted hover:text-text'
                }`}
                onClick={() => setActiveTab('gallery')}
              >
                图片画廊
                <span className="text-xs ml-2 font-normal opacity-70">({allLocalImages.length} 张)</span>
                {activeTab === 'gallery' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
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
                onOpenLightbox={openPostLightboxPreview}
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
        </div>
      )}

      {/* 空状态 */}
      {!hasContent && (
        <div className="card border-2 border-dashed border-border/60">
          <div className="text-center py-14 px-8">
            <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center border border-accent/10">
              <svg className="w-10 h-10 text-accent/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-text mb-2">开始发现内容</h3>
            <p className="text-sm text-text-muted max-w-md mx-auto mb-8">
              配置搜索参数后点击「开始搜索」，从各平台发现图片内容
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto text-left">
              {[
                {
                  step: '1', title: '配置参数',
                  desc: '选择平台和搜索目标',
                  icon: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                    </svg>
                  ),
                },
                {
                  step: '2', title: '搜索与下载',
                  desc: '抓取帖子，下载图片',
                  icon: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                    </svg>
                  ),
                },
                {
                  step: '3', title: '评分与发布',
                  desc: 'AI 评分筛选，加入发布队列',
                  icon: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ),
                },
              ].map((item) => (
                <div key={item.step} className="bg-bg-secondary/50 rounded-xl p-4 border border-border/40 hover:border-accent/20 hover:bg-accent/5 transition-all duration-200">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3">{item.icon}</div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">{item.step}</span>
                    <span className="text-sm font-semibold text-text">{item.title}</span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {searching && <SearchLoadingOverlay message={searchMessage} platformName={activePlatform?.name} onCancel={cancelSearch} />}
      {enqueuing && <SearchLoadingOverlay title="正在加入发布队列" message={`已选 ${selectedImages.length} 张图片，正在处理…`} />}

      <Dialog open={removeConfirmIndex !== null} title="删除帖子" message={`确认删除第 ${removeConfirmIndex !== null ? removeConfirmIndex + 1 : ''} 条帖子？`} confirmText="删除" danger onConfirm={() => { if (removeConfirmIndex !== null) removePost(removeConfirmIndex); setRemoveConfirmIndex(null); }} onCancel={() => setRemoveConfirmIndex(null)} />
      <Dialog open={clearConfirm} title="清除搜索结果" message="确认清除所有搜索结果？" confirmText="清除" danger noLoading onConfirm={() => { setClearConfirm(false); clearDiscovery(); }} onCancel={() => setClearConfirm(false)} />
    </div>
  );
}
