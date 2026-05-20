import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../stores';
import { articleApi, queueApi } from '../../api/client';
import type { ArticleItem, InspirationTopic, CoverImage } from '../../api/client';
import Loading from '../../components/Loading';
import ConfirmDialog from '../../components/ConfirmDialog';
import RichTextEditor, { tiptapToPlain, plainToTiptap } from '../../components/RichTextEditor';
import AIToolbar from './AIToolbar';
import ArticleList from './ArticleList';
import CoverSection from './CoverSection';
import InspirationPanel from './InspirationPanel';
import { coverImageUrl, fmtTime } from './utils';
import type { TabKey } from './utils';

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

  const handleAddCover = () => {
    setShowCoverSearch(true);
    const kw = coverKeyword || title || source || '';
    setCoverKeyword(kw);
    if (kw.trim()) doCoverSearch(kw);
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

            {/* 灵感探索 */}
            <InspirationPanel
              inspirationExpanded={inspirationExpanded}
              inspirationKeyword={inspirationKeyword}
              inspirationResults={inspirationResults}
              inspirationLoading={inspirationLoading}
              onToggle={() => setInspirationExpanded(!inspirationExpanded)}
              onKeywordChange={(v) => setInspirationKeyword(v)}
              onSearch={doInspiration}
              onPickTopic={pickInspiration}
            />

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

            {/* 封面 */}
            <CoverSection
              cover={cover}
              coverKeyword={coverKeyword}
              coverResults={coverResults}
              coverLoading={coverLoading}
              coverSearchLoading={coverSearchLoading}
              showCoverSearch={showCoverSearch}
              onCoverImageUrl={coverImageUrl}
              onCoverSearch={doCoverSearch}
              onSelectCoverImage={selectCoverImage}
              onRemoveCover={() => { setCover(''); setShowCoverSearch(false); }}
              onToggleCoverSearch={() => setShowCoverSearch(true)}
              onCoverKeywordChange={(v) => setCoverKeyword(v)}
              onOpenLightbox={openLightbox}
              onCoverLoad={() => setCoverLoading(false)}
              onAddCover={handleAddCover}
            />

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

            {/* AI 工具栏 */}
            <AIToolbar
              onGenerate={doGenerate} onPolish={doPolish} onDeAi={doDeAi}
              onGenerateTitle={doGenerateTitle} onOptimizeLayout={doOptimizeLayout}
              genLoading={genLoading} polishLoading={polishLoading}
              deAiLoading={deAiLoading} titleLoading={titleLoading} layoutLoading={layoutLoading}
              content={content}
            />

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
          <ArticleList
            articles={articles}
            articleFilter={articleFilter}
            editingId={editingId}
            loading={loading}
            onSelectArticle={selectArticle}
            onSwitchFilter={switchFilter}
            onDelete={doDelete}
            articleListExpanded={articleListExpanded}
            onToggleExpanded={() => setArticleListExpanded(!articleListExpanded)}
          />
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
