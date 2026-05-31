import { useState, useRef, useCallback, useEffect } from 'react';
import { pipelineApi, dashboardApi, type PipelineConfig, type PipelineEvent, type PipelineSummary, type RunInfo } from '../../api/client';
import { useStore } from '../../stores';
import { useShallow } from 'zustand/react/shallow';
import ConfigPanel from './ConfigPanel';
import ProgressView from './ProgressView';
import SummaryPanel from './SummaryPanel';
import Loading from '../../components/Loading';
import HelpGuide from '../../components/ui/HelpGuide';

const PIPELINE_STEPS = [
  { id: 'health_check', label: '健康检查', desc: '验证各项配置与登录状态' },
  { id: 'fetch', label: '抓取帖子', desc: '搜索并获取目标帖子' },
  { id: 'download', label: '下载图片', desc: '并发下载并过滤水印' },
  { id: 'score', label: 'AI 评分', desc: '评估图片质量' },
  { id: 'generate', label: '生成内容', desc: 'AI 写作标题与正文' },
  { id: 'enqueue', label: '加入队列', desc: '纳入发布队列' },
  { id: 'publish', label: '发布', desc: '保存草稿或直接发布' },
];

export default function PipelinePage() {
  const {
    addToast, pipelineRunning, setPipelineRunning,
    pipelineEvents: events, pipelineCurrentStep: currentStep,
    pipelineStepProgress: stepProgress, pipelineSummary: summary,
    pipelineError: error, pipelineCheckpoint: checkpoint,
    pipelineDecisionReq: decisionReq, pipelineAbortController,
    setPipelineEvents, processPipelineEvent,
    setPipelineCurrentStep, setPipelineStepProgress,
    setPipelineSummary, setPipelineError,
    setPipelineCheckpoint, setPipelineDecisionReq, setPipelineAbortController,
    resetPipelineState,
  } = useStore(useShallow(s => ({
    addToast: s.addToast,
    pipelineRunning: s.pipelineRunning,
    setPipelineRunning: s.setPipelineRunning,
    pipelineEvents: s.pipelineEvents,
    pipelineCurrentStep: s.pipelineCurrentStep,
    pipelineStepProgress: s.pipelineStepProgress,
    pipelineSummary: s.pipelineSummary,
    pipelineError: s.pipelineError,
    pipelineCheckpoint: s.pipelineCheckpoint,
    pipelineDecisionReq: s.pipelineDecisionReq,
    pipelineAbortController: s.pipelineAbortController,
    setPipelineEvents: s.setPipelineEvents,
    processPipelineEvent: s.processPipelineEvent,
    setPipelineCurrentStep: s.setPipelineCurrentStep,
    setPipelineStepProgress: s.setPipelineStepProgress,
    setPipelineSummary: s.setPipelineSummary,
    setPipelineError: s.setPipelineError,
    setPipelineCheckpoint: s.setPipelineCheckpoint,
    setPipelineDecisionReq: s.setPipelineDecisionReq,
    setPipelineAbortController: s.setPipelineAbortController,
    resetPipelineState: s.resetPipelineState,
  })));

  const running = pipelineRunning;

  const eventsRef = useRef<PipelineEvent[]>([]);
  const [deciding, setDeciding] = useState(false);

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
    setPipelineRunning(true);
    setPipelineEvents([]);
    setPipelineCurrentStep(null);
    setPipelineStepProgress(null);
    setPipelineSummary(null);
    setPipelineError(null);
    setPipelineCheckpoint(null);
    eventsRef.current = [];

    const abort = new AbortController();
    setPipelineAbortController(abort);

    try {
      const result = await pipelineApi.run(config, (evt) => {
        eventsRef.current.push(evt);
        processPipelineEvent(evt);
      }, abort.signal);

      if (result) {
        setPipelineSummary(result);
        if (result.failed > 0) {
          addToast('流水线执行出错，请查看日志', 'error');
        } else {
          addToast('流水线执行完成', 'success');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addToast('流水线已取消', 'info');
        // 重置进度状态
        setPipelineCurrentStep(null);
        setPipelineStepProgress(null);
      } else {
        setPipelineError(err.message || '流水线执行失败');
        addToast(err.message || '流水线执行失败', 'error');
      }
    } finally {
      setPipelineRunning(false);
      setPipelineAbortController(null);
      loadHistory();
    }
  }, [addToast, loadHistory, setPipelineRunning, setPipelineEvents, setPipelineCurrentStep, setPipelineStepProgress, setPipelineSummary, setPipelineError, setPipelineCheckpoint, setPipelineDecisionReq, setPipelineAbortController, processPipelineEvent]);

  const handleCancel = useCallback(() => {
    if (pipelineAbortController) {
      pipelineAbortController.abort();
    }
  }, [pipelineAbortController]);

  const handleCheckpointConfirm = useCallback(async () => {
    if (!checkpoint) return;
    try {
      await pipelineApi.confirm(checkpoint.runId);
      setPipelineCheckpoint(null);
      addToast('已确认，继续发布', 'success');
    } catch (err: any) {
      addToast(err.message || '确认失败', 'error');
    }
  }, [checkpoint, addToast, setPipelineCheckpoint]);

  const handleCheckpointDeny = useCallback(async () => {
    if (!checkpoint) return;
    try {
      await pipelineApi.cancel(checkpoint.runId);
      setPipelineCheckpoint(null);
      addToast('已取消发布', 'info');
    } catch (err: any) {
      addToast(err.message || '取消失败', 'error');
    }
  }, [checkpoint, addToast, setPipelineCheckpoint]);

  const handleDecision = useCallback(async (optionId: string) => {
    if (!decisionReq || deciding) return;
    setDeciding(true);
    try {
      await pipelineApi.decide(decisionReq.runId, optionId);
      setPipelineDecisionReq(null);
      addToast(`已选择: ${optionId}`, 'success');
    } catch (err: any) {
      addToast(err.message || '提交决策失败', 'error');
    } finally {
      setDeciding(false);
    }
  }, [decisionReq, deciding, addToast, setPipelineDecisionReq]);

  const handleDecisionCancel = useCallback(async () => {
    if (!decisionReq || deciding) return;
    setDeciding(true);
    try {
      await pipelineApi.decide(decisionReq.runId, '');
      setPipelineDecisionReq(null);
      addToast('已跳过决策', 'info');
    } catch (err: any) {
      addToast(err.message || '跳过决策失败', 'error');
    } finally {
      setDeciding(false);
    }
  }, [decisionReq, deciding, addToast, setPipelineDecisionReq]);

  const handleRunAgain = useCallback(() => {
    resetPipelineState();
  }, [resetPipelineState]);

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

  const handleDeleteRun = useCallback(async (runId: string) => {
    if (!window.confirm('确定删除这条运行记录吗？')) return;
    try {
      await dashboardApi.deleteRun(runId);
      setHistory(prev => prev.filter(r => r.run_id !== runId));
      if (detailRun?.run_id === runId) closeDetail();
    } catch {
      // ignore
    }
  }, [detailRun, closeDetail]);

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

  const fmtDuration = (sec?: number) => {
    if (sec == null || sec <= 0) return '-';
    if (sec < 60) return `${sec.toFixed(0)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m${s}s`;
  };

  const statusColor = (s: string) => {
    if (s === 'completed') return 'bg-green-500';
    if (s === 'partial_failure') return 'bg-yellow-500';
    if (s === 'no_output') return 'bg-orange-500';
    return 'bg-blue-500';
  };
  const statusText = (s: string) => {
    if (s === 'completed') return '成功';
    if (s === 'partial_failure') return '部分失败';
    if (s === 'no_output') return '无产出';
    return '进行中';
  };

  const hasContent = running || summary || error || events.length > 0;

  return (
    <div className="py-6 px-4">
      <div className="flex gap-6 max-w-[1280px] mx-auto">
        {/* ── 主内容区 ── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-text tracking-tight flex items-center gap-2.5">
                <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                智能流水线
              </h1>
              <p className="text-sm text-text-muted mt-1">
                配置一次即可一键运行，AI 自动完成从内容发现到公众号发布的完整流程
              </p>
            </div>
            <HelpGuide title="智能流水线 — 使用说明">
              <p><b>1. 配置参数</b>：左侧面板设置平台、搜索模式、艺人/关键词等参数，与「图片发现」页面类似。</p>
              <p><b>2. 运行流水线</b>：点击「开始运行」后，系统自动执行 7 个步骤：健康检查 → 抓取帖子 → 下载图片 → AI 评分 → 生成内容 → 加入队列 → 发布。</p>
              <p><b>3. 实时进度</b>：运行过程中可查看当前步骤、进度百分比和详细日志。每个步骤完成后自动进入下一步。</p>
              <p><b>4. 决策节点</b>：流水线可能在关键节点暂停等待确认（如选择封面图），请留意黄色提示并做出选择。</p>
              <p><b>5. 查看结果</b>：运行完成后展示摘要（下载数、评分、生成文章数），可直接跳转到队列页查看结果。</p>
              <p><b>6. 运行历史</b>：下方「运行历史」记录每次流水线的执行情况，方便回溯和对比。</p>
            </HelpGuide>
          </div>

          {/* 可视化流程概览 */}
          <div className="card bg-gradient-to-br from-accent-softer/40 via-bg-card to-bg-card border-accent/10 relative">
            {/* 背景装饰 — 单独裁剪避免遮挡 tooltip */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[inherit]">
              <div className="absolute top-0 right-0 w-48 h-48 bg-accent/3 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            </div>
            <div className="relative">
              <div className="flex items-start justify-between gap-1">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.id} className="flex items-start gap-0 flex-1 min-w-0">
                    {/* 步骤卡片 */}
                    <div className="group relative flex-1 min-w-0">
                      <div className={`
                        flex flex-col items-center text-center px-1 py-2 rounded-xl
                        transition-all duration-200
                        ${i < 3 ? 'opacity-80' : 'opacity-50'}
                        hover:opacity-100 hover:bg-accent/5
                      `}>
                        {/* 图标圆 */}
                        <div className={`
                          w-8 h-8 rounded-xl flex items-center justify-center mb-1.5
                          transition-colors duration-200
                          ${i < 3 ? 'bg-accent/15 text-accent' : 'bg-bg-secondary text-text-muted'}
                          group-hover:bg-accent/20
                        `}>
                          {i === 0 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                          {i === 1 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                            </svg>
                          )}
                          {i === 2 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          )}
                          {i === 3 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          )}
                          {i === 4 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          )}
                          {i === 5 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
                            </svg>
                          )}
                          {i === 6 && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-text leading-tight line-clamp-1">{step.label}</span>
                      </div>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-bg-elevated shadow-lg border border-border text-[11px] text-text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {step.desc}
                      </div>
                    </div>
                    {/* 连接箭头 */}
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="flex items-center pt-3.5 px-0.5 shrink-0">
                        <svg className="w-4 h-4 text-accent/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M5 12h14" /><path d="m15 18 6-6-6-6" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Config Panel */}
          <ConfigPanel onRun={handleRun} onCancel={handleCancel} running={running} />

          {/* Progress */}
          <ProgressView events={events} currentStep={currentStep} stepProgress={stepProgress} />

          {/* Error */}
          {error && !running && !summary && (
            <div className="card border-red-500/30 bg-red-500/[0.03]">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500 shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-red-500">运行出错</div>
                  <p className="text-sm text-text-muted mt-1">{error}</p>
                  <button onClick={handleRunAgain} className="text-xs text-accent mt-2 hover:underline">
                    重新配置后再试
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          {summary && <SummaryPanel summary={summary} onRunAgain={handleRunAgain} />}

          {/* 启动中加载状态 */}
          {running && events.length === 0 && (
            <div className="card">
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loading size="sm" />
                <div className="text-center">
                  <div className="text-sm font-medium text-text">正在启动流水线...</div>
                  <div className="text-xs text-text-muted mt-0.5">正在初始化运行环境并验证配置</div>
                </div>
              </div>
            </div>
          )}

          {/* 空状态 — 引导式布局 */}
          {!hasContent && (
            <div className="card border-2 border-dashed border-border/60">
              <div className="text-center py-12 px-8">
                {/* 主图标 */}
                <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-accent/10 to-accent/5 flex items-center justify-center border border-accent/10">
                  <svg className="w-10 h-10 text-accent/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    <line x1="12" y1="2" x2="12" y2="17.77" />
                    <line x1="2" y1="9.27" x2="22" y2="9.27" />
                  </svg>
                </div>

                <h3 className="text-base font-bold text-text mb-2">开始你的智能流水线</h3>
                <p className="text-sm text-text-muted max-w-md mx-auto mb-8">
                  只需 3 步即可完成从内容发现到公众号发布的全自动化流程
                </p>

                {/* 引导步骤卡片 */}
                <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
                  {[
                    {
                      step: '1',
                      title: '配置参数',
                      desc: '选择数据平台、设置搜索目标和运行参数',
                      icon: (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                        </svg>
                      ),
                    },
                    {
                      step: '2',
                      title: '一键运行',
                      desc: '点击「启动流水线」，AI 自动完成发现到发布',
                      icon: (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      ),
                    },
                    {
                      step: '3',
                      title: '查看结果',
                      desc: '实时追踪进度，查看运行结果与处理明细',
                      icon: (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      ),
                    },
                  ].map((item) => (
                    <div key={item.step} className="bg-bg-secondary/50 rounded-xl p-4 border border-border/40 hover:border-accent/20 hover:bg-accent/5 transition-all duration-200">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-3">
                        {item.icon}
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">{item.step}</span>
                        <span className="text-sm font-semibold text-text">{item.title}</span>
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-6 border-t border-border/40 max-w-md mx-auto">
                  <div className="flex items-center justify-center gap-6 text-xs text-text-muted">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      多平台支持
                    </span>
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      AI 智能评分
                    </span>
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      一键发布
                    </span>
                  </div>
                </div>
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
                <button onClick={loadHistory} className="text-xs text-text-muted hover:text-text p-1 rounded hover:bg-bg-secondary" disabled={historyLoading} title="刷新">
                  <svg className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
              </div>
              {history.length === 0 ? (
                <div className="text-xs text-text-muted text-center py-8 px-4">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  暂无运行记录
                </div>
              ) : (
                <div className="space-y-1.5 px-2 pb-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {history.map((run) => {
                    const isActive = detailRun?.run_id === run.run_id;
                    const totalTokens = (run.prompt_tokens ?? 0) + (run.completion_tokens ?? 0);
                    return (
                      <button
                        key={run.run_id}
                        onClick={() => openDetail(run)}
                        className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${
                          isActive
                            ? 'bg-accent/10 ring-1 ring-accent/20'
                            : 'hover:bg-bg-secondary'
                        }`}
                      >
                        {/* 第一行：状态点 + 标题 + 操作 */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(run.status)}`} />
                          <div className="text-sm font-medium truncate text-text flex-1 min-w-0">{run.title || run.run_id}</div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {run.status === 'running' && (
                              <span
                                onClick={(e) => { e.stopPropagation(); handleContinueRun(run); }}
                                className="p-1 rounded-md hover:bg-accent/20 text-accent"
                                title="继续运行"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="6 3 20 12 6 21 6 3" />
                                </svg>
                              </span>
                            )}
                            <span
                              onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.run_id); }}
                              className="p-1 rounded-md hover:bg-red-500/15 text-text-muted hover:text-red-500"
                              title="删除记录"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        {/* 第二行：状态 + 时间 */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium ${
                            run.status === 'completed' ? 'text-green-600' :
                            run.status === 'partial_failure' ? 'text-yellow-600' :
                            run.status === 'no_output' ? 'text-orange-600' :
                            'text-blue-600'
                          }`}>
                            {statusText(run.status)}
                          </span>
                          {run.started_at && (
                            <span className="text-[11px] text-text-muted font-mono">{fmtTime(run.started_at)}</span>
                          )}
                        </div>

                        {/* 第三行：指标网格 */}
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className="bg-bg-secondary/60 rounded-lg px-2 py-1.5 text-center">
                            <div className="text-xs font-semibold text-text tabular-nums">{run.total_posts ?? run.processed}</div>
                            <div className="text-[10px] text-text-muted leading-tight">帖子</div>
                          </div>
                          <div className="bg-bg-secondary/60 rounded-lg px-2 py-1.5 text-center">
                            <div className="text-xs font-semibold text-green-600 tabular-nums">{run.published ?? (run.processed - run.failed)}</div>
                            <div className="text-[10px] text-text-muted leading-tight">入队</div>
                          </div>
                          <div className="bg-bg-secondary/60 rounded-lg px-2 py-1.5 text-center">
                            <div className={`text-xs font-semibold tabular-nums ${run.failed > 0 ? 'text-red-500' : 'text-text-muted'}`}>{run.failed}</div>
                            <div className="text-[10px] text-text-muted leading-tight">失败</div>
                          </div>
                          <div className="bg-bg-secondary/60 rounded-lg px-2 py-1.5 text-center">
                            <div className="text-xs font-semibold text-text-muted tabular-nums">{fmtDuration(run.elapsed_seconds)}</div>
                            <div className="text-[10px] text-text-muted leading-tight">耗时</div>
                          </div>
                        </div>

                        {/* Token 用量（可选） */}
                        {totalTokens > 0 && (
                          <div className="mt-1.5 text-[10px] text-text-muted text-right tabular-nums">
                            {totalTokens.toLocaleString()} tokens
                          </div>
                        )}
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

            {checkpoint.items && checkpoint.items.length > 0 && (
              <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                {checkpoint.items.map((item, i) => {
                  const isExpanded = expandedCheckpointItems.has(i);
                  const imgSrc = (path: string) =>
                    path.startsWith('http') ? `/proxy?url=${encodeURIComponent(path)}` : `/images/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
                  const images = item.image_list || (item.cover ? [item.cover] : []);
                  return (
                    <div key={i} className="border border-border rounded-xl p-3 bg-bg-secondary/30">
                      <div className="flex items-start gap-3">
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

            <div className="flex-1 overflow-y-auto min-h-0">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loading size="sm" />
                </div>
              ) : detailTab === 'overview' ? (
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold
                      ${detailRun.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                        detailRun.status === 'partial_failure' ? 'bg-yellow-500/20 text-yellow-500' :
                        detailRun.status === 'no_output' ? 'bg-orange-500/20 text-orange-500' :
                        'bg-blue-500/20 text-blue-500'}`}>
                      {detailRun.status === 'completed' ? '✓' :
                       detailRun.status === 'partial_failure' ? '⚠' :
                       detailRun.status === 'no_output' ? '○' : '⋯'}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-text">{statusText(detailRun.status)}</div>
                      <div className="text-xs text-text-muted mt-0.5 font-mono">{detailRun.run_id}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <StatBox label="帖子" value={detailRun.total_posts ?? detailRun.processed} color="text-accent" />
                    <StatBox label="入队" value={detailRun.published ?? (detailRun.processed - detailRun.failed)} color="text-green-500" />
                    <StatBox label="失败" value={detailRun.failed} color="text-red-500" />
                    <StatBox label="耗时" value={fmtDuration(detailRun.elapsed_seconds)} color="text-text-muted" />
                  </div>

                  {detailRun.started_at && (
                    <div className="text-xs text-text-muted flex gap-4 flex-wrap">
                      <span>开始时间: {fmtTimeFull(detailRun.started_at)}</span>
                      {detailTokens && (detailTokens.prompt + detailTokens.completion) > 0 && (
                        <span>Token: {(detailTokens.prompt + detailTokens.completion).toLocaleString()}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : detailTab === 'params' ? (
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
                              <tr key={`${i}-d`} className="bg-bg-secondary/30">
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

            <div className="px-6 py-3 border-t border-border flex items-center justify-between">
              <button onClick={() => detailRun && handleDeleteRun(detailRun.run_id)} className="btn btn-ghost text-sm text-red-500 hover:bg-red-500/10">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                删除
              </button>
              <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 text-center">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  );
}
