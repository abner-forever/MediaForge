import { useState, useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { marked } from 'marked';

interface RichTextEditorProps {
  value: object;
  onChange: (doc: object) => void;
  placeholder?: string;
  minHeight?: number;
}

type ViewMode = 'edit' | 'preview' | 'split';

// Tiptap JSON → plain text for API storage
function tiptapToPlain(doc: object): string {
  try {
    const d = doc as {
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
        content?: Array<{
          type?: string;
          text?: string;
          marks?: Array<{ type?: string }>;
        }>;
      }>;
    };
    if (!d || d.type !== 'doc' || !Array.isArray(d.content)) return '';
    return d.content
      .map((node) => {
        if (node.type === 'paragraph' || node.type === 'heading') {
          return (node.content || []).map((c) => c.text || '').join('');
        }
        return '';
      })
      .join('\n');
  } catch {
    return '';
  }
}

// plain text from API → Tiptap JSON doc
function plainToTiptap(text: string): object {
  if (!text) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const lines = text.split(/\n/);
  if (lines.length === 1 && lines[0] === '') {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

function textToTiptap(text: string): object {
  return plainToTiptap(text);
}

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
  const [plainText, setPlainText] = useState('');
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const initializedRef = useRef(false);

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
        onChange(textToTiptap(text));
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

  // Rendered HTML for preview pane
  const htmlPreview = (() => {
    try {
      return marked.parse(plainText, { breaks: true, gfm: true }) as string;
    } catch {
      return '';
    }
  })();

  const wordCount = plainText.replace(/\s/g, '').length;
  const charCount = plainText.length;

  const [linkInput, setLinkInput] = useState<{ url: string } | null>(null);

  const run = useCallback((fn: (view: EditorView) => void) => {
    const view = editorViewRef.current;
    if (view) fn(view);
  }, []);

  const ToolbarButton = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button type="button" onClick={onClick} title={title} className={`rte-toolbar-btn${active ? ' active' : ''}`}>
      {children}
    </button>
  );

  return (
    <div className="rte-wrapper" style={{ minHeight }}>
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
        <ToolbarButton onClick={() => setViewMode('edit')} active={viewMode === 'edit'} title="纯编辑">✏</ToolbarButton>
        <ToolbarButton onClick={() => setViewMode('preview')} active={viewMode === 'preview'} title="纯预览">👁</ToolbarButton>
        <ToolbarButton onClick={() => setViewMode('split')} active={viewMode === 'split'} title="分屏">⫿</ToolbarButton>
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
          <div className="rte-preview-pane">
            <div className="rte-preview-content" dangerouslySetInnerHTML={{ __html: htmlPreview }} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="rte-status-bar">
        <span>{wordCount} 字 / {charCount} 字符</span>
      </div>

      <style>{`
        .rte-wrapper {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-card);
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .rte-wrapper:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-soft);
        }
        .rte-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 2px;
          padding: 6px 8px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          align-items: center;
          flex-shrink: 0;
        }
        .rte-toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.15s;
          padding: 0;
        }
        .rte-toolbar-btn:hover {
          background: var(--bg-inset);
          color: var(--text);
        }
        .rte-toolbar-btn.active {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .rte-divider {
          width: 1px;
          height: 20px;
          background: var(--border);
          margin: 0 4px;
          flex-shrink: 0;
        }
        .rte-content-area {
          display: flex;
          flex: 1;
          overflow: hidden;
          min-height: 0;
          min-width: 0;
        }
        .rte-editor-pane {
          flex: 1;
          overflow: hidden;
          min-width: 0;
          background: var(--bg-card);
          flex-direction: column;
          min-height: 0;
        }
        .rte-editor-pane .cm-editor {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .rte-editor-pane .cm-scroller {
          flex: 1;
          overflow: auto;
          min-height: 0;
        }
        .rte-preview-pane {
          flex: 1;
          overflow-y: auto;
          border-left: 1px solid var(--border-subtle);
          padding: 14px 16px;
          font-size: 16px;
          line-height: 1.7;
          color: var(--text);
          min-width: 0;
          background: var(--bg-card);
          min-height: 0;
          height: 100%;
        }
        .rte-preview-content h1 { font-size: 1.75em; font-weight: 700; margin: 1em 0 0.5em; line-height: 1.3; color: var(--text); }
        .rte-preview-content h2 { font-size: 1.4em; font-weight: 600; margin: 0.8em 0 0.4em; line-height: 1.3; color: var(--text); }
        .rte-preview-content h3 { font-size: 1.15em; font-weight: 600; margin: 0.6em 0 0.3em; line-height: 1.3; color: var(--text); }
        .rte-preview-content p { margin: 0 0 0.75em; }
        .rte-preview-content p:last-child { margin-bottom: 0; }
        .rte-preview-content ul { list-style: disc; padding-left: 1.5em; margin: 0 0 0.75em; }
        .rte-preview-content ol { list-style: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }
        .rte-preview-content li { margin: 0.25em 0; }
        .rte-preview-content li > p { margin: 0; }
        .rte-preview-content blockquote { border-left: 3px solid var(--accent); padding-left: 1em; color: var(--text-secondary); margin: 0.75em 0; }
        .rte-preview-content a { color: var(--accent); text-decoration: underline; }
        .rte-preview-content code { background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .rte-preview-content pre { background: var(--bg-secondary); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 0.75em 0; }
        .rte-preview-content pre code { background: none; padding: 0; }
        .rte-preview-content hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
        .rte-preview-content strong { font-weight: 700; }
        .rte-preview-content em { font-style: italic; }
        .rte-preview-content s { text-decoration: line-through; }
        .rte-status-bar {
          display: flex;
          justify-content: flex-end;
          padding: 4px 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: 11px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}