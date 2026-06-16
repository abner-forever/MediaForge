import { useRef, useCallback, useEffect } from 'react';
import { effectsApi } from '../../api/client';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useStore } from '../../stores';
import type { AiAnalysisEvent } from '../../types';

type Status = 'idle' | 'streaming' | 'done' | 'error';

/** 简单 Markdown 渲染：粗体、标题、列表 */
function renderMarkdown(text: string): string {
  return (
    text
      // 标题 ## / ###
      .replace(
        /^### (.+)$/gm,
        '<h4 style="font-size:14px;font-weight:700;color:var(--text);margin:16px 0 8px">$1</h4>',
      )
      .replace(
        /^## (.+)$/gm,
        '<h3 style="font-size:15px;font-weight:700;color:var(--text);margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)">$1</h3>',
      )
      // 粗体
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
      // 列表项
      .replace(
        /^- (.+)$/gm,
        '<div style="display:flex;gap:8px;margin:4px 0"><span style="color:var(--accent);flex-shrink:0">-</span><span>$1</span></div>',
      )
      // 换行
      .replace(/\n\n/g, '<div style="height:8px"></div>')
      .replace(/\n/g, '')
  );
}

export default function AiAnalysis({ days }: { days: number }) {
  const [status, setStatus] = usePersistedState<Status>(`ai-analysis-status-${days}`, 'idle');
  const [content, setContent] = usePersistedState(`ai-analysis-content-${days}`, '');
  const [error, setError] = usePersistedState(`ai-analysis-error-${days}`, '');
  const [expanded, setExpanded] = usePersistedState(`ai-analysis-expanded-${days}`, true);
  const abortRef = useRef<AbortController | null>(null);
  const registerTask = useStore((s) => s.registerTask);
  const unregisterTask = useStore((s) => s.unregisterTask);

  // 注册/注销进行中的任务
  useEffect(() => {
    if (status === 'streaming') {
      registerTask('AI 智能分析');
    } else {
      unregisterTask('AI 智能分析');
    }
  }, [status, registerTask, unregisterTask]);

  // 缓存状态为 streaming 说明中途离开了页面，重置为 idle
  useEffect(() => {
    if (status === 'streaming') setStatus('idle');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = useCallback(async () => {
    // 如果正在流式输出，点击则取消
    if (status === 'streaming') {
      abortRef.current?.abort();
      setStatus('idle');
      return;
    }

    setStatus('streaming');
    setContent('');
    setError('');
    setExpanded(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await effectsApi.aiAnalysis(
        days,
        (evt: AiAnalysisEvent) => {
          if (evt.type === 'token' && evt.content) {
            setContent((prev) => prev + evt.content);
          } else if (evt.type === 'done') {
            setStatus('done');
          } else if (evt.type === 'error') {
            setStatus('error');
            setError(evt.message || '分析失败');
          }
        },
        controller.signal,
      );
      // 流正常结束但没有 done 事件时也标记完成
      setStatus((prev) => (prev === 'streaming' ? 'done' : prev));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('error');
      setError(err instanceof Error ? err.message : '请求失败');
    }
  }, [days, status]);

  const buttonLabel = status === 'streaming' ? '停止分析' : content ? '重新分析' : '生成分析';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* AI 图标 */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7868d0, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
              <path d="M8 6a4 4 0 0 1 8 0" />
              <path d="M6 12a6 6 0 0 0 12 0" />
              <circle cx="12" cy="12" r="1" />
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>智能分析</span>
          {status === 'streaming' && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>分析中...</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleAnalyze}
            className="btn btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              background: status === 'streaming' ? 'var(--danger)' : undefined,
              color: status === 'streaming' ? '#fff' : undefined,
            }}
          >
            {status === 'streaming' ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {buttonLabel}
          </button>
          {content && (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-muted)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{
                  transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 内容区 */}
      {expanded && (content || status === 'streaming' || error) && (
        <div
          style={{
            padding: '16px 20px',
            minHeight: status === 'streaming' && !content ? 60 : undefined,
          }}
        >
          {error ? (
            <div style={{ fontSize: 13, color: 'var(--danger)', padding: '8px 0' }}>{error}</div>
          ) : content ? (
            <div
              style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : status === 'streaming' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              正在分析数据，请稍候...
            </div>
          ) : null}
          {/* 流式输出光标 */}
          {status === 'streaming' && content && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 14,
                background: 'var(--accent)',
                marginLeft: 2,
                animation: 'blink 1s infinite',
                verticalAlign: 'text-bottom',
              }}
            />
          )}
        </div>
      )}

      {/* 空闲状态提示 */}
      {status === 'idle' && !content && (
        <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
          点击「生成分析」，AI 将从内容策略、发布时段、互动率等维度给出运营建议
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
