import { useEffect, useState } from 'react';
import { useStore } from '../stores';
import { discoveryApi, downloadStream, queueApi, selectionApi, settingsApi, searchStream } from '../api/client';
import Select from '../components/Select';
import NumberInput from '../components/NumberInput';
import SearchLoadingOverlay from '../components/SearchLoadingOverlay';

function formatWeiboTime(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
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
    setImageScores, toggleImageSelect, clearSelectedImages,
    openLightbox, addToast, setProgress,
  } = store;

  const [mode, setMode] = useState('celebrities');
  const [pages, setPages] = useState(2);
  const [limit, setLimit] = useState(5);
  const [celebs, setCelebs] = useState('');
  const [tags, setTags] = useState('');
  const [superTopics, setSuperTopics] = useState('');

  useEffect(() => {
    settingsApi.get().then((s) => {
      if (s.weibo_celebrities) setCelebs(s.weibo_celebrities);
      if (s.weibo_search_tags) setTags(s.weibo_search_tags);
      if (s.weibo_super_topics) setSuperTopics(s.weibo_super_topics);
      if (s.weibo_fetch_mode) setMode(s.weibo_fetch_mode);
      if (s.weibo_pages) setPages(s.weibo_pages);
      if (s.post_limit) setLimit(s.post_limit);
    }).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [filterWatermark, setFilterWatermark] = useState(false);
  const [watermarkedImages, setWatermarkedImages] = useState<Set<string>>(new Set());

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
    setSearching(true);
    setSearchMessage('正在搜索…');
    try {
      await searchStream({
        mode,
        celebrities: celebs.split(',').map((s) => s.trim()).filter(Boolean),
        search_tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
        super_topics: superTopics.split(',').map((s) => s.trim()).filter(Boolean),
        max_pages: pages,
        post_limit: limit,
      }, (evt) => {
        if (evt.type === 'progress') {
          setSearchMessage(evt.message!);
        } else if (evt.type === 'done') {
          discoveryApi.get().then((res) => {
            setDiscoveryPosts(res.posts);
          });
          clearSelectedPosts();
          setImageScores({});
          clearSelectedImages();
          addToast(`找到 ${evt.total_posts} 条帖子，${evt.total_images} 张图片`, 'success');
        } else if (evt.type === 'error') {
          addToast(evt.message || '搜索失败', 'error');
        }
      });
    } catch (err: any) { addToast(err.message, 'error'); }
    setSearching(false);
  }

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
          discoveryApi.get().then((r) => {
            setDiscoveryPosts(r.posts);
            const allPaths = r.posts.flatMap((p) => p.local_images || []);
            if (allPaths.length) {
              discoveryApi.checkWatermark(allPaths).then((res) => setWatermarkedImages(new Set(res.watermarked)));
            }
          });
          addToast(`下载完成！${evt.downloaded} 张成功${evt.dropped ? `，${evt.dropped} 张跳过` : ''}`, 'success');
        }
      }, filterWatermark);
    } catch (err: any) { addToast(err.message, 'error'); }
    setProgress(null);
  }

  async function doDownloadSelected() {
    if (!selectedPosts.size) { addToast('请先勾选要下载的帖子', 'error'); return; }
    const indices = [...selectedPosts];
    await doDownload(indices.join(','));
    clearSelectedPosts();
  }

  async function doScore() {
    setLoading(true);
    try {
      const res = await discoveryApi.score(true);
      setImageScores(res.scores);
      addToast(`评分完成！Vision: ${res.vision_count}，启发式: ${res.heuristic_count}`, 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
    setLoading(false);
  }

  async function removePost(index: number) {
    try {
      await discoveryApi.removePost(index);
      const next = [...discoveryPosts]; next.splice(index, 1);
      setDiscoveryPosts(next);
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  function clearDiscovery() {
    setDiscoveryPosts([]); clearSelectedPosts(); setImageScores({}); clearSelectedImages();
  }

  async function enqueueSelected() {
    if (!selectedImages.length) { addToast('请先选择图片', 'error'); return; }
    setProgress({ current: 0, total: 0, detail: '正在生成文案并加入队列...' });
    try {
      const res = await queueApi.enqueueSelected(selectedImages);
      clearSelectedImages();
      addToast(`已加入队列：《${res.title}》`, 'success');
    } catch (err: any) { addToast(err.message, 'error'); }
    setProgress(null);
  }

  function openPostLightbox(pi: number, ii: number) {
    const p = discoveryPosts[pi]; if (!p) return;
    openLightbox((p.local_images || p.images).map(imgSrc), ii);
  }

  function openGalleryLightbox(idx: number) {
    openLightbox(allLocalImages.map((i) => imgSrc(i.path)), idx);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">图片发现</h2>
        <p className="text-xs text-text-muted mt-0.5">从微博搜寻明星美图，AI 智能评分筛选</p>
      </div>

      {/* Search Params */}
      <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-xs font-medium text-text-muted">搜索参数</h3>
        <div className="grid grid-cols-3 gap-3">
          <label>抓取模式
            <Select value={mode} onChange={setMode} options={[
              { label: '明星列表', value: 'celebrities' },
              { label: '本人时间线', value: 'own' },
              { label: '混合模式', value: 'mixed' },
              { label: '超话抓取', value: 'super_topic' },
              { label: '关键词搜索', value: 'keyword' },
            ]} />
          </label>
          <label>抓取页数
            <NumberInput value={pages} onChange={setPages} min={1} max={5} />
          </label>
          <label>处理帖子数
            <NumberInput value={limit} onChange={setLimit} min={1} max={20} />
          </label>
        </div>
        {(mode === 'celebrities' || mode === 'mixed') && (
          <label>明星列表（逗号分隔）
            <input type="text" value={celebs} onChange={(e) => setCelebs(e.target.value)} />
          </label>
        )}
        {mode === 'super_topic' && (
          <label>超话列表（逗号分隔）
            <input type="text" value={superTopics} onChange={(e) => setSuperTopics(e.target.value)} placeholder="如：迪丽热巴超话,杨幂超话" />
          </label>
        )}
        {(mode === 'celebrities' || mode === 'mixed' || mode === 'keyword') && (
          <label>搜索标签（逗号分隔）
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
        )}
        <label className="flex-row items-center gap-2 w-fit">
          <input type="checkbox" checked={filterWatermark} onChange={(e) => setFilterWatermark(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
          <span className="text-[13px] font-normal text-text-secondary">下载时过滤疑似水印图片</span>
        </label>
        <div className="flex gap-2 flex-wrap pt-1">
          <button className="btn btn-primary" onClick={doSearch} disabled={loading}>开始搜索</button>
          <button className="btn" onClick={doDownloadSelected} disabled={!selectedPosts.size}>
            下载选中{selectedPosts.size > 0 ? `（${selectedPosts.size} 条）` : ''}
          </button>
          <button className="btn" onClick={() => doDownload('')} disabled={!discoveryPosts.length}>全部下载</button>
          <button className="btn" onClick={doScore} disabled={!hasLocal}>AI 评分</button>
          <button className="btn" onClick={clearDiscovery}>清除结果</button>
        </div>
      </div>

      {/* Post List */}
      {discoveryPosts.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-medium text-text-muted">
              搜索结果（{discoveryPosts.length} 条帖子，{discoveryPosts.reduce((s, p) => s + (p.images?.length || 0), 0)} 张图片）
            </h3>
            {hasLocal && <span className="text-[11px] text-emerald-600">✓ 已下载 {allLocalImages.length} 张</span>}
            <button className="btn btn-sm ml-auto" onClick={selectAllPosts}>全选/取消</button>
          </div>
          <div className="space-y-1.5">
            {discoveryPosts.map((p, pi) => {
              const imgs = p.local_images || [];
              const remoteImgs = p.images || [];
              const displayImgs = imgs.length ? imgs : remoteImgs;
              const isChecked = selectedPosts.has(pi);
              return (
                <div key={pi} className={`p-3 rounded-lg transition-colors ${isChecked ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-bg-secondary'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" checked={isChecked} onChange={() => togglePostSelect(pi)} className="w-4 h-4 accent-[var(--accent)] cursor-pointer" />
                    <span className="text-sm font-medium text-text">{p.celebrity}</span>
                    {p.screen_name && (
                      p.screen_name === p.celebrity
                        ? <span className="text-[11px] bg-accent-soft text-accent px-1.5 py-0.5 rounded-md font-medium">本人</span>
                        : <span className="text-[11px] bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded-md border border-border">@{p.screen_name}</span>
                    )}
                    <span className="text-[11px] bg-bg-secondary text-text-muted px-2 py-0.5 rounded-md border border-border">{p.scene}</span>
                    <span className="text-[11px] text-text-muted">
                      {remoteImgs.length} 张图{imgs.length ? ` · 已下载 ${imgs.length} 张` : ''}
                    </span>
                    {p.created_at && <span className="text-[11px] text-text-muted">{formatWeiboTime(p.created_at)}</span>}
                    <button className="btn btn-sm text-text-muted ml-auto" onClick={() => removePost(pi)}>删除</button>
                  </div>
                  {p.text && <div className="text-xs text-text-muted mb-2 line-clamp-2">{p.text.slice(0, 100)}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    {displayImgs.slice(0, 12).map((img, ii) => (
                      <img key={ii} src={imgSrc(img)} alt="" className="w-[80px] h-[80px] object-cover rounded-lg border border-border cursor-pointer hover:border-accent/50 transition-colors" onClick={() => openPostLightbox(pi, ii)} onError={(e) => (e.currentTarget.style.display = 'none')} loading="lazy" />
                    ))}
                    {displayImgs.length > 12 && (
                      <div className="w-[80px] h-[80px] rounded-lg border border-border flex items-center justify-center text-[11px] text-text-muted">+{displayImgs.length - 12}</div>
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
        <div className="bg-bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-medium text-text-muted">图片画廊</h3>
            <span className="text-[11px] text-text-muted ml-auto">已选 {selectedImages.length} 张</span>
            {selectedImages.length > 0 && <button className="btn btn-primary btn-sm" onClick={enqueueSelected}>加入发布队列</button>}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
            {allLocalImages.map((item, i) => {
              const s = item.scoreInfo;
              const scoreColor = s.score >= 70 ? 'text-emerald-600' : s.score >= 40 ? 'text-amber-600' : 'text-red-500';
              const isSel = selectedImages.includes(item.path);
              const isWm = watermarkedImages.has(item.path);
              return (
                <div key={item.path} className={`bg-bg border rounded-lg overflow-hidden transition-all hover:shadow-sm ${isSel ? 'ring-1 ring-accent border-accent' : 'border-border'}`}>
                  <div className="relative">
                    <img src={imgSrc(item.path)} alt="" className="w-full h-[180px] object-cover cursor-pointer" onClick={() => openGalleryLightbox(i)} loading="lazy" />
                    {isWm && <span className="absolute top-1.5 right-1.5 text-[10px] font-medium bg-amber-500/90 text-white px-1.5 py-0.5 rounded">疑似水印</span>}
                  </div>
                  <div className="px-2.5 py-2 flex items-center justify-between">
                    <div>
                      <span className={`text-[11px] font-medium ${scoreColor}`}>{s.score}</span>
                      <div className="text-[10px] text-text-muted truncate max-w-[100px]">{s.reason}</div>
                    </div>
                    <input type="checkbox" checked={isSel} onChange={() => toggleImageSelect(item.path)} className="w-3.5 h-3.5 accent-[var(--accent)]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {discoveryPosts.length === 0 && (
        <div className="text-center py-16 text-text-muted">
          <div className="text-3xl mb-2 opacity-40">🔍</div>
          <p className="text-sm">配置搜索参数后点击「开始搜索」</p>
        </div>
      )}

      {discoveryPosts.length > 0 && !hasLocal && (
        <div className="text-center py-4 text-text-muted text-xs">点击「下载图片」将远程图片保存到本地</div>
      )}

      {searching && <SearchLoadingOverlay message={searchMessage} />}
    </div>
  );
}
