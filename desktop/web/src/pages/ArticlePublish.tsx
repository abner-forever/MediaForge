import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../stores';
import { articleApi, queueApi } from '../api/client';
import type { ArticleItem, InspirationTopic, CoverImage } from '../api/client';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';

type TabKey = 'all' | 'draft' | 'queued' | 'published';
const TAB_LABELS: Record<TabKey, string> = { all: '全部', draft: '草稿', queued: '已排队', published: '已发布' };
const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  draft: { text: '草稿', cls: 'tag' },
  queued: { text: '已排队', cls: 'tag-accent' },
  published: { text: '已发布', cls: 'tag' },
};

export default function ArticlePublish() {
  const navigate = useNavigate();
  const { addToast, articles, setArticles, currentArticle, setCurrentArticle, articleFilter, setArticleFilter, inspirationResults, setInspirationResults, openLightbox } = useStore();

  /* ── 编辑器状态 ────────────────────────────── */
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [cover, setCover] = useState('');
  const [source, setSource] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  /* ── Loading 状态 ───────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [polishLoading, setPolishLoading] = useState(false);
  const [deAiLoading, setDeAiLoading] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  /* ── 确认对话框 ─────────────────────────────── */
  const [confirm, setConfirm] = useState<{ msg: string; onOk: () => void } | null>(null);

  /* ── 灵感关键词 ────────────────────────────── */
  const [inspirationKeyword, setInspirationKeyword] = useState('');

  /* ── 封面搜索 ────────────────────────────────── */
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [coverKeyword, setCoverKeyword] = useState('');
  const [coverResults, setCoverResults] = useState<CoverImage[]>([]);
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverDownloading, setCoverDownloading] = useState(false);

  /* ── 加载文章列表 ───────────────────────────── */
  const loadArticles = useCallback(async (filter?: TabKey) => {
    try {
      setLoading(true);
      const status = filter && filter !== 'all' ? filter : undefined;
      const res = await articleApi.list(status);
      setArticles(res.articles);
    } catch (e: any) {
      addToast(e.message || '加载文章失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, setArticles]);

  useEffect(() => {
    loadArticles(articleFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 选择文章到编辑器 ──────────────────────────── */
  const selectArticle = (a: ArticleItem) => {
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setCover(a.cover || '');
    setSource(a.source || '');
    setTagsText(a.tags?.join(', ') || '');
    setCurrentArticle(a);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── 重置编辑器 ──────────────────────────────── */
  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setCover('');
    setSource('');
    setTagsText('');
    setCurrentArticle(null);
    setShowCoverSearch(false);
    setCoverResults([]);
  };

  /* ── 搜索灵感 ────────────────────────────────── */
  const doInspiration = async () => {
    if (!inspirationKeyword.trim()) return;
    try {
      setInspirationLoading(true);
      const res = await articleApi.inspiration(inspirationKeyword.trim());
      setInspirationResults(res.topics);
      if (res.topics.length === 0) {
        addToast('未找到相关话题，换个关键词试试', 'info');
      }
    } catch (e: any) {
      addToast(e.message || '搜索灵感失败', 'error');
    } finally {
      setInspirationLoading(false);
    }
  };

  /* ── 点击灵感话题填入标题 ──────────────────── */
  const pickInspiration = (topic: InspirationTopic) => {
    setTitle(topic.text.slice(0, 64));
    setSource(topic.text);
    setInspirationResults([]);
    setInspirationKeyword('');
  };

  /* ── 封面图片 URL（本地路径 / 代理远程） ─────── */
  const coverImageUrl = (path: string, source?: string) => {
    if (source === 'web' || path.startsWith('http')) {
      return `/proxy?url=${encodeURIComponent(path)}`;
    }
    if (!path.startsWith('/')) {
      return `/images/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    }
    return `/images/${path}`;
  };

  /* ── 搜索配图 ────────────────────────────────── */
  const doCoverSearch = async (kw: string) => {
    if (!kw.trim()) {
      addToast('请输入关键词', 'info');
      return;
    }
    try {
      setCoverSearchLoading(true);
      const res = await articleApi.coverSearch(kw.trim());
      setCoverResults(res.images);
      if (res.images.length === 0) {
        addToast('未找到相关配图', 'info');
      }
    } catch (e: any) {
      addToast(e.message || '搜索配图失败', 'error');
    } finally {
      setCoverSearchLoading(false);
    }
  };

  /* ── 选择配图为封面 ──────────────────────────── */
  const selectCoverImage = async (img: CoverImage) => {
    if (img.source === 'local') {
      setCover(img.path);
      setShowCoverSearch(false);
      return;
    }
    // 网络图片需要先下载
    try {
      setCoverDownloading(true);
      addToast('正在下载封面图片…', 'info');
      const res = await articleApi.coverDownload(img.path);
      if (res.success && res.path) {
        setCover(res.path);
        setShowCoverSearch(false);
        addToast('封面已设置', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '下载封面失败', 'error');
    } finally {
      setCoverDownloading(false);
    }
  };

  const doSave = async () => {
    try {
      setSaveLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      const data = { title, content, cover, source, tags, status: 'draft' as const };
      if (editingId) {
        await articleApi.update(editingId, data);
        addToast('文章已更新', 'success');
      } else {
        await articleApi.create(data);
        addToast('草稿已保存', 'success');
        resetEditor();
      }
      loadArticles(articleFilter);
    } catch (e: any) {
      addToast(e.message || '保存失败', 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  /* ── 加入队列 ────────────────────────────────── */
  const doQueue = async () => {
    if (!editingId) {
      addToast('请先保存草稿再加入队列', 'info');
      return;
    }
    try {
      setQueueLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      await articleApi.update(editingId, { title, content, cover, source, tags });
      await articleApi.addToQueue(editingId);
      addToast('已加入发布队列', 'success');
      loadArticles(articleFilter);
    } catch (e: any) {
      addToast(e.message || '加入队列失败', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  /* ── 发布到公众号 ────────────────────────────── */
  const doPublish = async (saveDraft: boolean) => {
    if (!editingId) {
      addToast('请先保存草稿再发布', 'info');
      return;
    }
    try {
      setPublishLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      await articleApi.update(editingId, { title, content, cover, source, tags });
      const res = await articleApi.publish(editingId, { save_draft: saveDraft });
      addToast(res.message || (saveDraft ? '已保存为草稿' : '发布成功'), 'success');
      loadArticles(articleFilter);
    } catch (e: any) {
      addToast(e.message || '发布失败', 'error');
    } finally {
      setPublishLoading(false);
    }
  };

  /* ── 删除文章 ────────────────────────────────── */
  const doDelete = (id: string) => {
    setConfirm({
      msg: '确定删除此文章？',
      onOk: async () => {
        try {
          await articleApi.delete(id);
          addToast('已删除', 'success');
          if (editingId === id) resetEditor();
          loadArticles(articleFilter);
        } catch (e: any) {
          addToast(e.message || '删除失败', 'error');
        }
      },
    });
  };

  /* ── 确保文章已保存，未保存时自动创建 ──────────── */
  const ensureArticleSaved = async (): Promise<string | null> => {
    if (editingId) return editingId;
    if (!title && !content) {
      addToast('请先输入标题或正文', 'info');
      return null;
    }
    try {
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      const res = await articleApi.create({ title, content, cover, source, tags, status: 'draft' });
      setEditingId(res.article.id);
      setCurrentArticle(res.article);
      loadArticles(articleFilter);
      return res.article.id;
    } catch (e: any) {
      addToast(e.message || '自动保存失败', 'error');
      return null;
    }
  };

  /* ── AI 生成 ──────────────────────────────────── */
  const doGenerate = async () => {
    if (!title && !source) {
      addToast('请输入标题或灵感来源', 'info');
      return;
    }
    try {
      setGenLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.generate(id, { topic: source || title, title });
      if (res.content) {
        setContent(res.content);
        addToast('AI 生成完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || 'AI 生成失败', 'error');
    } finally {
      setGenLoading(false);
    }
  };

  /* ── AI 校对 ──────────────────────────────────── */
  const doPolish = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setPolishLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.polish(id);
      if (res.content) {
        setContent(res.content);
        addToast('校对完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '校对失败', 'error');
    } finally {
      setPolishLoading(false);
    }
  };

  /* ── 去 AI 味儿 ──────────────────────────────── */
  const doDeAi = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setDeAiLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.deAi(id);
      if (res.content) {
        setContent(res.content);
        addToast('去 AI 味儿完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '处理失败', 'error');
    } finally {
      setDeAiLoading(false);
    }
  };

  /* ── AI 生成标题 ──────────────────────────────── */
  const doGenerateTitle = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setTitleLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.generateTitle(id);
      if (res.title) {
        setTitle(res.title);
        addToast('标题已生成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '生成标题失败', 'error');
    } finally {
      setTitleLoading(false);
    }
  };

  /* ── 切换筛选 ────────────────────────────────── */
  const switchFilter = (tab: TabKey) => {
    setArticleFilter(tab);
    loadArticles(tab);
  };

  /* ── 格式化时间 ──────────────────────────────── */
  const fmtTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ── Render ──────────────────────────────────── */
  const hasContent = articles.length > 0 || inspirationResults.length > 0;

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="section-header">
        <div>
          <h1 className="text-xl font-bold">文章发布</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">AI 辅助创作，发布文章到公众号</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── 左栏：灵感 + 编辑器 ───────────────── */}
        <div className="xl:col-span-2 space-y-6">

          {/* 灵感探索 */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">灵感探索</h2>
              <span className="text-[11px] text-[var(--text-muted)]">从平台搜索热门话题</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="输入话题关键词，如「时尚」「科技」「旅行」…"
                value={inspirationKeyword}
                onChange={(e) => setInspirationKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doInspiration()}
              />
              <button className="btn btn-primary btn-sm" onClick={doInspiration} disabled={inspirationLoading}>
                {inspirationLoading ? <Loading size="sm" /> : '搜索灵感'}
              </button>
            </div>
            {inspirationResults.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {inspirationResults.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors group"
                    onClick={() => pickInspiration(t)}
                  >
                    <span className="text-xs text-[var(--text-muted)] mt-0.5 shrink-0">
                      {t.source === 'weibo' ? 'WB' : 'TT'}
                    </span>
                    <span className="text-sm text-[var(--text)] group-hover:text-[var(--accent)] line-clamp-2">{t.text}</span>
                    {t.celebrity && <span className="text-xs text-[var(--text-muted)] shrink-0 mt-0.5">{t.celebrity}</span>}
                  </div>
                ))}
              </div>
            )}
            {!inspirationLoading && inspirationResults.length === 0 && inspirationKeyword && (
              <p className="text-xs text-[var(--text-muted)]">未找到相关话题</p>
            )}
          </div>

          {/* 文章编辑 */}
          <div className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">文章编辑</h2>
              {editingId && (
                <button className="btn-ghost btn-xs text-[var(--text-muted)]" onClick={resetEditor}>
                  新建文章
                </button>
              )}
            </div>

            {/* 标题 */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">标题</label>
              <input
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="输入文章标题…"
                maxLength={64}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* 元信息行 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[280px]">
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  封面图片
                  {cover && <span className="text-[var(--text-muted)] ml-1">（已选择）</span>}
                </label>
                <div className="flex gap-3 items-start">
                  {cover && (
                    <div
                      className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-inset)] cursor-pointer group relative"
                      onClick={() => openLightbox([coverImageUrl(cover)], 0)}
                      title="点击查看大图"
                    >
                      <img
                        src={coverImageUrl(cover)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] min-w-0"
                        placeholder="图片路径，或搜索配图…"
                        value={cover}
                        onChange={(e) => setCover(e.target.value)}
                      />
                      <button
                        className="btn btn-sm shrink-0"
                        onClick={() => {
                          const kw = coverKeyword || title || source || '';
                          setCoverKeyword(kw);
                          setShowCoverSearch(!showCoverSearch);
                          if (!showCoverSearch) {
                            (kw.trim() ? doCoverSearch(kw) : setCoverResults([]));
                          }
                        }}
                      >
                        {coverDownloading ? <Loading size="sm" /> : '搜索配图'}
                      </button>
                    </div>

                    {/* 封面搜索面板 */}
                    {showCoverSearch && (
                      <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
                        <div className="flex gap-2">
                          <input
                            className="flex-1 px-3 py-1.5 rounded text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                            placeholder="输入关键词搜索配图…"
                            value={coverKeyword}
                            onChange={(e) => setCoverKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && doCoverSearch(coverKeyword)}
                            autoFocus
                          />
                          <button className="btn btn-sm" onClick={() => doCoverSearch(coverKeyword)} disabled={coverSearchLoading}>
                            {coverSearchLoading ? <Loading size="sm" /> : '搜索'}
                          </button>
                        </div>

                        {coverSearchLoading && (
                          <div className="flex justify-center py-6">
                            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                              <Loading size="sm" />
                              <span>正在搜索配图…</span>
                            </div>
                          </div>
                        )}

                        {!coverSearchLoading && coverResults.length > 0 && (
                          <div className="max-h-80 overflow-y-auto space-y-3">
                            {/* 本地素材 */}
                            {(() => {
                              const local = coverResults.filter(r => r.source === 'local');
                              if (local.length === 0) return null;
                              return (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">本地素材 ({local.length})</span>
                                  </div>
                                  <div className="grid grid-cols-5 gap-2">
                                    {local.map((img, i) => (
                                      <div
                                        key={`local-${i}`}
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors aspect-square bg-[var(--bg-inset)]"
                                        onClick={() => selectCoverImage(img)}
                                      >
                                        <img src={coverImageUrl(img.path, img.source)} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                        {img.celebrity && (
                                          <span className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] text-white bg-black/50 truncate leading-none">{img.celebrity}</span>
                                        )}
                                        <div className="absolute top-0.5 right-0.5 px-1 py-0.5 text-[8px] text-white bg-green-600/70 rounded leading-none font-medium opacity-0 group-hover:opacity-100 transition-opacity">选择</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 网络图片 */}
                            {(() => {
                              const web = coverResults.filter(r => r.source === 'web');
                              if (web.length === 0) return null;
                              return (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">网络图片 ({web.length})</span>
                                  </div>
                                  <div className="grid grid-cols-5 gap-2">
                                    {web.map((img, i) => (
                                      <div
                                        key={`web-${i}`}
                                        className="relative group cursor-pointer rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors aspect-square bg-[var(--bg-inset)]"
                                        onClick={() => selectCoverImage(img)}
                                      >
                                        <img src={coverImageUrl(img.path, img.source)} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                        <span className="absolute top-0.5 right-0.5 px-1 py-0.5 text-[8px] text-white bg-blue-500/70 rounded leading-none font-medium">WEB</span>
                                        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[9px] text-white bg-black/50 truncate leading-none opacity-0 group-hover:opacity-100 transition-opacity">点击选择</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {!coverSearchLoading && coverResults.length === 0 && (
                          <p className="text-xs text-[var(--text-muted)] text-center py-4">
                            {coverKeyword ? '未找到相关配图，换个关键词试试' : '输入关键词搜索配图'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">标签（逗号分隔）</label>
                <input
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="时尚, 穿搭, 街拍"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                />
              </div>
            </div>

            {/* 灵感来源 */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">灵感来源 / 话题（可选）</label>
              <input
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="输入话题，用于 AI 生成参考"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            {/* 正文 */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">正文</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-inset)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] resize-y"
                rows={12}
                placeholder="输入文章正文，或使用 AI 生成…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            {/* AI 工具栏 */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="btn btn-sm" onClick={doGenerate} disabled={genLoading}>
                {genLoading ? <Loading size="sm" /> : '✨ AI 生成'}
              </button>
              <button className="btn btn-sm" onClick={doPolish} disabled={polishLoading || !content}>
                {polishLoading ? <Loading size="sm" /> : '✓ AI 校对'}
              </button>
              <button className="btn btn-sm" onClick={doDeAi} disabled={deAiLoading || !content}>
                {deAiLoading ? <Loading size="sm" /> : '🔄 去 AI 味儿'}
              </button>
              <button className="btn btn-sm" onClick={doGenerateTitle} disabled={titleLoading || !content}>
                {titleLoading ? <Loading size="sm" /> : '🏷️ AI 生成标题'}
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-[var(--border)]">
              <button className="btn btn-primary btn-sm" onClick={doSave} disabled={saveLoading}>
                {saveLoading ? <Loading size="sm" /> : '💾 保存草稿'}
              </button>
              <button className="btn btn-sm" onClick={doQueue} disabled={queueLoading}>
                {queueLoading ? <Loading size="sm" /> : '📋 加入队列'}
              </button>
              <button className="btn btn-sm" onClick={() => setConfirm({
                msg: '确定发布此文章到公众号？',
                onOk: () => doPublish(false),
              })} disabled={publishLoading}>
                {publishLoading ? <Loading size="sm" /> : '📤 直接发布'}
              </button>
              <button className="btn btn-sm" onClick={() => setConfirm({
                msg: '保存为公众号草稿？',
                onOk: () => doPublish(true),
              })} disabled={publishLoading}>
                保存为公众号草稿
              </button>
            </div>
          </div>
        </div>

        {/* ── 右栏：文章列表 ───────────────────── */}
        <div className="xl:col-span-1">
          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold">文章列表</h2>

            {/* 筛选标签 */}
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
                <button
                  key={tab}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    articleFilter === tab
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                  onClick={() => switchFilter(tab)}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* 文章列表 */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {loading && articles.length === 0 && (
                <div className="flex justify-center py-8"><Loading /></div>
              )}
              {!loading && articles.length === 0 && (
                <div className="empty-state text-sm py-8">
                  <p className="text-[var(--text-muted)]">暂无文章</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">使用左侧编辑器开始创作</p>
                </div>
              )}
              {articles.map((a) => {
                const statusInfo = STATUS_LABELS[a.status] || STATUS_LABELS.draft;
                const isActive = editingId === a.id;
                return (
                  <div
                    key={a.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
                        : 'border-transparent hover:bg-[var(--bg-secondary)]'
                    }`}
                    onClick={() => selectArticle(a)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.title || '无标题'}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                          {a.summary || a.content?.slice(0, 60) || ''}
                        </p>
                      </div>
                      <span className={`${statusInfo.cls} text-[11px] shrink-0`}>{statusInfo.text}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-[var(--text-muted)]">{fmtTime(a.updated_at || a.created_at)}</span>
                      <button
                        className="text-[10px] text-[var(--danger)] opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); doDelete(a.id); }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={!!confirm}
        title="确认操作"
        message={confirm?.msg || ''}
        onConfirm={() => { confirm?.onOk(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
