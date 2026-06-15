import { useState, useEffect, useRef, useCallback } from 'react';
import { fileUrl } from '../../utils/file';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('bash', bash);

/* ─────────────────────────────────────────────
 * 配置 marked + highlight.js 自定义渲染器
 * ───────────────────────────────────────────── */

const renderer = new Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string; escaped?: boolean }): string {
  const language = lang || '';
  let highlighted: string;
  try {
    highlighted = language && hljs.getLanguage(language)
      ? hljs.highlight(text, { language }).value
      : hljs.highlightAuto(text).value;
  } catch {
    highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  const detectedLang = (language || hljs.highlightAuto(text).language || 'text').toLowerCase();
  return `<div class="cb-wrap">
    <div class="cb-hdr">
      <span class="cb-lang">${escapeHtml(detectedLang)}</span>
      <button type="button" class="cb-copy" data-cb-copy>
        <svg class="cb-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <svg class="cb-copy-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span class="cb-copy-txt">复制</span>
        <span class="cb-copy-done">已复制</span>
      </button>
    </div>
    <pre class="cb-body"><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${highlighted}</code></pre>
  </div>`;
};

marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

/** 简单 HTML 转义 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─────────────────────────────────────────────
 * 内嵌样式（hljs token 颜色 + 代码块样式）
 * ───────────────────────────────────────────── */

const CODE_STYLES = `
/* ═══════════════════════════════════════════════
 * CSS 变量：代码块 & hljs 颜色 — GitHub 主题风格
 * ═══════════════════════════════════════════════ */

:root {
  --cb-bg: #f6f8fa;
  --cb-hdr-bg: #eff2f5;
  --cb-border: #d0d7de;
  --cb-fg: #1f2328;
  --cb-lang: #656d76;
  --cb-copy-fg: #656d76;
  --cb-copy-fg-hover: #1f2328;
  --cb-copy-hover: rgba(31,35,40,0.06);
  --cb-copy-active: rgba(31,35,40,0.12);
  /* hljs tokens — GitHub Light */
  --hl-fg: #1f2328;
  --hl-comment: #6e7781;
  --hl-keyword: #cf222e;
  --hl-string: #0a3069;
  --hl-number: #0550ae;
  --hl-title: #8250df;
  --hl-builtin: #0550ae;
  --hl-attr: #0a3069;
  --hl-type: #0550ae;
  --hl-variable: #953800;
  --hl-meta: #6e7781;
  --hl-deletion: #82071e;
  --hl-addition: #116329;
}

[data-theme="dark"] {
  --cb-bg: #161b22;
  --cb-hdr-bg: #0d1117;
  --cb-border: #30363d;
  --cb-fg: #e6edf3;
  --cb-lang: #8b949e;
  --cb-copy-fg: #8b949e;
  --cb-copy-fg-hover: #e6edf3;
  --cb-copy-hover: rgba(230,237,243,0.06);
  --cb-copy-active: rgba(230,237,243,0.12);
  --hl-fg: #e6edf3;
  --hl-comment: #8b949e;
  --hl-keyword: #ff7b72;
  --hl-string: #a5d6ff;
  --hl-number: #79c0ff;
  --hl-title: #d2a8ff;
  --hl-builtin: #79c0ff;
  --hl-attr: #79c0ff;
  --hl-type: #79c0ff;
  --hl-variable: #ffa657;
  --hl-meta: #8b949e;
  --hl-deletion: #ffdcd7;
  --hl-addition: #aff5b4;
}

[data-theme="auto"] { /* inherit :root (light) */ }
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
    --cb-bg: #161b22;
    --cb-hdr-bg: #0d1117;
    --cb-border: #30363d;
    --cb-fg: #e6edf3;
    --cb-lang: #8b949e;
    --cb-copy-fg: #8b949e;
    --cb-copy-fg-hover: #e6edf3;
    --cb-copy-hover: rgba(230,237,243,0.06);
    --cb-copy-active: rgba(230,237,243,0.12);
    --hl-fg: #e6edf3;
    --hl-comment: #8b949e;
    --hl-keyword: #ff7b72;
    --hl-string: #a5d6ff;
    --hl-number: #79c0ff;
    --hl-title: #d2a8ff;
    --hl-builtin: #79c0ff;
    --hl-attr: #79c0ff;
    --hl-type: #79c0ff;
    --hl-variable: #ffa657;
    --hl-meta: #8b949e;
    --hl-deletion: #ffdcd7;
    --hl-addition: #aff5b4;
  }
}

/* ═══════════════════════════════════════════════
 * 代码块 wrapper — GitHub 风格
 * ═══════════════════════════════════════════════ */

.cb-wrap {
  margin: 1.2em 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--cb-border);
  background: var(--cb-bg);
}

.cb-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--cb-hdr-bg);
  border-bottom: 1px solid var(--cb-border);
  user-select: none;
}
.cb-lang {
  font-size: 12px;
  font-weight: 500;
  color: var(--cb-lang);
}

/* ── 复制按钮 ── */
.cb-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--cb-border);
  border-radius: 6px;
  background: var(--cb-bg);
  color: var(--cb-copy-fg);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.cb-copy:hover { background: var(--cb-copy-hover); color: var(--cb-copy-fg-hover); }
.cb-copy:active { background: var(--cb-copy-active); }
.cb-copy-icon { display: block; }
.cb-copy-check { display: none; }
.cb-copy.copied .cb-copy-icon { display: none; }
.cb-copy.copied .cb-copy-check { display: block; }
.cb-copy.copied .cb-copy-txt { display: none; }
.cb-copy.copied .cb-copy-done { display: inline; }
.cb-copy-txt { display: inline; }
.cb-copy-done { display: none; color: var(--success); }

.cb-body {
  margin: 0 !important;
  padding: 8px 12px;
  overflow-x: auto;
  background: transparent !important;
  border: none !important;
  line-height: 1.6 !important;
  font-size: 13px !important;
}
.cb-body code {
  background: none !important;
  padding: 0 !important;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', ui-monospace, 'Menlo', monospace !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--cb-fg);
}

/* ═══════════════════════════════════════════════
 * hljs syntax tokens (via CSS 变量)
 * ═══════════════════════════════════════════════ */

.hljs { color: var(--hl-fg); background: transparent; }
.hljs-comment,
.hljs-quote { color: var(--hl-comment); font-style: italic; }
.hljs-keyword,
.hljs-selector-tag,
.hljs-literal,
.hljs-section { color: var(--hl-keyword); }
.hljs-string { color: var(--hl-string); }
.hljs-number { color: var(--hl-number); }
.hljs-title,
.hljs-name { color: var(--hl-title); }
.hljs-attr,
.hljs-attribute,
.hljs-selector-attr { color: var(--hl-attr); }
.hljs-type,
.hljs-built_in { color: var(--hl-builtin); }
.hljs-variable,
.hljs-selector-class,
.hljs-selector-id { color: var(--hl-variable); }
.hljs-meta,
.hljs-meta-string { color: var(--hl-meta); }
.hljs-deletion { color: var(--hl-deletion); }
.hljs-addition { color: var(--hl-addition); }
.hljs-strong { font-weight: bold; }
.hljs-emphasis { font-style: italic; }
.hljs-link { text-decoration: underline; }

/* ═══════════════════════════════════════════════
 * Markdown 内容排版 — GitHub 风格
 * ═══════════════════════════════════════════════ */

.md-content {
  color: var(--text);
  line-height: 1.6;
  font-size: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  overflow-wrap: break-word;
  word-wrap: break-word;
  padding: 0 6px;
}
.md-content > *:first-child { margin-top: 0 !important; }
.md-content > *:last-child { margin-bottom: 0 !important; }

.md-content h1, .md-content h2, .md-content h3, .md-content h4,
.md-content h5, .md-content h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}
.md-content h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border);
}
.md-content h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border);
}
.md-content h3 { font-size: 1.25em; }
.md-content h4 { font-size: 1em; }
.md-content h5 { font-size: 0.875em; }
.md-content h6 {
  font-size: 0.85em;
  color: var(--text-muted);
}

.md-content p { margin: 0 0 16px; }
.md-content p:last-child { margin-bottom: 0; }

.md-content a {
  color: var(--accent);
  text-decoration: none;
}
.md-content a:hover { text-decoration: underline; }
.md-content strong { font-weight: 600; }
.md-content em { font-style: italic; }
.md-content s { text-decoration: line-through; }

.md-content ul, .md-content ol { margin: 0 0 16px; padding-left: 2em; }
.md-content li { margin: 0; }
.md-content li + li { margin-top: 0.25em; }
.md-content li > p { margin-top: 16px; }
.md-content ul ul, .md-content ol ul, .md-content ul ol, .md-content ol ol { margin: 0; }

.md-content blockquote {
  margin: 0 0 16px;
  padding: 0 1em;
  border-left: 0.25em solid #d0d7de;
  color: #656d76;
}
[data-theme="dark"] .md-content blockquote {
  border-left-color: #30363d;
  color: #8b949e;
}
@media (prefers-color-scheme: light) {
  [data-theme="auto"] .md-content blockquote { border-left-color: #d0d7de; color: #656d76; }
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] .md-content blockquote {
    border-left-color: #30363d;
    color: #8b949e;
  }
}
.md-content blockquote p:last-child { margin-bottom: 0; }
.md-content blockquote > :first-child { margin-top: 0; }
.md-content blockquote > :last-child { margin-bottom: 0; }

.md-content hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background: #d0d7de;
  border: 0;
}
[data-theme="dark"] .md-content hr { background: #30363d; }
@media (prefers-color-scheme: light) {
  [data-theme="auto"] .md-content hr { background: #d0d7de; }
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] .md-content hr { background: #30363d; }
}

.md-content img {
  max-width: 100%;
  height: auto;
  box-sizing: content-box;
  border-radius: 6px;
  margin: 0.85em 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}

.md-content table {
  width: auto;
  max-width: 100%;
  border-collapse: collapse;
  margin: 0.85em 0;
  font-size: 0.9em;
  overflow: auto;
  display: block;
}
.md-content th {
  background: var(--bg-secondary);
  font-weight: 600;
  text-align: left;
  padding: 6px 13px;
  border: 1px solid var(--border);
}
.md-content td {
  padding: 6px 13px;
  border: 1px solid var(--border);
}
.md-content tr:nth-child(even) { background: var(--bg-secondary); }
.md-content tr { border-top: 1px solid var(--border); }

.md-content code:not(.hljs) {
  background: rgba(175,184,193,0.2);
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-size: 0.85em;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text);
}
[data-theme="dark"] .md-content code:not(.hljs) { background: rgba(110,118,129,0.4); }
@media (prefers-color-scheme: light) {
  [data-theme="auto"] .md-content code:not(.hljs) { background: rgba(175,184,193,0.2); }
}
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] .md-content code:not(.hljs) { background: rgba(110,118,129,0.4); }
}

.md-content pre {
  margin: 0 !important;
  background: transparent !important;
  border: none !important;
}

.md-content .task-list-item {
  list-style: none;
}
.md-content .task-list-item input[type="checkbox"] {
  margin: 0 0.2em 0.25em -1.6em;
  vertical-align: middle;
}
.md-content .contains-task-list { padding-left: 0; }
.md-content .contains-task-list .contains-task-list { padding-left: 2em; }

.md-content > :first-child { margin-top: 0; }
.md-content > :last-child { margin-bottom: 0; }

/* ═══ Plain text ═══ */
.md-content .plain-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
}

.plain-text { /* standalone plain-text pre (not inside .md-content) */
  margin: 0;
  white-space: pre-wrap;
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  padding: 4px 0;
}

/* ═══════════════════════════════════════════════
 * 自定义动画（避免依赖未定义 Tailwind 类名）
 * ═══════════════════════════════════════════════ */

@keyframes tp-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes tp-zoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes tp-slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.tp-fade { animation: tp-fadeIn 0.2s var(--ease-out) both; }
.tp-zoom { animation: tp-zoomIn 0.25s var(--ease-out) both; }
.tp-slide-up { animation: tp-slideUp 0.35s var(--ease-out) both; }

/* ═══ Content area scrollbar ═══ */
.md-scroll::-webkit-scrollbar { width: 6px; }
.md-scroll::-webkit-scrollbar-track { background: transparent; }
.md-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.md-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
`;

/* ─────────────────────────────────────────────
 * 组件
 * ───────────────────────────────────────────── */

export default function TextPreview({
  path, onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fileName = path.split('/').pop() || '';
  const isMarkdown = path.toLowerCase().endsWith('.md');

  // ── 获取文件内容 ──
  const fetchContent = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setContent('');
    try {
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const url = fileUrl(path);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`加载失败 (${resp.status})`);
      const text = await resp.text();
      if (!controller.signal.aborted) {
        setContent(text);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('加载超时，请重试');
      } else {
        setError(e.message || '加载失败');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    fetchContent();
    return () => { abortRef.current?.abort(); };
  }, [fetchContent]);

  // ── 统计 ──
  const wordCount = content.trim() ? content.split(/[\s\n]+/).filter(Boolean).length : 0;
  const charCount = content.length;

  // ── 点击遮罩关闭 ──
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ── ESC 关闭 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── 复制按钮事件委托 ──
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-cb-copy]') as HTMLElement | null;
      if (!btn) return;
      const pre = btn.closest('.cb-wrap')?.querySelector('pre');
      if (!pre) return;
      const code = pre.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 2000);
      }).catch(() => {
        // clipboard 失败时降级选中
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pre);
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [content]);

  // ── 渲染 HTML ──
  const renderedHtml = useCallback(() => {
    if (!content || !isMarkdown) return '';
    try {
      return marked.parse(content) as string;
    } catch {
      return `<p class="text-danger">渲染失败</p>`;
    }
  }, [content, isMarkdown]);

  return (
    <>
      <style>{CODE_STYLES}</style>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm tp-fade"
        onClick={handleOverlayClick}
      >
        <div className="relative w-[92vw] max-w-4xl h-[88vh] bg-bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border/50 tp-zoom">
          {/* ── 标题栏 ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 bg-gradient-to-r from-bg-card via-bg-card to-bg-secondary/30">
            <div className="flex items-center gap-3 min-w-0">
              {/* 文件图标 */}
              <span className="shrink-0 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-sm">
                {isMarkdown ? (
                  <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 14h-2v-4l-2 3-2-3v4H9V7h2l2 3 2-3h2v9z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text truncate leading-tight">{fileName}</h3>
                {!loading && content && (
                  <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                    {wordCount} 词 · {charCount} 字
                    {isMarkdown && ' · Markdown'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                className="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-all active:scale-95"
                onClick={onClose}
                title="关闭 (Esc)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── 内容区 ── */}
          <div
            ref={contentRef}
            className="flex-1 min-h-0 overflow-y-auto px-10 py-8 md-scroll"
          >
            {/* 加载中 */}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="relative w-10 h-10">
                  <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                  <div className="absolute inset-[6px] rounded-full bg-accent/5 animate-pulse" />
                </div>
                <p className="text-sm text-text-muted animate-pulse">加载文件中...</p>
              </div>
            )}

            {/* 错误 */}
            {error && (
              <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm text-text font-medium mb-1">加载失败</p>
                  <p className="text-xs text-text-muted">{error}</p>
                </div>
                <button
                  className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-all active:scale-95 shadow-sm"
                  onClick={fetchContent}
                >
                  重试
                </button>
              </div>
            )}

            {/* 空内容 */}
            {!loading && !error && !content && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-14 h-14 rounded-full bg-bg-secondary flex items-center justify-center">
                  <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                  </svg>
                </div>
                <p className="text-sm text-text-muted">文件内容为空</p>
              </div>
            )}

            {/* 内容 */}
            {!loading && !error && content && (
              <div className="max-w-none tp-slide-up">
                {isMarkdown ? (
                  <div
                    className="md-content"
                    dangerouslySetInnerHTML={{ __html: renderedHtml() }}
                  />
                ) : (
                  <pre className="plain-text">{content}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
