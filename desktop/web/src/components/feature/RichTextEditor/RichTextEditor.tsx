import { useState, useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { marked } from 'marked';
import { tiptapToPlain, plainToTiptap } from './utils';
import './RichTextEditor.less';

interface RichTextEditorProps {
  value: object;
  onChange: (doc: object) => void;
  placeholder?: string;
  minHeight?: number;
}

type ViewMode = 'edit' | 'preview' | 'split';

export { tiptapToPlain, plainToTiptap };

// ── CodeMirror theme ───────────────────────────────────────────────────────────
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '16px',
    fontFamily: 'inherit',
    color: 'var(--text)',
    backgroundColor: 'var(--bg-card)',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '14px 16px',
    lineHeight: '1.7',
    minHeight: '480px',
  },
  '.cm-focused .cm-content': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', minHeight: '480px' },
  '.cm-placeholder': { color: 'var(--text-muted)' },
  '.cm-line': { padding: '0 0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': { display: 'none' },
});

// ── Toolbar helper: insert/remove markdown syntax around selection ───────────────
function wrapSelection(view: EditorView, before: string, after: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (selected.startsWith(before) && selected.endsWith(after)) {
    view.dispatch({ changes: { from, to, insert: selected.slice(before.length, selected.length - after.length) } });
  } else {
    view.dispatch({ changes: { from, to, insert: `${before}${selected}${after}` } });
  }
}

function prependLine(view: EditorView, prefix: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineText = view.state.sliceDoc(line.from, line.to);
  if (lineText.startsWith(prefix)) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: lineText.slice(prefix.length) },
      selection: { anchor: from - prefix.length },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: `${prefix}${lineText}` },
      selection: { anchor: from + prefix.length },
    });
  }
}

function insertLines(view: EditorView, before: string, after: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const lineText = view.state.sliceDoc(line.from, line.to);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: `${before}${lineText}${after}` },
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '开始写作…',
  minHeight = 480,
}: RichTextEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [plainText, setPlainText] = useState('');
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const scrollSyncLock = useRef<'editor' | 'preview' | null>(null);
  const scrollSyncTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync external Tiptap JSON value → CodeMirror
  useEffect(() => {
    const text = tiptapToPlain(value);
    if (text !== plainText) {
      setPlainText(text);
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: text.length },
        });
        // 打字机型内容更新时自动滚动到底部
        requestAnimationFrame(() => {
          const scroller = editorContainerRef.current?.querySelector('.cm-scroller') as HTMLElement | null;
          if (scroller) {
            scroller.scrollTop = scroller.scrollHeight;
          }
        });
      }
    }
  }, [value]);

  // Mount CodeMirror once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString();
        setPlainText(text);
        onChange(plainToTiptap(text));
      }
    });

    const state = EditorState.create({
      doc: plainText,
      extensions: [
        history(),
        markdown({ base: markdownLanguage }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        editorTheme,
        cmPlaceholder(placeholder),
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { minHeight: `${minHeight}px` },
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorContainerRef.current! });
    (window as any).__cm = view;
    editorViewRef.current = view;

    return () => {
      initializedRef.current = false;
      view.destroy();
      editorViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll sync between editor and preview
  useEffect(() => {
    if (viewMode !== 'split') return;

    const editorScroller = editorContainerRef.current?.querySelector('.cm-scroller') as HTMLElement | null;
    const previewPane = previewPaneRef.current;
    if (!editorScroller || !previewPane) return;

    const acquireLock = (who: 'editor' | 'preview') => {
      clearTimeout(scrollSyncTimer.current);
      scrollSyncLock.current = who;
      scrollSyncTimer.current = setTimeout(() => { scrollSyncLock.current = null; }, 80);
    };

    const onEditorScroll = () => {
      if (scrollSyncLock.current === 'preview') return;
      acquireLock('editor');
      const ratio = editorScroller.scrollTop / (editorScroller.scrollHeight - editorScroller.clientHeight || 1);
      previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
    };

    const onPreviewScroll = () => {
      if (scrollSyncLock.current === 'editor') return;
      acquireLock('preview');
      const ratio = previewPane.scrollTop / (previewPane.scrollHeight - previewPane.clientHeight || 1);
      editorScroller.scrollTop = ratio * (editorScroller.scrollHeight - editorScroller.clientHeight);
    };

    editorScroller.addEventListener('scroll', onEditorScroll, { passive: true });
    previewPane.addEventListener('scroll', onPreviewScroll, { passive: true });

    return () => {
      clearTimeout(scrollSyncTimer.current);
      editorScroller.removeEventListener('scroll', onEditorScroll);
      previewPane.removeEventListener('scroll', onPreviewScroll);
    };
  }, [viewMode]);

  // Rendered HTML for preview pane（所有链接在新窗口打开）
  const htmlPreview = (() => {
    try {
      let html = marked.parse(plainText, { breaks: true, gfm: true }) as string;
      // 给所有 <a> 标签添加 target="_blank" 和 rel="noopener noreferrer"
      html = html.replace(/<a\s+(?![\s\S]*?target=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
      return html;
    } catch {
      return '';
    }
  })();

  const wordCount = plainText.replace(/\s/g, '').length;
  const charCount = plainText.length;

  const [linkInput, setLinkInput] = useState<{ url: string } | null>(null);

  // Force CodeMirror to re-layout (used after fullscreen toggle)
  const refreshEditor = useCallback(() => {
    const view = editorViewRef.current;
    if (view) {
      requestAnimationFrame(() => view.requestMeasure());
    }
  }, []);

  // Exit fullscreen on Escape (only when link input is not open)
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !linkInput) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, linkInput]);

  // Re-layout CodeMirror when fullscreen changes
  useEffect(() => {
    refreshEditor();
  }, [isFullscreen, refreshEditor]);

  const run = useCallback((fn: (view: EditorView) => void) => {
    const view = editorViewRef.current;
    if (view) fn(view);
  }, []);

  const ToolbarButton = ({
    onClick,
    active,
    title,
    className,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <button type="button" onClick={onClick} title={title} className={`rte-toolbar-btn${active ? ' active' : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </button>
  );

  return (
    <div className={`rte-wrapper${isFullscreen ? ' fullscreen' : ''}`} style={isFullscreen ? undefined : { minHeight }}>
      {/* Toolbar */}
      <div className="rte-toolbar">
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4, alignSelf: 'center', flexShrink: 0 }}>Markdown</span>
        <div className="rte-divider" />

        {/* Heading */}
        <ToolbarButton onClick={() => run((v) => prependLine(v, '# '))} active={false} title="标题 1">H1</ToolbarButton>
        <ToolbarButton onClick={() => run((v) => prependLine(v, '## '))} active={false} title="标题 2">H2</ToolbarButton>
        <ToolbarButton onClick={() => run((v) => prependLine(v, '### '))} active={false} title="标题 3">H3</ToolbarButton>

        <div className="rte-divider" />

        {/* Inline formatting */}
        <ToolbarButton onClick={() => run((v) => wrapSelection(v, '**', '**'))} active={false} title="粗体"><strong>B</strong></ToolbarButton>
        <ToolbarButton onClick={() => run((v) => wrapSelection(v, '*', '*'))} active={false} title="斜体"><em>I</em></ToolbarButton>
        <ToolbarButton onClick={() => run((v) => wrapSelection(v, '~~', '~~'))} active={false} title="删除线"><s>S</s></ToolbarButton>

        <div className="rte-divider" />

        {/* Lists & quote */}
        <ToolbarButton onClick={() => run((v) => prependLine(v, '- '))} active={false} title="无序列表">•</ToolbarButton>
        <ToolbarButton onClick={() => run((v) => prependLine(v, '1. '))} active={false} title="有序列表">1.</ToolbarButton>
        <ToolbarButton onClick={() => run((v) => prependLine(v, '> '))} active={false} title="引用">❝</ToolbarButton>

        <div className="rte-divider" />

        {/* Link */}
        <ToolbarButton
          onClick={() => setLinkInput({ url: '' })}
          active={false}
          title="链接"
        >
          🔗
        </ToolbarButton>

        <div className="rte-divider" style={{ marginLeft: 'auto' }} />

        {/* View modes */}
        <ToolbarButton onClick={() => setViewMode('edit')} active={viewMode === 'edit'} title="纯编辑" className="rte-toolbar-icon">✏</ToolbarButton>
        <ToolbarButton onClick={() => setViewMode('preview')} active={viewMode === 'preview'} title="纯预览" className="rte-toolbar-icon">👁</ToolbarButton>
        <ToolbarButton onClick={() => setViewMode('split')} active={viewMode === 'split'} title="分屏" className="rte-toolbar-icon">⫿</ToolbarButton>

        <div className="rte-divider" />

        {/* Fullscreen toggle */}
        <ToolbarButton
          onClick={() => setIsFullscreen((prev) => !prev)}
          active={isFullscreen}
          title={isFullscreen ? '退出全屏 (Esc)' : '全屏编辑'}
          className="rte-toolbar-icon"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </ToolbarButton>
      </div>

      {/* Link input bar */}
      {linkInput !== null && (
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border-b border-border">
          <span className="text-xs text-text-muted shrink-0">链接地址：</span>
          <input
            type="text"
            autoFocus
            value={linkInput.url}
            onChange={e => setLinkInput({ url: e.target.value })}
            placeholder="https://..."
            className="flex-1 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && linkInput.url) {
                run((v) => wrapSelection(v, '[', `](${linkInput.url})`));
                setLinkInput(null);
              }
              if (e.key === 'Escape') setLinkInput(null);
            }}
          />
          <button className="btn btn-sm btn-primary" disabled={!linkInput.url} onClick={() => {
            if (linkInput.url) {
              run((v) => wrapSelection(v, '[', `](${linkInput.url})`));
              setLinkInput(null);
            }
          }}>确认</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setLinkInput(null)}>取消</button>
        </div>
      )}

      {/* Content area */}
      <div className="rte-content-area">
        {/* Editor pane — always in DOM */}
        <div
          className="rte-editor-pane"
          style={{
            display: viewMode === 'preview' ? 'none' : 'flex',
            flex: 1,
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div ref={editorContainerRef} style={{ flex: 1, overflow: 'hidden' }} />
        </div>

        {/* Preview pane */}
        {viewMode !== 'edit' && (
          <div className="rte-preview-pane" ref={previewPaneRef}>
            <div className="rte-preview-content" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="rte-status-bar">
        <span>{wordCount} 字 / {charCount} 字符</span>
      </div>

    </div>
  );
}