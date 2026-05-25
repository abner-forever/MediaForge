import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../../stores';
import { articleApi, wechatAccountApi } from '../../api/client';
import type { ArticleItem, InspirationTopic, CoverImage, TitleCandidate, WeChatAccount } from '../../api/client';
import Loading from '../../components/Loading';
import ConfirmDialog from '../../components/ConfirmDialog';
import PublishConfirmModal from '../../components/PublishConfirmModal';
import EffectEntry from '../../components/EffectEntry';
import RichTextEditor, { tiptapToPlain, plainToTiptap } from '../../components/RichTextEditor';
import Select from '../../components/Select';
import AIToolbar from './AIToolbar';
import ArticleList from './ArticleList';
import CoverSection from './CoverSection';
import InspirationPanel from './InspirationPanel';
import { coverImageUrl, fmtTime } from './utils';
import type { TabKey } from './utils';

const ARTICLE_TEMPLATES = [
  { id: 'gallery', name: '图片合集模板', type: '图片合集', tone: '轻松、有画面感', wordCount: '300-500 字', subtitles: true, gallery: true, prompt: '开头点明主题，中段用 3-5 个小标题串联图片亮点，结尾引导读者收藏或留言。' },
  { id: 'celebrity', name: '明星动态模板', type: '明星动态', tone: '自然、克制、有资讯感', wordCount: '500-700 字', subtitles: true, gallery: true, prompt: '先交代人物和动态，再展开造型、现场氛围、粉丝关注点，避免夸张臆测。' },
  { id: 'outfit', name: '穿搭解析模板', type: '穿搭解析', tone: '专业但不端着', wordCount: '600-800 字', subtitles: true, gallery: true, prompt: '围绕单品、色彩、版型、适用场景做解析，给出可借鉴的穿搭建议。' },
  { id: 'daily', name: '今日精选模板', type: '今日精选', tone: '清爽、节奏快', wordCount: '400-600 字', subtitles: true, gallery: true, prompt: '用精选清单结构组织内容，每段聚焦一个看点，适合日更。' },
  { id: 'short', name: '简短图文模板', type: '简短图文', tone: '简洁、温柔', wordCount: '150-300 字', subtitles: false, gallery: true, prompt: '少铺垫，直接写图集看点和氛围，适合配图发布。' },
] as const;

export default function ArticlePublish() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [wechatAccounts, setWechatAccounts] = useState<WeChatAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [publishConfirm, setPublishConfirm] = useState<'draft' | 'publish' | null>(null);
  const [templateId, setTemplateId] = useState<(typeof ARTICLE_TEMPLATES)[number]['id']>('gallery');
  const [titleCandidates, setTitleCandidates] = useState<TitleCandidate[]>([]);
  const [titleCandidateLoading, setTitleCandidateLoading] = useState(false);

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

  // 回显：从队列编辑跳转时自动选中文章（仅首次）
  const initialAutoSelectDone = useRef(false);
  useEffect(() => {
    if (initialAutoSelectDone.current) return;
    const editId = searchParams.get('edit');
    if (!editId || articles.length === 0) return;
    const target = articles.find(a => a.id === editId);
    if (target) { selectArticle(target); initialAutoSelectDone.current = true; }
  }, [searchParams, articles]);

  useEffect(() => {
    wechatAccountApi.list().then(({ accounts }) => {
      setWechatAccounts(accounts);
      const def = accounts.find(a => a.is_default);
      if (def) setSelectedAccountId(def.account_id);
    }).catch(() => {});
  }, []);

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
      const res = await articleApi.publish(editingId, { save_draft: saveDraft, account_id: selectedAccountId || undefined });
      if (res.started) {
        addToast('发布任务已启动，正在等待后台处理...', 'info');
        // 轮询最多 5 分钟等待后台完成
        const action = saveDraft ? '保存草稿' : '发布';
        for (let i = 0; i < 150; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const art = await articleApi.get(editingId);
            const st = art.article.status;
            if (st === 'saved_to_wechat' || st === 'published') {
              addToast(`${action}成功`, 'success'); break;
            }
            if (st === 'failed') {
              addToast(art.article.error || '发布失败', 'error'); break;
            }
          } catch {}
        }
      } else {
        addToast(res.message || (saveDraft ? '已保存为草稿' : '发布成功'), 'success');
      }
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
      const tpl = ARTICLE_TEMPLATES.find(t => t.id === templateId) || ARTICLE_TEMPLATES[0];
      const res = await articleApi.generate(id, {
        topic: source || title,
        title,
        article_type: tpl.type,
        tone: tpl.tone,
        word_count: tpl.wordCount,
        with_subtitles: tpl.subtitles,
        gallery_friendly: tpl.gallery,
        template_prompt: tpl.prompt,
      });
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

  const doGenerateTitleCandidates = async () => {
    if (!content) { addToast('请先输入正文', 'info'); return; }
    try {
      setTitleCandidateLoading(true);
      const id = await ensureArticleSaved(); if (!id) return;
      const res = await articleApi.titleCandidates(id);
      setTitleCandidates(res.candidates || []);
      if (!res.candidates?.length) addToast('暂未生成标题候选', 'info');
    } catch (e: any) { addToast(e.message || '生成标题候选失败', 'error');
    } finally { setTitleCandidateLoading(false); }
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

            {/* 文章模板 */}
            <div className="rounded-xl border border-border bg-bg-card p-3" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 200 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                    文章模板
                  </label>
                  <Select
                    value={templateId}
                    onChange={(v) => setTemplateId(v as typeof templateId)}
                    options={ARTICLE_TEMPLATES.map(t => ({ label: t.name, value: t.id }))}
                  />
                </div>
                <div className="flex-1 min-w-[200px] flex items-start gap-2 rounded-lg bg-bg-secondary border border-border/50 px-3 py-2">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                  </svg>
                  <div>
                    <div className="text-[11px] font-medium text-text-muted mb-0.5">
                      {ARTICLE_TEMPLATES.find(t => t.id === templateId)?.type} · {ARTICLE_TEMPLATES.find(t => t.id === templateId)?.tone}
                    </div>
                    <div className="text-xs text-text-secondary leading-relaxed">
                      {ARTICLE_TEMPLATES.find(t => t.id === templateId)?.prompt}
                    </div>
                  </div>
                </div>
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

            <div className="flex gap-2 flex-wrap" style={{ marginBottom: titleCandidates.length ? 10 : 16 }}>
              <button className="btn btn-sm" onClick={doGenerateTitleCandidates} disabled={titleCandidateLoading || !content}>
                {titleCandidateLoading ? <Loading size="sm" /> : null} 标题多候选
              </button>
              {titleCandidates.map((candidate) => (
                <button
                  key={`${candidate.type}-${candidate.title}`}
                  className="btn btn-sm"
                  title={candidate.type}
                  onClick={() => { setTitle(candidate.title); addToast(`已使用${candidate.type}`, 'success'); }}
                >
                  <span className="text-text-muted">{candidate.type}</span>
                  {candidate.title}
                </button>
              ))}
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
        {wechatAccounts.length > 0 && (
          <div style={{ width: 190 }}>
            <Select
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              options={wechatAccounts.map(acc => ({
                label: `${acc.name}${acc.logged_in ? '' : ' (未登录)'}`,
                value: acc.account_id,
              }))}
              menuPosition="top"
            />
          </div>
        )}
        {currentArticle?.status === 'published' ? (
          <EffectEntry itemId={currentArticle.id} title={currentArticle.title} />
        ) : (
          <>
            <button className="btn btn-primary" onClick={doSave} disabled={saveLoading}>
              {saveLoading ? <Loading size="sm" /> : null} 保存草稿
            </button>
            <button className="btn" onClick={doQueue} disabled={queueLoading}>
              {queueLoading ? <Loading size="sm" /> : null} 加入队列
            </button>
            <button className="btn" onClick={() => setPublishConfirm('publish')} disabled={publishLoading}>
              {publishLoading ? <Loading size="sm" /> : null} 直接发布
            </button>
            <button className="btn btn-ghost" onClick={() => setPublishConfirm('draft')} disabled={publishLoading}>
              公众号草稿
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="确认操作"
        message={confirm?.msg || ''}
        onConfirm={() => { confirm?.onOk(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
      <PublishConfirmModal
        open={!!publishConfirm}
        action={publishConfirm || 'draft'}
        account={wechatAccounts.find(a => a.account_id === selectedAccountId) || null}
        title={title}
        content={content}
        cover={cover}
        images={Array.from(new Set([cover, ...(currentArticle?.images || [])].filter(Boolean)))}
        loading={publishLoading}
        onConfirm={() => {
          const action = publishConfirm;
          setPublishConfirm(null);
          doPublish(action !== 'publish');
        }}
        onCancel={() => setPublishConfirm(null)}
      />
    </div>
  );
}
