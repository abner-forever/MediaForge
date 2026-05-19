import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../stores';
import { articleApi, queueApi } from '../api/client';
import type { ArticleItem, InspirationTopic, CoverImage } from '../api/client';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';
import RichTextEditor, { tiptapToPlain, plainToTiptap } from '../components/RichTextEditor';

/* ── Types ──────────────────────────────────── */
type TabKey = 'all' | 'draft' | 'queued' | 'published';
const TAB_LABELS: Record<TabKey, string> = { all: '全部', draft: '草稿', queued: '已排队', published: '已发布' };
const STATUS_LABELS: Record<string, { text: string }> = {
  draft: { text: '草稿' },
  queued: { text: '已排队' },
  published: { text: '已发布' },
};

/* ── Sub-components ─────────────────────────── */

function FilterTab({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: active ? 500 : 400, lineHeight: 1.4,
        letterSpacing: '0.02em',
        borderRadius: 9999,
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        padding: '3px 10px',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {children}
    </button>
  );
}

/* ── Main Component ─────────────────────────── */

export default function ArticlePublish() {
  const navigate = useNavigate();
  const { addToast, articles, setArticles, currentArticle, setCurrentArticle, articleFilter, setArticleFilter, inspirationResults, setInspirationResults, openLightbox } = useStore();

  /* ── 编辑器状态 ────────────────────────────── */
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentDoc, setContentDoc] = useState<object>({ type: 'doc', content: [{ type: 'paragraph' }] });
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
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [inspirationLoading, setInspirationLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  /* ── 对话输入 ────────────────────────────────── */
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  /* ── UI 状态 ────────────────────────────────── */
  const [confirm, setConfirm] = useState<{ msg: string; onOk: () => void } | null>(null);
  const [inspirationKeyword, setInspirationKeyword] = useState('');
  const [inspirationExpanded, setInspirationExpanded] = useState(false);
  const [articleListExpanded, setArticleListExpanded] = useState(true);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [coverKeyword, setCoverKeyword] = useState('');
  const [coverResults, setCoverResults] = useState<CoverImage[]>([]);
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverDownloading, setCoverDownloading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);

  /* ── 加载文章列表 ───────────────────────────── */
  const loadArticles = useCallback(async (filter?: TabKey) => {
    try {
      setLoading(true);
      const status = filter && filter !== 'all' ? filter : undefined;
      const res = await articleApi.list(status);
      setArticles(res.articles);
    } catch (e: any) {
      addToast(e.message || '加载文章失败', 'error');
    } finally { setLoading(false); }
  }, [addToast, setArticles]);

  useEffect(() => { loadArticles(articleFilter); }, []); // eslint-disable-line

  const selectArticle = (a: ArticleItem) => {
    setEditingId(a.id); setTitle(a.title); setContent(a.content);
    setContentDoc(plainToTiptap(a.content));
    setCover(a.cover || ''); setSource(a.source || '');
    setTagsText(a.tags?.join(', ') || ''); setCurrentArticle(a);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetEditor = () => {
    setEditingId(null); setTitle(''); setContent(''); setContentDoc({ type: 'doc', content: [{ type: 'paragraph' }] }); setCover('');
    setSource(''); setTagsText(''); setCurrentArticle(null);
    setShowCoverSearch(false); setCoverResults([]);
    setInspirationExpanded(false);
  };

  const doInspiration = async () => {
    if (!inspirationKeyword.trim()) return;
    try {
      setInspirationLoading(true);
      const res = await articleApi.inspiration(inspirationKeyword.trim());
      setInspirationResults(res.topics);
      if (res.topics.length === 0) addToast('未找到相关话题，换个关键词试试', 'info');
    } catch (e: any) { addToast(e.message || '搜索灵感失败', 'error');
    } finally { setInspirationLoading(false); }
  };

  const pickInspiration = (topic: InspirationTopic) => {
    setTitle(topic.text.slice(0, 128)); setSource(topic.text);
    setInspirationResults([]); setInspirationKeyword('');
  };

  const coverImageUrl = (path: string, source?: string) => {
    if (source === 'web' || path.startsWith('http')) return `/proxy?url=${encodeURIComponent(path)}`;
    if (!path.startsWith('/')) return `/images/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    return `/images/${path}`;
  };

  const doCoverSearch = async (kw: string) => {
    if (!kw.trim()) { addToast('请输入关键词', 'info'); return; }
    try {
      setCoverSearchLoading(true);
      const res = await articleApi.coverSearch(kw.trim());
      setCoverResults(res.images);
      if (res.images.length === 0) addToast('未找到相关配图', 'info');
    } catch (e: any) { addToast(e.message || '搜索配图失败', 'error');
    } finally { setCoverSearchLoading(false); }
  };

  const selectCoverImage = async (img: CoverImage) => {
    if (img.source === 'local') { setCover(img.path); setShowCoverSearch(false); setCoverLoading(true); return; }
    try {
      setCoverDownloading(true);
      addToast('正在下载封面图片…', 'info');
      const res = await articleApi.coverDownload(img.path);
      if (res.success && res.path) { setCover(res.path); setShowCoverSearch(false); setCoverLoading(true); addToast('封面已设置', 'success'); }
    } catch (e: any) { addToast(e.message || '下载封面失败', 'error');
    } finally { setCoverDownloading(false); }
  };

  const doSave = async () => {
    try {
      setSaveLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      const data = { title, content, cover, source, tags, status: 'draft' as const };
      if (editingId) { await articleApi.update(editingId, data); addToast('文章已更新', 'success'); }
      else { await articleApi.create(data); addToast('草稿已保存', 'success'); resetEditor(); }
      loadArticles(articleFilter);
    } catch (e: any) { addToast(e.message || '保存失败', 'error');
    } finally { setSaveLoading(false); }
  };

  const doQueue = async () => {
    if (!editingId) { addToast('请先保存草稿再加入队列', 'info'); return; }
    try {
      setQueueLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      await articleApi.update(editingId, { title, content, cover, source, tags });
      await articleApi.addToQueue(editingId);
      addToast('已加入发布队列', 'success');
      loadArticles(articleFilter);
    } catch (e: any) { addToast(e.message || '加入队列失败', 'error');
    } finally { setQueueLoading(false); }
  };

  const doPublish = async (saveDraft: boolean) => {
    if (!editingId) { addToast('请先保存草稿再发布', 'info'); return; }
    try {
      setPublishLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      await articleApi.update(editingId, { title, content, cover, source, tags });
      const res = await articleApi.publish(editingId, { save_draft: saveDraft });
      addToast(res.message || (saveDraft ? '已保存为草稿' : '发布成功'), 'success');
      loadArticles(articleFilter);
    } catch (e: any) { addToast(e.message || '发布失败', 'error');
    } finally { setPublishLoading(false); }
  };

  const doDelete = (id: string) => {
    setConfirm({
      msg: '确定删除此文章？',
      onOk: async () => {
        try { await articleApi.delete(id); addToast('已删除', 'success'); if (editingId === id) resetEditor(); loadArticles(articleFilter); }
        catch (e: any) { addToast(e.message || '删除失败', 'error'); }
      },
    });
  };

  const ensureArticleSaved = async (): Promise<string | null> => {
    if (editingId) return editingId;
    if (!title && !content) { addToast('请先输入标题或正文', 'info'); return null; }
    try {
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      const res = await articleApi.create({ title, content, cover, source, tags, status: 'draft' });
      setEditingId(res.article.id); setCurrentArticle(res.article);
      loadArticles(articleFilter); return res.article.id;
    } catch (e: any) { addToast(e.message || '自动保存失败', 'error'); return null; }
  };

  const doGenerate = async () => {
    if (!title && !source) { addToast('请输入标题或灵感来源', 'info'); return; }
    try {
      setGenLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.generate(id, { topic: source || title, title });
      if (res.content) { setContent(res.content); setContentDoc(plainToTiptap(res.content)); addToast('AI 生成完成', 'success'); }
    } catch (e: any) { addToast(e.message || 'AI 生成失败', 'error');
    } finally { setGenLoading(false); }
  };

  const doPolish = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setPolishLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.polish(id);
      if (res.content) { setContent(res.content); setContentDoc(plainToTiptap(res.content)); addToast('校对完成', 'success'); }
    } catch (e: any) { addToast(e.message || '校对失败', 'error');
    } finally { setPolishLoading(false); }
  };

  const doDeAi = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setDeAiLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.deAi(id);
      if (res.content) { setContent(res.content); setContentDoc(plainToTiptap(res.content)); addToast('去 AI 味儿完成', 'success'); }
    } catch (e: any) { addToast(e.message || '处理失败', 'error');
    } finally { setDeAiLoading(false); }
  };

  const doGenerateTitle = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setTitleLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.generateTitle(id);
      if (res.title) { setTitle(res.title); addToast('标题已生成', 'success'); }
    } catch (e: any) { addToast(e.message || '生成标题失败', 'error');
    } finally { setTitleLoading(false); }
  };

  const doOptimizeLayout = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setLayoutLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.optimizeLayout(id);
      if (res.content) { setContent(res.content); setContentDoc(plainToTiptap(res.content)); addToast('排版优化完成', 'success'); }
    } catch (e: any) { addToast(e.message || '优化排版失败', 'error');
    } finally { setLayoutLoading(false); }
  };

  const doChat = async () => {
    const instruction = chatInput.trim();
    if (!instruction) return;
    try {
      setChatLoading(true);
      setChatInput('');
      const id = await ensureArticleSaved();
      if (!id) { setChatLoading(false); return; }
      const res = await articleApi.chat(id, instruction);
      if (res.content) { setContent(res.content); setContentDoc(plainToTiptap(res.content)); addToast('处理完成', 'success'); }
    } catch (e: any) { addToast(e.message || '处理失败', 'error');
    } finally { setChatLoading(false); }
  };

  const switchFilter = (tab: TabKey) => { setArticleFilter(tab); loadArticles(tab); };

  const fmtTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ── Render ────────────────────────────────── */
  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.3px', color: 'var(--text)', margin: 0 }}>
          新建文章
        </h1>
      </div>

      {/* 70/30 Grid */}
      <div className="grid grid-cols-1 gap-6" style={{
        gridTemplateColumns: `1fr ${articleListExpanded ? '320px' : '0px'}`,
        transition: 'grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* ── 左栏：编辑器 ─────────────────────── */}
        <div>
          <div style={{ paddingBottom: 40 }}>
            {/* 新建按钮 */}
            {editingId && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button onClick={resetEditor} style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-softer)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  ＋ 新建文章
                </button>
              </div>
            )}

            {/* 灵感探索 — 内联折叠 */}
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setInspirationExpanded(!inspirationExpanded)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6,
                  background: inspirationExpanded ? 'var(--accent-softer)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { if (!inspirationExpanded) { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}}
                onMouseLeave={(e) => { if (!inspirationExpanded) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ transform: inspirationExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="m9 18 6-6-6-6"/>
                </svg>
                灵感探索
                {!inspirationExpanded && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>搜索热点话题填入标题与来源</span>}
              </button>
              {inspirationExpanded && (
                <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      placeholder="输入话题关键词…"
                      value={inspirationKeyword}
                      onChange={(e) => setInspirationKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && doInspiration()}
                      style={{ flex: 1, padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                    <button className="btn btn-sm" onClick={doInspiration} disabled={inspirationLoading}>
                      {inspirationLoading ? <Loading size="sm" /> : '搜索'}
                    </button>
                  </div>
                  {inspirationResults.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {inspirationResults.map((t, i) => (
                        <div key={i} onClick={() => pickInspiration(t)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                          color: 'var(--text)', fontSize: 13, transition: 'background 0.15s',
                        }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-softer)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }}>{t.source === 'weibo' ? 'WB' : 'TT'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.text}</span>
                          {t.celebrity && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{t.celebrity}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {!inspirationLoading && inspirationResults.length === 0 && inspirationKeyword && (
                    <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>未找到相关话题</p>
                  )}
                </div>
              )}
            </div>

            {/* 标题 */}
            <div style={{ marginBottom: 16 }}>
              <input
                placeholder="无标题"
                maxLength={128}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                  color: 'var(--text)',
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* 封面 — 折叠式 */}
            <div style={{ marginBottom: 16 }}>
              {cover ? (
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <img
                    key={cover}
                    src={coverImageUrl(cover)}
                    style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', display: coverLoading ? 'none' : 'block' }}
                    onClick={() => openLightbox([coverImageUrl(cover)], 0)}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; setCoverLoading(false); }}
                    onLoad={() => setCoverLoading(false)}
                  />
                  {coverLoading && (
                    <div style={{ width: '100%', height: 160, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Loading size="sm" />
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>正在加载封面…</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setShowCoverSearch(true)}
                      className="btn btn-sm"
                      style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                    >
                      更换
                    </button>
                    <button
                      onClick={() => { setCover(''); setShowCoverSearch(false); }}
                      className="btn btn-sm"
                      style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowCoverSearch(true);
                    const kw = coverKeyword || title || source || '';
                    setCoverKeyword(kw);
                    if (kw.trim()) doCoverSearch(kw);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 6,
                    background: 'transparent', border: '1px dashed var(--border)',
                    cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  添加封面
                </button>
              )}

              {showCoverSearch && (
                <div style={{ marginTop: 12, padding: 16, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      placeholder="输入关键词搜索配图…"
                      value={coverKeyword}
                      onChange={(e) => setCoverKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && doCoverSearch(coverKeyword)}
                      autoFocus
                      style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                    />
                    <button className="btn btn-sm" onClick={() => doCoverSearch(coverKeyword)} disabled={coverSearchLoading}>
                      {coverSearchLoading ? <Loading size="sm" /> : '搜索'}
                    </button>
                  </div>
                  {coverSearchLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                        <Loading size="sm" /><span>正在搜索配图…</span>
                      </div>
                    </div>
                  )}
                  {!coverSearchLoading && coverResults.length > 0 && (
                    <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(() => {
                        const local = coverResults.filter(r => r.source === 'local');
                        const web = coverResults.filter(r => r.source === 'web');
                        return (<>
                          {local.length > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>本地素材 ({local.length})</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                                {local.map((img, i) => (
                                  <div key={`local-${i}`} onClick={() => selectCoverImage(img)} style={{ position: 'relative', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1/1', background: 'var(--bg-inset)', transition: 'border-color 0.15s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                                    <img src={coverImageUrl(img.path, img.source)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    {img.celebrity && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.celebrity}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {web.length > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>网络图片 ({web.length})</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                                {web.map((img, i) => (
                                  <div key={`web-${i}`} onClick={() => selectCoverImage(img)} style={{ position: 'relative', cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1/1', background: 'var(--bg-inset)', transition: 'border-color 0.15s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                                    <img src={coverImageUrl(img.path, img.source)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    <span style={{ position: 'absolute', top: 2, right: 2, padding: '2px 4px', fontSize: 8, color: '#fff', background: 'rgba(94,106,210,0.7)', borderRadius: 4 }}>WEB</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>);
                      })()}
                    </div>
                  )}
                  {!coverSearchLoading && coverResults.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                      {coverKeyword ? '未找到相关配图，换个关键词试试' : '输入关键词搜索配图'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 标签 + 来源 — 并排 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                  标签
                </label>
                <input
                  placeholder="时尚, 穿搭, 街拍"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                  话题来源
                </label>
                <input
                  placeholder="可选，用于 AI 生成参考"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  style={{ fontSize: 14 }}
                />
              </div>
            </div>

            {/* AI 工具栏 — 增强展示 */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              padding: '8px 0', marginBottom: 12,
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <button onClick={doGenerate} disabled={genLoading} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                border: '1px solid var(--accent-soft)', borderRadius: 6,
                background: 'var(--accent-softer)', color: 'var(--accent)',
                cursor: genLoading ? 'not-allowed' : 'pointer', opacity: genLoading ? 0.5 : 1,
                transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { if (!genLoading) { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}}
                onMouseLeave={(e) => { if (!genLoading) { e.currentTarget.style.background = 'var(--accent-softer)'; e.currentTarget.style.borderColor = 'var(--accent-soft)'; }}}
              >
                {genLoading ? <Loading size="sm" /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/></svg>}
                生成正文
              </button>
              <button onClick={doPolish} disabled={polishLoading || !content} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: (polishLoading || !content) ? 'not-allowed' : 'pointer',
                opacity: (polishLoading || !content) ? 0.4 : 1,
                transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { if (!polishLoading && content) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-softer)'; }}}
                onMouseLeave={(e) => { if (!polishLoading && content) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}}
              >
                {polishLoading ? <Loading size="sm" /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
                AI 校对
              </button>
              <button onClick={doDeAi} disabled={deAiLoading || !content} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: (deAiLoading || !content) ? 'not-allowed' : 'pointer',
                opacity: (deAiLoading || !content) ? 0.4 : 1,
                transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { if (!deAiLoading && content) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-softer)'; }}}
                onMouseLeave={(e) => { if (!deAiLoading && content) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}}
              >
                {deAiLoading ? <Loading size="sm" /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M2 12a10 10 0 0 1 10-10"/><path d="M12 12 8 8"/><path d="M16 16 9 9"/></svg>}
                去 AI 味儿
              </button>
              <button onClick={doGenerateTitle} disabled={titleLoading || !content} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 12, fontWeight: 500, lineHeight: 1.3,
                border: '1px solid var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: (titleLoading || !content) ? 'not-allowed' : 'pointer',
                opacity: (titleLoading || !content) ? 0.4 : 1,
                transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { if (!titleLoading && content) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-softer)'; }}}
                onMouseLeave={(e) => { if (!titleLoading && content) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}}
              >
                {titleLoading ? <Loading size="sm" /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>}
                生成标题
              </button>
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px', alignSelf: 'center' }} />
              <button onClick={doOptimizeLayout} disabled={layoutLoading || !content} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', fontSize: 12, fontWeight: 600, lineHeight: 1.3,
                border: '1px solid var(--accent)', borderRadius: 6,
                background: 'var(--accent-softer)', color: 'var(--accent)',
                cursor: (layoutLoading || !content) ? 'not-allowed' : 'pointer',
                opacity: (layoutLoading || !content) ? 0.5 : 1,
                transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
                onMouseEnter={(e) => { if (!layoutLoading && content) { e.currentTarget.style.background = 'var(--accent-soft)'; }}}
                onMouseLeave={(e) => { if (!layoutLoading && content) { e.currentTarget.style.background = 'var(--accent-softer)'; }}}
              >
                {layoutLoading ? <Loading size="sm" /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v4H3z"/><path d="M3 10h18v4H3z"/><path d="M3 17h12v4H3z"/></svg>}
                优化排版
              </button>
            </div>

            {/* 对话输入 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                placeholder="输入指令修改正文，如「缩短到300字」「改成正式风格」…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doChat(); } }}
                style={{ flex: 1, fontSize: 14 }}
              />
              <button className="btn btn-sm" onClick={doChat} disabled={chatLoading || !chatInput.trim()}
                style={{ flexShrink: 0 }}>
                {chatLoading ? <Loading size="sm" /> : '发送'}
              </button>
            </div>

            {/* 正文 — 富文本编辑器 */}
            <div style={{ marginBottom: 8 }}>
              <RichTextEditor
                value={contentDoc}
                onChange={(doc) => {
                  setContentDoc(doc);
                  setContent(tiptapToPlain(doc));
                }}
                placeholder="开始写作…"
                minHeight={480}
              />
            </div>
          </div>
        </div>

        {/* ── 右栏：文章列表 ── */}
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <div style={{
            width: 320,
            opacity: articleListExpanded ? 1 : 0,
            transition: 'opacity 0.25s ease',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>

          {/* 文章列表 — 紧凑 */}
          <div className="card" style={{ padding: 16 }}>
            <div
              onClick={() => setArticleListExpanded(!articleListExpanded)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 12 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <path d="m9 18 6-6-6-6"/>
                </svg>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  文章列表
                </h2>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{articles.length} 篇</span>
            </div>

            {/* 筛选标签 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
                <FilterTab key={tab} active={articleFilter === tab} onClick={() => switchFilter(tab)}>
                  {TAB_LABELS[tab]}
                </FilterTab>
              ))}
            </div>

            {/* 文章列表 */}
            <div style={{ maxHeight: 'calc(100vh - 440px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {loading && articles.length === 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Loading /></div>
              )}
              {!loading && articles.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>暂无文章</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>在左侧编辑器中开始创作</p>
                </div>
              )}
              {articles.map((a) => {
                const statusInfo = STATUS_LABELS[a.status] || STATUS_LABELS.draft;
                const isActive = editingId === a.id;
                return (
                  <div key={a.id} onClick={() => selectArticle(a)} style={{
                    padding: 8, borderRadius: 6, cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    background: isActive ? 'var(--accent-softer)' : 'transparent',
                  }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.title || '无标题'}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.summary || a.content?.slice(0, 60) || ''}
                        </p>
                      </div>
                      <span style={{ fontSize: 11, color: a.status === 'queued' ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {statusInfo.text}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(a.updated_at || a.created_at)}</span>
                      <button onClick={(e) => { e.stopPropagation(); doDelete(a.id); }} style={{
                        fontSize: 10, color: '#e5484d', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0, transition: 'opacity 0.15s',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
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
      </div>

      {/* 折叠状态下的展开按钮 */}
      <button
        onClick={() => setArticleListExpanded(true)}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          zIndex: 50,
          width: 28,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--accent)',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          color: '#fff',
          cursor: 'pointer',
          opacity: articleListExpanded ? 0 : 0.9,
          boxShadow: articleListExpanded ? 'none' : '-2px 0 8px rgba(0,0,0,0.12)',
          transform: `translateY(-50%) translateX(${articleListExpanded ? '16px' : '0'})`,
          pointerEvents: articleListExpanded ? 'none' : 'auto',
          transition: 'opacity 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
        }}
        onMouseEnter={(e) => {
          if (articleListExpanded) return;
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.boxShadow = '-2px 0 12px rgba(0,0,0,0.2)';
        }}
        onMouseLeave={(e) => {
          if (articleListExpanded) return;
          e.currentTarget.style.opacity = '0.9';
          e.currentTarget.style.boxShadow = '-2px 0 8px rgba(0,0,0,0.12)';
        }}
        title="展开文章列表"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>

      {/* 操作栏 — 底部固定 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        padding: '12px 0',
        borderTop: '1px solid var(--border-subtle)',
        position: 'sticky', bottom: 0,
        background: 'var(--bg)',
        zIndex: 10,
      }}>
        <button className="btn btn-primary" onClick={doSave} disabled={saveLoading}>
          {saveLoading ? <Loading size="sm" /> : null} 保存草稿
        </button>
        <button className="btn" onClick={doQueue} disabled={queueLoading}>
          {queueLoading ? <Loading size="sm" /> : null} 加入队列
        </button>
        <button className="btn" onClick={() => setConfirm({ msg: '确定发布此文章到公众号？', onOk: () => doPublish(false) })} disabled={publishLoading}>
          {publishLoading ? <Loading size="sm" /> : null} 直接发布
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirm({ msg: '保存为公众号草稿？', onOk: () => doPublish(true) })}>
          公众号草稿
        </button>
      </div>

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
