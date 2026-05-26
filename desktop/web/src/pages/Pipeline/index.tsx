import { useState, useRef, useCallback, useEffect } from 'react';
import { pipelineApi, dashboardApi, type PipelineConfig, type PipelineEvent, type PipelineSummary, type RunInfo } from '../../api/client';
import { useStore } from '../../stores';
import ConfigPanel from './ConfigPanel';
import ProgressView from './ProgressView';
import SummaryPanel from './SummaryPanel';

export default function PipelinePage() {
  const { addToast, setPipelineRunning } = useStore();

  // Pipeline state
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepProgress, setStepProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Checkpoint state
  const [checkpoint, setCheckpoint] = useState<{
    message: string;
    runId: string;
    items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }>;
  } | null>(null);

  // Decision request state (交互决策)
  const [decisionReq, setDecisionReq] = useState<{
    message: string;
    runId: string;
    options: Array<{ id: string; label: string }>;
    context?: Record<string, unknown>;
  } | null>(null);
  const [deciding, setDeciding] = useState(false);

  // Abort controller
  const abortRef = useRef<AbortController | null>(null);
  const eventsRef = useRef<PipelineEvent[]>([]);
  const mountedRef = useRef(true);

  // 组件卸载时自动中止流水线，防止 SSE 连接残留导致页面卡顿
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  // ── 运行历史 ──
  const [history, setHistory] = useState<RunInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const list = await dashboardApi.runs();
      setHistory(list);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRun = useCallback(async (config: PipelineConfig) => {
    setRunning(true);
    setPipelineRunning(true);
    setEvents([]);
    setCurrentStep(null);
    setStepProgress(null);
    setSummary(null);
    setError(null);
    setCheckpoint(null);
    eventsRef.current = [];

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await pipelineApi.run(config, (evt) => {
        if (!mountedRef.current) return;
        eventsRef.current = [...eventsRef.current, evt];
        setEvents(prev => [...prev, evt]);
        if (evt.type === 'step_start' && evt.step) setCurrentStep(evt.step);
        if (evt.type === 'step_error') setCurrentStep(evt.step);
        if (evt.type === 'step_progress' && evt.current !== undefined && evt.total !== undefined) {
          setStepProgress({ current: evt.current as number, total: evt.total as number });
        }
        if (evt.type === 'checkpoint_required') {
          setCheckpoint({
            message: (evt.message as string) || '确认发布？',
            runId: (evt.pipeline_run_id as string) || '',
            items: evt.items as Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }> | undefined,
          });
        }
        if (evt.type === 'step_error' && !evt.step) setError((evt.error as string) || '运行出错');
        if (evt.type === 'decision_required') {
          setDecisionReq({
            message: (evt.message as string) || '请做出选择',
            runId: (evt.pipeline_run_id as string) || '',
            options: (evt.options as Array<{ id: string; label: string }>) || [],
            context: evt.context as Record<string, unknown> | undefined,
          });
        }
      }, abort.signal);

      if (result) setSummary(result);
      addToast('流水线执行完成', 'success');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addToast('流水线已取消', 'info');
      } else {
        setError(err.message || '流水线执行失败');
        addToast(err.message || '流水线执行失败', 'error');
      }
    } finally {
      setRunning(false);
      setPipelineRunning(false);
      abortRef.current = null;
      loadHistory();
    }
  }, [addToast, loadHistory]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const handleCheckpointConfirm = useCallback(async () => {
    if (!checkpoint) return;
    try {
      await pipelineApi.confirm(checkpoint.runId);
      setCheckpoint(null);
      addToast('已确认，继续发布', 'success');
    } catch (err: any) {
      addToast(err.message || '确认失败', 'error');
    }
  }, [checkpoint, addToast]);

  const handleCheckpointDeny = useCallback(async () => {
    if (!checkpoint) return;
    try {
      await pipelineApi.cancel(checkpoint.runId);
      setCheckpoint(null);
      addToast('已取消发布', 'info');
    } catch (err: any) {
      addToast(err.message || '取消失败', 'error');
    }
  }, [checkpoint, addToast]);

  // ── 交互决策 ──
  const handleDecision = useCallback(async (optionId: string) => {
    if (!decisionReq || deciding) return;
    setDeciding(true);
    try {
      await pipelineApi.decide(decisionReq.runId, optionId);
      setDecisionReq(null);
      addToast(`已选择: ${optionId}`, 'success');
    } catch (err: any) {
      addToast(err.message || '提交决策失败', 'error');
    } finally {
      setDeciding(false);
    }
  }, [decisionReq, deciding, addToast]);

  const handleDecisionCancel = useCallback(async () => {
    if (!decisionReq || deciding) return;
    setDeciding(true);
    try {
      await pipelineApi.decide(decisionReq.runId, '');
      setDecisionReq(null);
      addToast('已跳过决策', 'info');
    } catch (err: any) {
      addToast(err.message || '跳过决策失败', 'error');
    } finally {
      setDeciding(false);
    }
  }, [decisionReq, deciding, addToast]);

  const handleRunAgain = useCallback(() => {
    setSummary(null);
    setError(null);
    setEvents([]);
    setCurrentStep(null);
    setStepProgress(null);
  }, []);

  // ── 历史详情弹窗 ──
  const [detailRun, setDetailRun] = useState<RunInfo | null>(null);
  const [detailEvents, setDetailEvents] = useState<Array<{ ts: string; event: string; payload: Record<string, unknown> }> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'params' | 'log'>('overview');
  const [detailTokens, setDetailTokens] = useState<{ prompt: number; completion: number } | null>(null);

  const openDetail = useCallback(async (run: RunInfo) => {
    setDetailRun(run);
    setDetailEvents(null);
    setDetailTokens(null);
    setDetailTab('overview');
    setDetailLoading(true);
    try {
      const data = await pipelineApi.detail(run.run_id);
      setDetailEvents(data.events);
      const finish = data.events.find(e => e.event === 'run_finished');
      const p = finish?.payload as Record<string, unknown> | undefined;
      if (p?.prompt_tokens || p?.completion_tokens) {
        setDetailTokens({ prompt: Number(p.prompt_tokens ?? 0), completion: Number(p.completion_tokens ?? 0) });
      }
    } catch {
      setDetailEvents([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailRun(null);
    setDetailEvents(null);
  }, []);

  // ── 继续运行（从历史记录恢复配置）──
  const handleContinueRun = useCallback((run: RunInfo) => {
    const p = run.payload as Record<string, unknown>;
    const config: PipelineConfig = {
      platform: (p.platform as string) || 'weibo',
      mode: (p.mode as string) || '',
      celebrities: Array.isArray(p.celebrities) ? p.celebrities as string[] : [],
      search_tags: Array.isArray(p.search_tags) ? p.search_tags as string[] : [],
      super_topics: Array.isArray(p.super_topics) ? p.super_topics as string[] : [],
      max_pages: (p.max_pages as number) ?? 2,
      post_limit: (p.post_limit as number) ?? 3,
      dry_run: (p.dry_run as boolean) ?? true,
      require_confirm: (p.require_confirm as boolean) ?? true,
      account_id: (p.account_id as string) || undefined,
      filter_watermark: (p.filter_watermark as boolean) ?? true,
      min_images_per_post: (p.min_images_per_post as number) ?? 5,
      ai_decision_mode: (p.ai_decision_mode as string) || 'auto',
    };
    closeDetail();
    handleRun(config);
  }, [closeDetail, handleRun]);

  // ── Checkpoint 展开 ──
  const [expandedCheckpointItems, setExpandedCheckpointItems] = useState<Set<number>>(new Set());
  const toggleCheckpointItem = (i: number) => {
    setExpandedCheckpointItems(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // ── 事件日志展开 ──
  const [expandedEventRows, setExpandedEventRows] = useState<Set<number>>(new Set());
  const toggleEventRow = (i: number) => {
    setExpandedEventRows(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // ── 时间格式化 ──
  const fmtTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const fmtTimeFull = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ── 状态颜色 by status ──
  const statusColor = (s: string) => {
    if (s === 'completed') return 'bg-green-500';
    if (s === 'partial_failure') return 'bg-yellow-500';
    return 'bg-blue-500';
  };
  const statusText = (s: string) => {
    if (s === 'completed') return '成功';
    if (s === 'partial_failure') return '部分失败';
    return '进行中';
  };

  return (
    <div className="py-6 px-4">
      <div className="flex gap-6 max-w-[1280px] mx-auto">
        {/* ── 主内容区 ── */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-lg font-bold text-text tracking-tight">智能流水线</h1>
            <p className="text-sm text-text-muted mt-1">
              AI 自动完成从发现到发布的完整流程，只需配置一次即可一键运行
            </p>
          </div>

          {/* Pipeline Flow Diagram */}
          <div className="card bg-accent-softer/30 border-accent/10">
            <div className="flex items-center justify-between text-xs text-text-muted">
              {['健康检查', '抓取帖子', '下载图片', 'AI 评分', '生成内容', '加入队列', '发布'].map((step, i) => (
                <div key={step} className="flex items-center gap-1">
                  <span className="hidden sm:inline">{step}</span>
                  <span className="sm:hidden">{step.slice(0, 2)}</span>
                  {i < 6 && <span className="text-accent/40 mx-1">→</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Config Panel */}
          <ConfigPanel onRun={handleRun} onCancel={handleCancel} running={running} />

          {/* Progress */}
          <ProgressView events={events} currentStep={currentStep} stepProgress={stepProgress} />

          {/* Error */}
          {error && !running && (
            <div className="card border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {/* Summary */}
          {summary && <SummaryPanel summary={summary} onRunAgain={handleRunAgain} />}

          {/* Inline loading state */}
          {running && events.length === 0 && (
            <div className="card">
              <div className="flex items-center justify-center py-8 gap-3">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">正在启动流水线...</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!running && !summary && !error && events.length === 0 && (
            <div className="card">
              <div className="text-center py-10 text-text-muted">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <p className="text-sm">配置上方参数后点击「启动流水线」</p>
                <p className="text-xs mt-1">AI 将自动完成从发现到发布的每一步</p>
              </div>
            </div>
          )}
        </div>

        {/* ── 历史侧边栏 ── */}
        <div className={`shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          historyExpanded ? 'w-80' : 'w-0'
        }`}>
          <div className="w-80">
            <div className="card p-0 overflow-hidden sticky top-6">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryExpanded(false)}
                    className="p-0.5 rounded hover:bg-bg-secondary text-text-muted hover:text-text transition-colors"
                    title="收起侧栏"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                  <span className="text-sm font-medium text-text">运行历史</span>
                </div>
                <button onClick={loadHistory} className="text-xs text-text-muted hover:text-text" disabled={historyLoading}>
                  {historyLoading ? '...' : '↻'}
                </button>
              </div>
              {history.length === 0 ? (
                <div className="text-xs text-text-muted text-center py-6 px-4">暂无运行记录</div>
              ) : (
                <div className="space-y-0.5 px-2 pb-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {history.map((run) => {
                    const isActive = detailRun?.run_id === run.run_id;
                    const totalTokens = (run.prompt_tokens ?? 0) + (run.completion_tokens ?? 0);
                    return (
                      <button
                        key={run.run_id}
                        onClick={() => openDetail(run)}
                        className={`w-full text-left p-3 rounded-lg transition-colors group ${
                          isActive ? 'bg-accent/10 text-accent' : 'hover:bg-bg-secondary text-text'
                        }`}
                      >
                        {/* Header: status + time */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(run.status)}`} />
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              run.status === 'completed' ? 'bg-green-500/10 text-green-600' :
                              run.status === 'partial_failure' ? 'bg-yellow-500/10 text-yellow-600' :
                              'bg-blue-500/10 text-blue-600'
                            }`}>
                              {statusText(run.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {run.started_at && (
                              <span className="text-[10px] text-text-muted/60 font-mono">{fmtTime(run.started_at)}</span>
                            )}
                            {run.status === 'running' && (
                              <span
                                onClick={(e) => { e.stopPropagation(); handleContinueRun(run); }}
                                className="p-1 rounded-md hover:bg-accent/20 text-accent transition-all"
                                title="继续运行"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="6 3 20 12 6 21 6 3" />
                                </svg>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <div className="text-sm font-medium text-text truncate mb-2">{run.title || run.run_id}</div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-4 gap-1">
                          <div className="bg-bg-secondary/50 rounded-md py-1.5 px-1 text-center">
                            <div className="text-xs font-semibold text-text">{run.processed}</div>
                            <div className="text-[10px] text-text-muted/70 leading-tight">处理</div>
                          </div>
                          <div className="bg-bg-secondary/50 rounded-md py-1.5 px-1 text-center">
                            <div className="text-xs font-semibold text-green-600">{run.processed - run.failed}</div>
                            <div className="text-[10px] text-text-muted/70 leading-tight">成功</div>
                          </div>
                          <div className="bg-bg-secondary/50 rounded-md py-1.5 px-1 text-center">
                            <div className={`text-xs font-semibold ${run.failed > 0 ? 'text-red-500' : 'text-text'}`}>{run.failed}</div>
                            <div className="text-[10px] text-text-muted/70 leading-tight">失败</div>
                          </div>
                          <div className="bg-bg-secondary/50 rounded-md py-1.5 px-1 text-center">
                            <div className="text-xs font-semibold text-text-muted">
                              {totalTokens > 0 ? totalTokens.toLocaleString() : '-'}
                            </div>
                            <div className="text-[10px] text-text-muted/70 leading-tight">Token</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 折叠后悬浮展开按钮 */}
        {!historyExpanded && (
          <button
            onClick={() => setHistoryExpanded(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-12 bg-bg-card border border-border rounded-l-lg flex items-center justify-center hover:bg-bg-secondary transition-colors shadow-sm"
            title="展开运行历史"
          >
            <svg className="w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Checkpoint 发布确认弹窗 ── */}
      {checkpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text">发布确认</div>
                <p className="text-xs text-text-muted mt-0.5 truncate">{checkpoint.message}</p>
              </div>
            </div>

            {/* 帖子列表 */}
            {checkpoint.items && checkpoint.items.length > 0 && (
              <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                {checkpoint.items.map((item, i) => {
                  const isExpanded = expandedCheckpointItems.has(i);
                  const imgSrc = (path: string) =>
                    path.startsWith('http') ? `/api/proxy/image?url=${encodeURIComponent(path)}` : `/api/images/${encodeURIComponent(path)}`;
                  const images = item.image_list || (item.cover ? [item.cover] : []);
                  return (
                    <div key={i} className="border border-border rounded-xl p-3 bg-bg-secondary/30">
                      <div className="flex items-start gap-3">
                        {/* Cover */}
                        {item.cover && (
                          <img
                            src={imgSrc(item.cover)}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover shrink-0 bg-bg-secondary"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-text truncate">{item.title || '无标题'}</div>
                          <div className="flex items-center gap-2 text-xs text-text-muted mt-1 flex-wrap">
                            {item.celebrity && <span>{item.celebrity}</span>}
                            <span>{item.images} 张图片</span>
                            {item.score !== undefined && item.score > 0 && (
                              <span className="text-yellow-500">{item.score} 分</span>
                            )}
                          </div>
                          {/* 图片预览缩略图 */}
                          {images.length > 1 && (
                            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                              {images.map((img, j) => (
                                <img
                                  key={j}
                                  src={imgSrc(img)}
                                  alt=""
                                  className="w-12 h-12 rounded-md object-cover shrink-0 bg-bg-secondary border border-border/50"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              ))}
                            </div>
                          )}
                          {item.desc && (
                            <>
                              <button
                                onClick={() => toggleCheckpointItem(i)}
                                className="text-xs text-accent mt-1 hover:underline"
                              >
                                {isExpanded ? '收起内容' : '查看内容'}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 text-xs text-text-muted leading-relaxed bg-bg-secondary rounded-lg p-2 max-h-32 overflow-y-auto">
                                  {item.desc}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 justify-end px-6 py-3 border-t border-border">
              <button onClick={handleCheckpointDeny} className="btn btn-ghost">取消发布</button>
              <button onClick={handleCheckpointConfirm} className="btn btn-primary">确认发布</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 交互决策弹窗 ── */}
      {decisionReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-bg-card rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text">AI 决策需要确认</div>
                <p className="text-xs text-text-muted mt-0.5">{decisionReq.message}</p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-2">
              {/* 帖子预览列表 */}
              {(() => {
                const posts = decisionReq.context?.posts as Array<{ index: number; text_preview: string; celebrity?: string; image_count?: number }> | undefined;
                return posts && posts.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 mb-3 border border-border rounded-xl p-2 bg-bg-secondary/30">
                    {posts.map((post) => (
                    <div key={post.index} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-bg-secondary text-xs">
                      <span className="text-text-muted/50 font-mono w-5 shrink-0 text-right">#{post.index}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-text-muted">
                          {post.celebrity && <span className="font-medium text-text">{post.celebrity}</span>}
                          {post.image_count !== undefined && <span>{post.image_count} 图</span>}
                        </div>
                        <div className="text-text-muted truncate mt-0.5">{post.text_preview || '无文本'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null;
              })()}
              {decisionReq.options.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleDecision(opt.id)}
                  disabled={deciding}
                  className="w-full text-left p-3 rounded-xl border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors text-sm text-text disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deciding ? '提交中...' : opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end px-6 py-3 border-t border-border">
              <button onClick={handleDecisionCancel} disabled={deciding} className="btn btn-ghost text-sm disabled:opacity-40">跳过</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 历史详情弹窗 ── */}
      {detailRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeDetail}>
          <div className="bg-bg-card rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border">
              <div>
                <div className="text-base font-bold text-text">运行详情</div>
                <div className="text-xs text-text-muted mt-0.5 font-mono">{detailRun.run_id}</div>
              </div>
              <button onClick={closeDetail} className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-muted">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-border">
              {([{ key: 'overview', label: '概览' }, { key: 'params', label: '参数' }, { key: 'log', label: '事件日志' }] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setDetailTab(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                    detailTab === tab.key
                      ? 'text-accent bg-accent/10 border-b-2 border-accent'
                      : 'text-text-muted hover:text-text hover:bg-bg-secondary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : detailTab === 'overview' ? (
                /* ── Tab 1: 概览 ── */
                <div className="p-6 space-y-5">
                  {/* Status hero */}
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold
                      ${detailRun.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                        detailRun.status === 'partial_failure' ? 'bg-yellow-500/20 text-yellow-500' :
                        'bg-blue-500/20 text-blue-500'}`}>
                      {detailRun.status === 'completed' ? '✓' :
                       detailRun.status === 'partial_failure' ? '⚠' : '⋯'}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-text">{statusText(detailRun.status)}</div>
                      <div className="text-xs text-text-muted mt-0.5 font-mono">{detailRun.run_id}</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-4 gap-3">
                    <StatBox label="处理帖子" value={detailRun.processed} color="text-accent" />
                    <StatBox label="成功" value={detailRun.processed - detailRun.failed} color="text-green-500" />
                    <StatBox label="失败" value={detailRun.failed} color="text-red-500" />
                    {detailTokens && (
                      <StatBox label="Token" value={`${(detailTokens.prompt + detailTokens.completion).toLocaleString()}`} color="text-text-muted" />
                    )}
                  </div>

                  {/* Time info */}
                  {detailRun.started_at && (
                    <div className="text-xs text-text-muted flex gap-4 flex-wrap">
                      <span>开始时间: {fmtTimeFull(detailRun.started_at)}</span>
                    </div>
                  )}
                </div>
              ) : detailTab === 'params' ? (
                /* ── Tab 2: 参数 ── */
                <div className="p-6">
                  {(() => {
                    const startedEvent = detailEvents?.find(e => e.event === 'run_started');
                    const p = startedEvent?.payload as Record<string, unknown> | undefined;
                    if (!p) return <div className="text-xs text-text-muted text-center py-4">暂无参数数据</div>;
                    const fields: { label: string; value: string }[] = [
                      { label: '数据平台', value: String(p.platform || '') },
                      { label: '抓取模式', value: String(p.mode || '') },
                      { label: '艺人 / 关键词', value: Array.isArray(p.celebrities) ? (p.celebrities as string[]).join(', ') : String(p.celebrities || '') },
                      { label: '搜索标签', value: Array.isArray(p.search_tags) ? (p.search_tags as string[]).join(', ') : String(p.search_tags || '') },
                      { label: '超话', value: Array.isArray(p.super_topics) ? (p.super_topics as string[]).join(', ') : String(p.super_topics || '') },
                      { label: '翻页数', value: String(p.max_pages ?? '') },
                      { label: '处理条数', value: String(p.post_limit ?? '') },
                      { label: '图片最低限制', value: String(p.min_images_per_post ?? '') },
                      { label: '试运行', value: p.dry_run ? '是' : '否' },
                      { label: '发布前确认', value: p.require_confirm ? '是' : '否' },
                      { label: '过滤水印', value: p.filter_watermark ? '是' : '否' },
                    ];
                    return (
                      <table className="w-full text-xs">
                        <tbody>
                          {fields.map((f, i) => (
                            <tr key={i} className="border-b border-border/30">
                              <td className="py-2 pr-4 text-text-muted whitespace-nowrap w-28 align-top">{f.label}</td>
                              <td className="py-2 text-text break-all">{f.value || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              ) : (
                /* ── Tab 3: 事件日志 ── */
                <div className="p-4">
                  {detailEvents && detailEvents.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-text-muted border-b border-border">
                          <th className="text-left py-1.5 pr-2 w-8">#</th>
                          <th className="text-left py-1.5 pr-2 w-36">时间</th>
                          <th className="text-left py-1.5 pr-2 w-24">事件</th>
                          <th className="text-left py-1.5 pr-2">摘要</th>
                          <th className="text-left py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailEvents.map((evt, i) => {
                          const p = evt.payload as Record<string, unknown>;
                          const summaryText = p?.reasoning || p?.decision || p?.message || p?.error || p?.status || '';
                          const displaySummary = typeof summaryText === 'string' ? summaryText.slice(0, 80) : '';
                          const isExpanded = expandedEventRows.has(i);
                          const eventColor =
                            evt.event === 'run_started' ? 'text-accent' :
                            evt.event === 'run_finished' ? 'text-green-500' :
                            evt.event === 'step_complete' ? 'text-green-500' :
                            evt.event === 'step_error' ? 'text-red-500' :
                            evt.event === 'cancelled' ? 'text-red-500' :
                            evt.event === 'agent_decision' ? 'text-yellow-500' :
                            'text-text-muted';
                          const eventLabel: string = ({
                            run_started: '运行开始',
                            run_finished: '运行结束',
                            step_start: '步骤开始',
                            step_complete: '步骤完成',
                            step_error: '步骤出错',
                            step_progress: '步骤进度',
                            agent_decision: 'AI 决策',
                            completed: '完成',
                            cancelled: '已取消',
                            checkpoint_required: '等待确认',
                          } as Record<string, string>)[evt.event] || evt.event;
                          return (
                            <>
                            <tr key={i} className="border-b border-border/20 hover:bg-bg-secondary/30">
                              <td className="py-1.5 pr-2 text-text-muted/50 align-top">{i + 1}</td>
                              <td className="py-1.5 pr-2 text-text-muted/60 font-mono align-top whitespace-nowrap">
                                {evt.ts.replace('T', ' ').slice(0, 19)}
                              </td>
                              <td className="py-1.5 pr-2 align-top">
                                <span className={`font-medium ${eventColor}`}>{eventLabel}</span>
                              </td>
                              <td className="py-1.5 pr-2 text-text-muted align-top truncate max-w-[200px]">
                                {displaySummary}
                              </td>
                              <td className="py-1.5 align-top">
                                <button
                                  onClick={() => toggleEventRow(i)}
                                  className="p-0.5 rounded hover:bg-bg-secondary text-text-muted/40 hover:text-text-muted"
                                >
                                  <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${i}-detail`} className="bg-bg-secondary/30">
                                <td colSpan={5} className="py-2 px-3">
                                  <pre className="text-xs text-text-muted leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono">
                                    {JSON.stringify(p, null, 2)}
                                  </pre>
                                </td>
                              </tr>
                            )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-xs text-text-muted text-center py-4">暂无事件数据</div>
                  )}
                </div>
              )}
            </div>

            {/* Close button */}
            <div className="px-6 py-3 border-t border-border flex items-center justify-between">
              <button onClick={() => detailRun && handleContinueRun(detailRun)} className="btn btn-primary text-sm" disabled={running}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
                重新运行
              </button>
              <button onClick={closeDetail} className="btn btn-ghost text-sm">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  );
}
