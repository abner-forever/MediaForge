import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import { articleApi, wechatAccountApi } from '../../api/client';
import type {
  ArticleItem,
  ChatMessage,
  InspirationTopic,
  CoverImage,
  TitleCandidate,
  WeChatAccount,
} from '../../api/client';
import Loading from '../../components/Loading';
import Dialog from '../../components/Dialog';
import PublishConfirmModal from '../../components/PublishConfirmModal';
import EffectEntry from '../../components/EffectEntry';
import { tiptapToPlain, plainToTiptap } from '../../components/feature/RichTextEditor/utils';
const RichTextEditor = lazy(() => import('../../components/feature/RichTextEditor'));
import Select from '../../components/Select';
import Drawer from '../../components/ui/Drawer';
import AIToolbar from './AIToolbar';
import ArticleList from './ArticleList';
import CoverSection from './CoverSection';
import { coverImageUrl, fmtTime } from './utils';
import type { TabKey } from './utils';
import HelpGuide from '../../components/ui/HelpGuide';
import { Modal } from '../../components/modalApi';

const ARTICLE_TEMPLATES = [
  {
    id: 'gallery',
    name: '图片合集模板',
    type: '图片合集',
    tone: '轻松、有画面感',
    wordCount: '300-500 字',
    subtitles: true,
    gallery: true,
    prompt: '开头点明主题，中段用 3-5 个小标题串联图片亮点，结尾引导读者收藏或留言。',
  },
  {
    id: 'celebrity',
    name: '明星动态模板',
    type: '明星动态',
    tone: '自然、克制、有资讯感',
    wordCount: '500-700 字',
    subtitles: true,
    gallery: true,
    prompt: '先交代人物和动态，再展开造型、现场氛围、粉丝关注点，避免夸张臆测。',
  },
  {
    id: 'outfit',
    name: '穿搭解析模板',
    type: '穿搭解析',
    tone: '专业但不端着',
    wordCount: '600-800 字',
    subtitles: true,
    gallery: true,
    prompt: '围绕单品、色彩、版型、适用场景做解析，给出可借鉴的穿搭建议。',
  },
  {
    id: 'daily',
    name: '今日精选模板',
    type: '今日精选',
    tone: '清爽、节奏快',
    wordCount: '400-600 字',
    subtitles: true,
    gallery: true,
    prompt: '用精选清单结构组织内容，每段聚焦一个看点，适合日更。',
  },
  {
    id: 'short',
    name: '简短图文模板',
    type: '简短图文',
    tone: '简洁、温柔',
    wordCount: '150-300 字',
    subtitles: false,
    gallery: true,
    prompt: '少铺垫，直接写图集看点和氛围，适合配图发布。',
  },
] as const;

export default function ArticlePublish() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    addToast,
    articles,
    setArticles,
    currentArticle,
    setCurrentArticle,
    articleFilter,
    setArticleFilter,
    inspirationResults,
    setInspirationResults,
    openLightbox,
    sidebarOpen,
    setSidebarOpen,
    chatMessages,
    addChatMessage,
    updateChatMessage,
    removeChatMessage,
    clearChatMessages,
  } = useStore(
    useShallow((s) => ({
      addToast: s.addToast,
      articles: s.articles,
      setArticles: s.setArticles,
      currentArticle: s.currentArticle,
      setCurrentArticle: s.setCurrentArticle,
      articleFilter: s.articleFilter,
      setArticleFilter: s.setArticleFilter,
      inspirationResults: s.inspirationResults,
      setInspirationResults: s.setInspirationResults,
      openLightbox: s.openLightbox,
      sidebarOpen: s.sidebarOpen,
      setSidebarOpen: s.setSidebarOpen,
      chatMessages: s.chatMessages,
      addChatMessage: s.addChatMessage,
      updateChatMessage: s.updateChatMessage,
      removeChatMessage: s.removeChatMessage,
      clearChatMessages: s.clearChatMessages,
    })),
  );

  /* ── 编辑器状态 ────────────────────────────── */
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentDoc, setContentDoc] = useState<object>({
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
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
  const [saveToMaterialsLoading, setSaveToMaterialsLoading] = useState(false);

  /* ── 对话输入 ────────────────────────────────── */
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const aiMsgIdRef = useRef<string | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [writeMode, setWriteMode] = useState(true);

  // 注册/注销进行中的任务
  const registerTask = useStore((s) => s.registerTask);
  const unregisterTask = useStore((s) => s.unregisterTask);
  useEffect(() => {
    if (chatLoading) {
      registerTask('AI 写文章');
    } else {
      unregisterTask('AI 写文章');
    }
  }, [chatLoading, registerTask, unregisterTask]);
  const chatInstructionRef = useRef('');

  /* ── UI 状态 ────────────────────────────────── */
  const [confirm, setConfirm] = useState<{ msg: string; onOk: () => void } | null>(null);
  const [inspirationKeyword, setInspirationKeyword] = useState('');
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const inspirationRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [coverKeyword, setCoverKeyword] = useState('');
  const [coverResults, setCoverResults] = useState<CoverImage[]>([]);
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverDownloading, setCoverDownloading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverPos, setCoverPos] = useState({ x: 50, y: 50 });
  const coverDragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const coverContainerRef = useRef<HTMLDivElement>(null);
  const [wechatAccounts, setWechatAccounts] = useState<WeChatAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [publishConfirm, setPublishConfirm] = useState<'draft' | 'publish' | null>(null);
  const [templateId, setTemplateId] = useState<(typeof ARTICLE_TEMPLATES)[number]['id']>('gallery');
  const [titleCandidates, setTitleCandidates] = useState<TitleCandidate[]>([]);
  const [titleCandidateLoading, setTitleCandidateLoading] = useState(false);

  /* ── 加载文章列表 ───────────────────────────── */
  const loadArticles = useCallback(
    async (filter?: TabKey) => {
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
    },
    [addToast, setArticles],
  );

  useEffect(() => {
    loadArticles(articleFilter);
  }, []); // eslint-disable-line

  // 回显：从队列编辑跳转时自动选中文章（仅首次）
  const initialAutoSelectDone = useRef(false);
  useEffect(() => {
    if (initialAutoSelectDone.current) return;
    const editId = searchParams.get('edit');
    if (!editId || articles.length === 0) return;
    const target = articles.find((a) => a.id === editId);
    if (target) {
      // eslint-disable-next-line
      selectArticle(target);
      initialAutoSelectDone.current = true;
    }
  }, [searchParams, articles]);

  useEffect(() => {
    wechatAccountApi
      .list()
      .then(({ accounts }) => {
        setWechatAccounts(accounts);
        const def = accounts.find((a) => a.is_default);
        if (def) setSelectedAccountId(def.account_id);
      })
      .catch(() => {});
  }, []);

  // 点击灵感搜索外部关闭下拉
  useEffect(() => {
    if (!inspirationOpen) return;
    const handler = (e: MouseEvent) => {
      if (inspirationRef.current && !inspirationRef.current.contains(e.target as Node)) {
        setInspirationOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inspirationOpen]);

  const selectArticle = (a: ArticleItem) => {
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setContentDoc(plainToTiptap(a.content));
    setCover(a.cover || '');
    setSource(a.source || '');
    setTagsText(a.tags?.join(', ') || '');
    setCurrentArticle(a);
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setContentDoc({ type: 'doc', content: [{ type: 'paragraph' }] });
    setCover('');
    setSource('');
    setTagsText('');
    setCurrentArticle(null);
    setShowCoverSearch(false);
    setCoverResults([]);
  };

  const doInspiration = async () => {
    if (!inspirationKeyword.trim()) return;
    try {
      setInspirationLoading(true);
      const res = await articleApi.inspiration(inspirationKeyword.trim());
      setInspirationResults(res.topics);
      if (res.topics.length === 0) addToast('未找到相关话题，换个关键词试试', 'info');
    } catch (e: any) {
      addToast(e.message || '搜索灵感失败', 'error');
    } finally {
      setInspirationLoading(false);
    }
  };

  const pickInspiration = (topic: InspirationTopic) => {
    setTitle(topic.text.slice(0, 128));
    setSource(topic.text);
    setInspirationResults([]);
    setInspirationKeyword('');
    setInspirationOpen(false);
  };

  const doCoverSearch = async (kw: string) => {
    if (!kw.trim()) {
      addToast('请输入关键词', 'info');
      return;
    }
    try {
      setCoverSearchLoading(true);
      const res = await articleApi.coverSearch(kw.trim());
      setCoverResults(res.images);
      if (res.images.length === 0) addToast('未找到相关配图', 'info');
    } catch (e: any) {
      addToast(e.message || '搜索配图失败', 'error');
    } finally {
      setCoverSearchLoading(false);
    }
  };

  const selectCoverImage = async (img: CoverImage) => {
    if (img.source === 'local') {
      setCover(img.path);
      setCoverPos({ x: 50, y: 50 });
      setShowCoverSearch(false);
      setCoverLoading(true);
      return;
    }
    try {
      setCoverDownloading(true);
      addToast('正在下载封面图片…', 'info');
      const res = await articleApi.coverDownload(img.path);
      if (res.success && res.path) {
        setCover(res.path);
        setCoverPos({ x: 50, y: 50 });
        setShowCoverSearch(false);
        setCoverLoading(true);
        addToast('封面已设置', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '下载封面失败', 'error');
    } finally {
      setCoverDownloading(false);
    }
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
      if (editingId) {
        await articleApi.update(editingId, data);
        Modal.alert({ message: '文章已更新' });
      } else {
        await articleApi.create(data);
        Modal.alert({ message: '草稿已保存' });
        resetEditor();
      }
      loadArticles(articleFilter);
    } catch (e: any) {
      addToast(e.message || '保存失败', 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  const doSaveToMaterials = async () => {
    if (!editingId && !title && !content) {
      addToast('请先输入内容', 'info');
      return;
    }
    try {
      setSaveToMaterialsLoading(true);
      // 先确保文章已保存
      let id = editingId;
      if (!id) {
        try {
          const res = await articleApi.create({ title, content, status: 'draft' });
          if (res.article?.id) {
            id = res.article.id;
            setEditingId(id);
            setCurrentArticle(res.article);
          }
        } catch {
          /* fall through */
        }
      }
      if (!id) {
        addToast('保存失败', 'error');
        return;
      }

      const res = await articleApi.saveToMaterials(id);
      addToast(`文章已保存到素材: ${res.path}`, 'success');
    } catch (e: any) {
      addToast(e.message || '保存到素材失败', 'error');
    } finally {
      setSaveToMaterialsLoading(false);
    }
  };

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

  const doPublish = async (saveDraft: boolean) => {
    if (!editingId) {
      addToast('请先保存草稿再发布', 'info');
      return;
    }
    try {
      setPublishLoading(true);
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      await articleApi.update(editingId, { title, content, cover, source, tags });
      const res = await articleApi.publish(editingId, {
        save_draft: saveDraft,
        account_id: selectedAccountId || undefined,
      });
      if (res.started) {
        addToast('发布任务已启动，正在等待后台处理...', 'info');
        const action = saveDraft ? '保存草稿' : '发布';
        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const art = await articleApi.get(editingId);
            const st = art.article.status;
            if (st === 'saved_to_wechat' || st === 'published') {
              addToast(`${action}成功`, 'success');
              break;
            }
            if (st === 'failed') {
              addToast(art.article.error || '发布失败', 'error');
              break;
            }
          } catch {}
        }
      } else {
        addToast(res.message || (saveDraft ? '已保存为草稿' : '发布成功'), 'success');
      }
      loadArticles(articleFilter);
    } catch (e: any) {
      addToast(e.message || '发布失败', 'error');
    } finally {
      setPublishLoading(false);
    }
  };

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

  const ensureArticleSaved = async (allowEmpty = false): Promise<string | null> => {
    if (editingId) return editingId;
    if (!title && !content && !allowEmpty) {
      addToast('请先输入标题或正文', 'info');
      return null;
    }
    try {
      const tags = tagsText.split(/[,，、\s]+/).filter(Boolean);
      const saveTitle = title || (allowEmpty ? '未命名文章' : '');
      const res = await articleApi.create({
        title: saveTitle,
        content,
        cover,
        source,
        tags,
        status: 'draft',
      });
      setEditingId(res.article.id);
      setCurrentArticle(res.article);
      loadArticles(articleFilter);
      return res.article.id;
    } catch (e: any) {
      addToast(e.message || '自动保存失败', 'error');
      return null;
    }
  };

  const doGenerate = async () => {
    if (!title && !source) {
      addToast('请输入标题或灵感来源', 'info');
      return;
    }
    try {
      setGenLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const tpl = ARTICLE_TEMPLATES.find((t) => t.id === templateId) || ARTICLE_TEMPLATES[0];
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
      if (res.content) {
        setContent(res.content);
        setContentDoc(plainToTiptap(res.content));
        addToast('AI 生成完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || 'AI 生成失败', 'error');
    } finally {
      setGenLoading(false);
    }
  };

  const doPolish = async () => {
    if (!content) {
      addToast('请先输入正文', 'info');
      return;
    }
    try {
      setPolishLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.polish(id);
      if (res.content) {
        setContent(res.content);
        setContentDoc(plainToTiptap(res.content));
        addToast('校对完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '校对失败', 'error');
    } finally {
      setPolishLoading(false);
    }
  };

  const doDeAi = async () => {
    if (!content) {
      addToast('请先输入正文', 'info');
      return;
    }
    try {
      setDeAiLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.deAi(id);
      if (res.content) {
        setContent(res.content);
        setContentDoc(plainToTiptap(res.content));
        addToast('去 AI 味儿完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '处理失败', 'error');
    } finally {
      setDeAiLoading(false);
    }
  };

  const doGenerateTitle = async () => {
    if (!content) {
      addToast('请先输入正文', 'info');
      return;
    }
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

  const doGenerateTitleCandidates = async () => {
    if (!content) {
      addToast('请先输入正文', 'info');
      return;
    }
    try {
      setTitleCandidateLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.titleCandidates(id);
      setTitleCandidates(res.candidates || []);
      if (!res.candidates?.length) addToast('暂未生成标题候选', 'info');
    } catch (e: any) {
      addToast(e.message || '生成标题候选失败', 'error');
    } finally {
      setTitleCandidateLoading(false);
    }
  };

  const doOptimizeLayout = async () => {
    if (!content) {
      addToast('请先输入正文', 'info');
      return;
    }
    try {
      setLayoutLoading(true);
      const id = await ensureArticleSaved();
      if (!id) return;
      const res = await articleApi.optimizeLayout(id);
      if (res.content) {
        setContent(res.content);
        setContentDoc(plainToTiptap(res.content));
        addToast('排版优化完成', 'success');
      }
    } catch (e: any) {
      addToast(e.message || '优化排版失败', 'error');
    } finally {
      setLayoutLoading(false);
    }
  };

  const doChat = async () => {
    const instruction = chatInput.trim();
    if (!instruction) return;

    setChatLoading(true);
    setChatInput('');
    chatInstructionRef.current = instruction;
    const id = await ensureArticleSaved(true);
    if (!id) {
      setChatLoading(false);
      return;
    }

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: instruction,
      created_at: new Date().toISOString(),
    };
    addChatMessage(id, userMsg);

    // 创建占位 AI 消息（空内容，用于逐 token 填充）
    const aiMsgId = crypto.randomUUID();
    aiMsgIdRef.current = aiMsgId;
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    addChatMessage(id, aiMsg);

    const history = (chatMessages[id] || []).map((m) => ({ role: m.role, content: m.content }));

    // explanationText 更新聊天区，contentText 打字机效果更新编辑器
    let explanationText = '';
    let contentText = '';
    let hasContentEvents = false;
    let lastUpdateTime = 0;
    let lastContentUpdateTime = 0;
    const THROTTLE_MS = 50;
    const CONTENT_THROTTLE_MS = 100;

    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    try {
      const result = await articleApi.chat(
        id,
        instruction,
        history,
        {
          onMessage: (token) => {
            explanationText += token;
            const now = Date.now();
            if (now - lastUpdateTime >= THROTTLE_MS) {
              updateChatMessage(id, aiMsgId, explanationText);
              lastUpdateTime = now;
            }
          },
          onContent: (token) => {
            contentText += token;
            hasContentEvents = true;
            if (writeMode) {
              // 打字机效果：增量更新编辑器
              const now = Date.now();
              if (now - lastContentUpdateTime >= CONTENT_THROTTLE_MS) {
                setContent(contentText);
                setContentDoc(plainToTiptap(contentText));
                lastContentUpdateTime = now;
              }
            }
          },
        },
        abortController.signal,
        writeMode,
      );

      // 流完成：根据 writeMode 决定是否写入编辑器
      if (hasContentEvents && contentText.trim()) {
        if (writeMode) {
          // 写文章模式：解释在聊天区，内容更新编辑器
          updateChatMessage(id, aiMsgId, explanationText || '文章已更新');
          setContent(contentText);
          setContentDoc(plainToTiptap(contentText));
          addToast('文章已更新', 'success');
        } else {
          // 纯对话模式：完整回复显示在聊天区，不修改编辑器
          const fullResponse = explanationText
            ? explanationText + '\n\n---\n\n' + contentText
            : contentText;
          updateChatMessage(id, aiMsgId, fullResponse);
          addToast('已生成回答（写文章模式已关闭）', 'info');
        }
      } else {
        // 纯对话回复（总结/分析/提问等），不改编辑器
        updateChatMessage(id, aiMsgId, explanationText);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        updateChatMessage(id, aiMsgId, explanationText || '(已停止生成)');
      } else {
        addToast(e.message || '处理失败', 'error');
        removeChatMessage(id, aiMsgId);
      }
    } finally {
      setChatLoading(false);
      chatAbortRef.current = null;
      aiMsgIdRef.current = null;
    }
  };

  const stopChat = () => {
    chatAbortRef.current?.abort();
  };

  // 根据用户指令推断 AI 正在做什么
  const getTypingText = (instruction: string): string => {
    if (/生成|写一篇|创作|撰写/.test(instruction)) return '正在生成文章...';
    if (/标题|题目/.test(instruction)) return '正在生成标题...';
    if (/润色|修改|优化|改善|提升/.test(instruction)) return '正在优化内容...';
    if (/排版|格式|结构/.test(instruction)) return '正在优化排版...';
    if (/去AI|去ai|自然|口语化/.test(instruction)) return '正在处理中...';
    if (/缩写|精简|缩短|删减/.test(instruction)) return '正在精简内容...';
    if (/扩写|扩展|充实|补充/.test(instruction)) return '正在扩展内容...';
    return '正在思考...';
  };

  // 输入框自动高度
  const resizeChatTextarea = useCallback(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight, 36), 120) + 'px';
  }, []);

  useEffect(() => {
    resizeChatTextarea();
  }, [chatInput, resizeChatTextarea]);

  // 自动滚动到最新消息
  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatMessagesRef.current) {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollChatToBottom();
  }, [chatMessages, editingId, scrollChatToBottom]);

  // 流式输出时，内容变化也要触发滚动
  const lastMsgContentLen = useRef(0);
  useEffect(() => {
    const msgs = editingId ? chatMessages[editingId] || [] : [];
    const lastMsg = msgs[msgs.length - 1];
    const len = lastMsg?.content?.length || 0;
    if (len !== lastMsgContentLen.current) {
      lastMsgContentLen.current = len;
      scrollChatToBottom();
    }
  }, [chatMessages, editingId, scrollChatToBottom]);

  const switchFilter = (tab: TabKey) => {
    setArticleFilter(tab);
    loadArticles(tab);
  };
  const tpl = ARTICLE_TEMPLATES.find((t) => t.id === templateId) || ARTICLE_TEMPLATES[0];
  const currentChatMessages = editingId ? chatMessages[editingId] || [] : [];

  /* ── Render ────────────────────────────────── */
  return (
    <div
      className="animate-in"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── Header ──────────────────────────────── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingBottom: 12 }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.3px',
            color: 'var(--text)',
            margin: 0,
            flexShrink: 0,
          }}
        >
          文章发布
        </h1>

        {/* 灵感搜索（紧凑） */}
        <div
          ref={inspirationRef}
          style={{ position: 'relative', flex: 1, maxWidth: 320, marginLeft: 12 }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              placeholder="搜索灵感话题..."
              value={inspirationKeyword}
              onChange={(e) => setInspirationKeyword(e.target.value)}
              onFocus={() => setInspirationOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  doInspiration();
                  setInspirationOpen(true);
                }
              }}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 6,
                height: 30,
                lineHeight: '18px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                doInspiration();
                setInspirationOpen(true);
              }}
              disabled={inspirationLoading}
              style={{ padding: '5px 10px', fontSize: 12, height: 30 }}
            >
              {inspirationLoading ? <Loading size="xs" /> : '搜索'}
            </button>
          </div>
          {/* 灵感结果下拉 */}
          {inspirationOpen &&
            (inspirationResults.length > 0 || (inspirationKeyword && !inspirationLoading)) && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 100,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {inspirationResults.map((t, i) => (
                  <div
                    key={i}
                    onClick={() => pickInspiration(t)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--text)',
                      borderBottom:
                        i < inspirationResults.length - 1
                          ? '1px solid var(--border-subtle)'
                          : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--accent-softer)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        marginTop: 1,
                        flexShrink: 0,
                        fontWeight: 500,
                      }}
                    >
                      {t.source === 'weibo' ? 'WB' : 'TT'}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4,
                      }}
                    >
                      {t.text}
                    </span>
                    {t.celebrity && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {t.celebrity}
                      </span>
                    )}
                  </div>
                ))}
                {!inspirationLoading && inspirationResults.length === 0 && (
                  <p
                    style={{
                      padding: '12px 10px',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      margin: 0,
                    }}
                  >
                    未找到相关话题
                  </p>
                )}
              </div>
            )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <HelpGuide title="文章发布 — 使用说明">
            <p>
              <b>1. 创建文章</b>
              ：点击「新建文章」从空白开始，或选择右侧模板快速生成（图片合集、明星动态、穿搭解析等）。
            </p>
            <p>
              <b>2. AI 辅助写作</b>：使用工具栏的 AI 功能
              —「生成文章」自动创作、「润色」优化表达、「去 AI
              味」让文字更自然、「排版优化」美化格式。
            </p>
            <p>
              <b>3. 标题生成</b>
              ：点击「生成标题」获取多个候选标题，可选择安全型、吸引点击型、温和型等不同风格。
            </p>
            <p>
              <b>4. 封面与配图</b>：在「封面」区域选择或上传封面图，拖拽调整文章中的图片顺序。
            </p>
            <p>
              <b>5. 保存与发布</b>
              ：「保存草稿」存为本地草稿可继续编辑；「加入队列」进入发布队列等待发布；「直接发布」立即推送到公众号。
            </p>
            <p>
              <b>6. 效果追踪</b>
              ：已发布的文章可录入阅读量、点赞等数据，后续在「数据分析」页面查看趋势。
            </p>
          </HelpGuide>

          {/* 文章列表抽屉按钮 */}
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 6,
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
              e.currentTarget.style.background = 'var(--accent-softer)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M15 3v18" />
            </svg>
            文章列表
          </button>

          {editingId && (
            <button
              onClick={resetEditor}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-softer)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              + 新建文章
            </button>
          )}

          {/* AI 面板折叠按钮 */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 'var(--radius)',
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.background = 'var(--accent-softer)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'none';
              }}
              title="展开 AI 助手"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ───────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* ── Left: Editor ──────────────────────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {/* 文章设置栏（紧凑水平） */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              marginBottom: 8,
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            {/* 模板 */}
            <div style={{ width: 140, flexShrink: 0 }}>
              <Select
                size="sm"
                value={templateId}
                onChange={(v) => setTemplateId(v as typeof templateId)}
                options={ARTICLE_TEMPLATES.map((t) => ({ label: t.name, value: t.id }))}
              />
            </div>

            {/* 封面按钮 */}
            <button
              onClick={cover ? () => setShowCoverSearch(!showCoverSearch) : handleAddCover}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                background: cover ? 'var(--accent-softer)' : 'none',
                border: cover ? '1px solid var(--accent-soft)' : '1px dashed var(--border)',
                cursor: 'pointer',
                fontSize: 12,
                color: cover ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
                flexShrink: 0,
                lineHeight: 1.2,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = cover ? 'var(--accent-soft)' : 'var(--border)';
                e.currentTarget.style.color = cover ? 'var(--accent)' : 'var(--text-muted)';
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {cover ? '已设封面' : '封面'}
            </button>

            {/* 标签 */}
            <input
              placeholder="标签"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              style={{
                flex: '1 1 100px',
                minWidth: 80,
                fontSize: 12,
                padding: '5px 8px',
                borderRadius: 6,
                height: 30,
                lineHeight: '18px',
              }}
            />

            {/* 来源 */}
            <input
              placeholder="话题来源"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{
                flex: '1 1 100px',
                minWidth: 80,
                fontSize: 12,
                padding: '5px 8px',
                borderRadius: 6,
                height: 30,
                lineHeight: '18px',
              }}
            />
          </div>

          {/* 封面预览（可拖拽平移） */}
          {cover && !showCoverSearch && (
            <div
              ref={coverContainerRef}
              style={{
                flexShrink: 0,
                marginBottom: 8,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 8,
                border: '1px solid var(--border)',
                cursor: 'grab',
                maxHeight: 140,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                coverDragRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startPosX: coverPos.x,
                  startPosY: coverPos.y,
                };
                const onMove = (ev: MouseEvent) => {
                  const drag = coverDragRef.current;
                  if (!drag || !coverContainerRef.current) return;
                  const rect = coverContainerRef.current.getBoundingClientRect();
                  const img = coverContainerRef.current.querySelector(
                    'img',
                  ) as HTMLImageElement | null;
                  if (!img || !img.naturalWidth) return;
                  const scaleX = img.naturalWidth / rect.width;
                  const scaleY = img.naturalHeight / rect.height;
                  const dx = ((ev.clientX - drag.startX) / rect.width) * 100 * scaleX;
                  const dy = ((ev.clientY - drag.startY) / rect.height) * 100 * scaleY;
                  setCoverPos({
                    x: Math.max(0, Math.min(100, drag.startPosX - dx)),
                    y: Math.max(0, Math.min(100, drag.startPosY - dy)),
                  });
                };
                const onUp = () => {
                  coverDragRef.current = null;
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  if (coverContainerRef.current) coverContainerRef.current.style.cursor = 'grab';
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
              }}
            >
              <img
                key={cover}
                src={coverImageUrl(cover)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: `${coverPos.x}% ${coverPos.y}%`,
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
                onLoad={() => {
                  setCoverLoading(false);
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  setCoverLoading(false);
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  display: 'flex',
                  gap: 4,
                  pointerEvents: 'auto',
                }}
              >
                <button
                  onClick={() => setShowCoverSearch(true)}
                  className="btn btn-sm"
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    padding: '3px 8px',
                    fontSize: 11,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                  }}
                >
                  更换
                </button>
                <button
                  onClick={() => {
                    setCover('');
                    setShowCoverSearch(false);
                  }}
                  className="btn btn-sm"
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    padding: '3px 8px',
                    fontSize: 11,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                  }}
                >
                  移除
                </button>
              </div>
            </div>
          )}

          {/* 封面搜索展开面板 */}
          {showCoverSearch && (
            <div
              style={{
                flexShrink: 0,
                marginBottom: 8,
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  placeholder="输入关键词搜索配图..."
                  value={coverKeyword}
                  onChange={(e) => setCoverKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doCoverSearch(coverKeyword)}
                  autoFocus
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '5px 8px',
                    borderRadius: 6,
                    height: 30,
                    lineHeight: '18px',
                  }}
                />
                <button
                  className="btn btn-sm"
                  onClick={() => doCoverSearch(coverKeyword)}
                  disabled={coverSearchLoading}
                >
                  {coverSearchLoading ? <Loading size="xs" /> : '搜索'}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setShowCoverSearch(false);
                    setCoverResults([]);
                  }}
                >
                  关闭
                </button>
              </div>
              {coverResults.length > 0 && (
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                    gap: 4,
                  }}
                >
                  {coverResults.map((img, i) => (
                    <div
                      key={i}
                      onClick={() => selectCoverImage(img)}
                      style={{
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: 4,
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                        aspectRatio: '1/1',
                        background: 'var(--bg-inset)',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <img
                        src={coverImageUrl(img.path, img.source)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {img.source === 'web' && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 1,
                            right: 1,
                            padding: '1px 3px',
                            fontSize: 8,
                            color: '#fff',
                            background: 'rgba(94,106,210,0.7)',
                            borderRadius: 3,
                          }}
                        >
                          W
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 标题输入 */}
          <div style={{ flexShrink: 0, marginBottom: 8 }}>
            <input
              className="title-input"
              placeholder="输入文章标题..."
              maxLength={128}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                borderRadius: 0,
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
                color: 'var(--text)',
                padding: 0,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* AI Toolbar */}
          <div
            style={{
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 5,
              background: 'var(--bg)',
              paddingBottom: 6,
            }}
          >
            <AIToolbar
              onGenerate={doGenerate}
              onPolish={doPolish}
              onDeAi={doDeAi}
              onGenerateTitle={doGenerateTitle}
              onOptimizeLayout={doOptimizeLayout}
              genLoading={genLoading}
              polishLoading={polishLoading}
              deAiLoading={deAiLoading}
              titleLoading={titleLoading}
              layoutLoading={layoutLoading}
              content={content}
            />
          </div>

          {/* Editor */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Suspense
              fallback={
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                </div>
              }
            >
              <RichTextEditor
                value={contentDoc}
                onChange={(doc) => {
                  setContentDoc(doc);
                  setContent(tiptapToPlain(doc));
                }}
                placeholder="开始写作..."
                minHeight={400}
              />
            </Suspense>
          </div>
        </div>

        {/* ── Right: AI 面板 ────────────────────── */}
        <div
          style={{
            width: sidebarOpen ? 360 : 0,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.3s var(--ease-out)',
          }}
        >
          <div
            style={{
              width: 360,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              opacity: sidebarOpen ? 1 : 0,
              transition: 'opacity 0.2s ease',
              pointerEvents: sidebarOpen ? 'auto' : 'none',
            }}
          >
            {/* AI 面板标题栏 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>AI 助手</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {editingId && currentChatMessages.length > 0 && (
                  <button
                    onClick={() => clearChatMessages(editingId)}
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    清空对话
                  </button>
                )}
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 'var(--radius-sm)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-secondary)';
                    e.currentTarget.style.color = 'var(--text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }}
                  title="收起 AI 助手"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M11 19l-7-7 7-7" />
                    <path d="M18 19l-7-7 7-7" opacity=".4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 标题候选 */}
            <div style={{ marginBottom: 10, flexShrink: 0 }}>
              <button
                className="btn btn-sm"
                onClick={doGenerateTitleCandidates}
                disabled={titleCandidateLoading || !content}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginBottom: titleCandidates.length ? 6 : 0,
                }}
              >
                {titleCandidateLoading ? <Loading size="xs" /> : null} 标题多候选
              </button>
              {titleCandidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {titleCandidates.map((candidate) => (
                    <button
                      key={`${candidate.type}-${candidate.title}`}
                      onClick={() => {
                        setTitle(candidate.title);
                        addToast(`已使用${candidate.type}`, 'success');
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 2,
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.background = 'var(--accent-softer)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--bg-card)';
                      }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                        {candidate.type}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                        {candidate.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 对话面板 — flex:1 填充剩余空间，输入框始终在底部 */}
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                background: 'var(--bg-card)',
              }}
            >
              {/* Chat 顶部工具栏：写文章开关 + 清空 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-secondary)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* 自定义 toggle 开关 */}
                  <div
                    onClick={() => setWriteMode(!writeMode)}
                    style={{
                      width: 30,
                      height: 17,
                      borderRadius: 9,
                      background: writeMode ? 'var(--accent)' : 'var(--bg-inset, #e5e7eb)',
                      border: '1px solid ' + (writeMode ? 'var(--accent)' : 'var(--border)'),
                      cursor: 'pointer',
                      position: 'relative',
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        background: '#fff',
                        position: 'absolute',
                        top: 1,
                        left: writeMode ? 15 : 1,
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: writeMode ? 'var(--accent)' : 'var(--text-muted)',
                      transition: 'color 0.2s',
                      userSelect: 'none',
                    }}
                  >
                    写文章
                  </span>
                </div>
                {editingId && currentChatMessages.length > 0 && (
                  <button
                    onClick={() => clearChatMessages(editingId)}
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-sm)',
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    清空对话
                  </button>
                )}
              </div>

              {/* 消息区域 — 可滚动 */}
              <div
                ref={chatMessagesRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: currentChatMessages.length > 0 ? '10px 10px 4px' : 0,
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  scrollBehavior: 'smooth',
                }}
              >
                {currentChatMessages.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      minHeight: 160,
                      padding: '20px 16px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.3, marginBottom: 8 }}
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>输入指令让 AI 优化文章</span>
                    <span style={{ color: 'var(--text-muted)', opacity: 0.6, marginTop: 2 }}>
                      {writeMode ? 'AI 会先解释再直接修改编辑器' : 'AI 仅回复对话，不会修改文章'}
                    </span>
                  </div>
                )}
                {/* eslint-disable-next-line */}
                {currentChatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom: 8,
                    }}
                  >
                    {msg.role === 'assistant' && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          marginBottom: 2,
                          marginLeft: 2,
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          opacity: 0.6,
                        }}
                      >
                        AI
                      </span>
                    )}
                    <div
                      style={{
                        maxWidth: '88%',
                        padding: '6px 10px',
                        borderRadius:
                          msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                        background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                        color:
                          msg.role === 'user' ? 'var(--accent-foreground, #fff)' : 'var(--text)',
                        fontSize: 12,
                        lineHeight: 1.55,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        boxShadow: msg.role === 'assistant' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                      }}
                    >
                      {msg.content}
                      {msg.role === 'assistant' &&
                        chatLoading &&
                        msg.id === aiMsgIdRef.current &&
                        !msg.content && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                border: '2px solid var(--border)',
                                borderTopColor: 'var(--accent)',
                                animation: 'spin 0.8s linear infinite',
                                flexShrink: 0,
                              }}
                            />
                            {getTypingText(chatInstructionRef.current)}
                          </span>
                        )}
                      {msg.role === 'assistant' &&
                        chatLoading &&
                        msg.id === aiMsgIdRef.current &&
                        msg.content && (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 2,
                              height: '1em',
                              background: 'var(--accent)',
                              marginLeft: 2,
                              animation: 'blink 1s infinite',
                              verticalAlign: 'text-bottom',
                            }}
                          />
                        )}
                    </div>
                  </div>
                ))}
                {/* eslint-disable-next-line react-hooks/refs */}
                {chatLoading && !aiMsgIdRef.current && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px 10px 10px 2px',
                        background: 'var(--bg-secondary)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Loading size="xs" /> 思考中...
                    </div>
                  </div>
                )}
              </div>

              {/* 输入区域 — 固定在底部 */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: '8px 8px',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg)',
                  flexShrink: 0,
                  alignItems: 'flex-end',
                }}
              >
                <textarea
                  ref={chatTextareaRef}
                  placeholder={writeMode ? '描述你想要的修改...' : '有什么想问的？'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!chatLoading) doChat();
                    }
                  }}
                  disabled={chatLoading}
                  rows={1}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '7px 10px',
                    borderRadius: 8,
                    lineHeight: '18px',
                    resize: 'none',
                    overflow: 'auto',
                    minHeight: 36,
                    maxHeight: 120,
                    fontFamily: 'inherit',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                />
                {chatLoading ? (
                  <button
                    className="btn btn-sm"
                    onClick={stopChat}
                    style={{
                      flexShrink: 0,
                      padding: '7px 12px',
                      height: 36,
                      background: 'var(--danger, #ef4444)',
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    停止
                  </button>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={doChat}
                    disabled={!chatInput.trim()}
                    style={{
                      flexShrink: 0,
                      padding: '7px 12px',
                      height: 36,
                      opacity: chatInput.trim() ? 1 : 0.5,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    发送
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action bar ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: '10px 0 4px',
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
          background: 'var(--bg)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {wechatAccounts.length > 0 && (
          <div style={{ width: 190, flexShrink: 0 }}>
            <Select
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              options={wechatAccounts.map((acc) => ({
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
            <button
              className="btn btn-ghost"
              onClick={doSaveToMaterials}
              disabled={saveToMaterialsLoading}
            >
              {saveToMaterialsLoading ? <Loading size="xs" /> : null} 保存到素材
            </button>
            <button className="btn btn-primary" onClick={doSave} disabled={saveLoading}>
              {saveLoading ? <Loading size="xs" /> : null} 保存草稿
            </button>
            <button className="btn" onClick={doQueue} disabled={queueLoading}>
              {queueLoading ? <Loading size="xs" /> : null} 加入队列
            </button>
            <button
              className="btn"
              onClick={() => setPublishConfirm('publish')}
              disabled={publishLoading}
            >
              {publishLoading ? <Loading size="xs" /> : null} 直接发布
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setPublishConfirm('draft')}
              disabled={publishLoading}
            >
              公众号草稿
            </button>
          </>
        )}
      </div>

      {/* ── 文章列表抽屉 ────────────────────────── */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="文章列表" width={380}>
        <ArticleList
          articles={articles}
          articleFilter={articleFilter}
          editingId={editingId}
          loading={loading}
          onSelectArticle={selectArticle}
          onSwitchFilter={switchFilter}
          onDelete={doDelete}
          expanded={true}
          onToggleExpanded={() => {}}
          fillHeight
        />
      </Drawer>

      <Dialog
        open={!!confirm}
        title="确认操作"
        message={confirm?.msg || ''}
        onConfirm={() => {
          confirm?.onOk();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <PublishConfirmModal
        open={!!publishConfirm}
        action={publishConfirm || 'draft'}
        account={wechatAccounts.find((a) => a.account_id === selectedAccountId) || null}
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
