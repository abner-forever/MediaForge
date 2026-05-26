import { useRef, useEffect, useMemo } from 'react';
import type { PipelineEvent } from '../../api/client';

const STEP_ORDER = [
  'health_check',
  'fetch',
  'download',
  'score',
  'generate',
  'enqueue',
  'publish',
] as const;

const STEP_LABELS: Record<string, string> = {
  health_check: '健康检查',
  fetch: '抓取帖子',
  download: '下载图片',
  score: 'AI 评分',
  generate: '生成内容',
  enqueue: '加入队列',
  publish: '发布',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  health_check: '验证配置与平台登录状态',
  fetch: '从各平台搜索并获取帖子',
  download: '下载图片并检测水印',
  score: '使用 AI 评估图片质量',
  generate: 'AI 生成标题与正文',
  enqueue: '将内容加入发布队列',
  publish: '保存草稿或发布到公众号',
};

interface StepState {
  status: 'pending' | 'active' | 'done' | 'error' | 'skipped';
  reasoning: string;
  progress: { current: number; total: number } | null;
  decision: string;
}

export default function ProgressView({
  events,
  currentStep,
  stepProgress,
}: {
  events: PipelineEvent[];
  currentStep: string | null;
  stepProgress: { current: number; total: number } | null;
}) {
  const steps = buildStepStates(events, currentStep, stepProgress);
  const completedCount = Object.values(steps).filter(s => s.status === 'done' || s.status === 'error' || s.status === 'skipped').length;
  const totalSteps = STEP_ORDER.length;
  const overallPercent = Math.round((completedCount / totalSteps) * 100);

  if (!currentStep && events.length === 0) return null;

  return (
    <div className="card space-y-5">
      <div className="section-header">运行进度</div>

      {/* 全局进度条 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">整体进度</span>
          <span className="text-text-muted font-medium">{completedCount}/{totalSteps} 步骤</span>
        </div>
        <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* 步骤时间线 */}
      <div className="space-y-0">
        {STEP_ORDER.map((stepId, idx) => {
          const state = steps[stepId];
          if (!state) return null;

          const isLast = idx === STEP_ORDER.length - 1;
          const isDone = state.status === 'done';
          const isActive = state.status === 'active';
          const isError = state.status === 'error';
          const isPending = state.status === 'pending';
          const isSkipped = state.status === 'skipped';

          return (
            <div key={stepId} className="flex gap-4 group">
              {/* 时间线节点与连线 */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
                <div className={`
                  relative w-7 h-7 rounded-full flex items-center justify-center
                  transition-all duration-300
                  ${isDone ? 'bg-green-500 text-white shadow-sm shadow-green-500/30' :
                    isError ? 'bg-red-500 text-white shadow-sm shadow-red-500/30' :
                    isActive ? 'bg-accent text-white shadow-sm shadow-accent/30' :
                    isPending ? 'bg-bg-secondary text-text-muted border border-border' :
                    'bg-bg-secondary text-text-muted border border-border'}
                `}>
                  {isDone && (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isError && <span className="text-xs font-bold">!</span>}
                  {isActive && (
                    <span className="w-2 h-2 bg-white rounded-full animate-ping absolute" />
                  )}
                  {isActive && <span className="w-2 h-2 bg-white rounded-full relative" />}
                  {isSkipped && <span className="text-xs">—</span>}
                  {isPending && <span className="text-xs font-medium">{idx + 1}</span>}
                </div>
                {!isLast && (
                  <div className={`
                    w-0.5 h-8 mt-1 rounded-full transition-colors duration-300
                    ${isDone || isError ? 'bg-green-500/30' :
                      isActive ? 'bg-accent/30' : 'bg-border'}
                  `} />
                )}
              </div>

              {/* 步骤内容 */}
              <div className={`flex-1 min-w-0 pb-5 ${isPending ? 'opacity-40' : ''} transition-opacity duration-300`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`
                      text-sm font-semibold
                      ${isDone ? 'text-green-600' :
                        isError ? 'text-red-500' :
                        isActive ? 'text-accent' :
                        'text-text-muted'}
                    `}>
                      {STEP_LABELS[stepId] || stepId}
                    </span>
                    {isActive && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent animate-pulse">
                        进行中
                      </span>
                    )}
                    {isError && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500">
                        出错
                      </span>
                    )}
                  </div>
                  {stepId === 'publish' && (
                    <span className="text-[10px] text-text-muted bg-bg-secondary px-2 py-0.5 rounded-full hidden sm:inline">
                      最后一步
                    </span>
                  )}
                </div>

                {/* 步骤描述 */}
                {isPending && !state.reasoning && (
                  <p className="text-xs text-text-muted/60 mt-0.5">{STEP_DESCRIPTIONS[stepId]}</p>
                )}

                {/* 推理 / 决策 */}
                {state.reasoning && (
                  <div className="mt-1.5 text-xs text-text-muted leading-relaxed bg-bg-secondary/50 rounded-lg px-3 py-2 border border-border/30">
                    {state.reasoning}
                  </div>
                )}

                {/* 进度条 */}
                {state.progress && state.progress.total > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.round((state.progress.current / state.progress.total) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted font-medium tabular-nums shrink-0">
                      {state.progress.current}/{state.progress.total}
                    </span>
                  </div>
                )}

                {/* 决策摘要 */}
                {state.decision && (
                  <div className="mt-1 text-xs text-text-muted/70 italic flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    {state.decision}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 事件日志 */}
      {events.length > 0 && (
        <div className="border-t border-border pt-4">
          <EventLog events={events} />
        </div>
      )}
    </div>
  );
}

function EventLog({ events }: { events: PipelineEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const evt of events) {
      counts[evt.type] = (counts[evt.type] || 0) + 1;
    }
    return counts;
  }, [events]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-text-muted">事件日志</div>
        <span className="text-[10px] text-text-muted/60">{events.length} 条事件</span>
      </div>
      <div ref={scrollRef} className="max-h-44 overflow-y-auto space-y-0.5 rounded-xl bg-bg-secondary/30 border border-border/30 p-2">
        {events.map((evt, i) => {
          const time = evt.time ? new Date(evt.time as string).toLocaleTimeString() : '';
          const text = String(evt.reasoning || evt.message || evt.decision || evt.detail || evt.error || evt.type);
          const fullLine = time ? `[${time}] ${evt.type}: ${text}` : `${evt.type}: ${text}`;
          return (
            <div key={i} className="group flex items-start gap-1.5 text-[11px] text-text-muted font-mono leading-relaxed px-1.5 py-1 rounded-lg hover:bg-bg-secondary/50 transition-colors">
              {time && <span className="text-text-muted/40 shrink-0 tabular-nums">{time}</span>}
              <EventBadge type={evt.type} />
              <span className="flex-1 min-w-0 break-words">{text}</span>
              <button
                onClick={() => navigator.clipboard.writeText(fullLine)}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted/30 hover:text-text-muted transition-opacity p-0.5"
                title="复制"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    step_start: 'text-blue-500',
    step_complete: 'text-green-500',
    step_error: 'text-red-500',
    step_progress: 'text-blue-400',
    agent_decision: 'text-yellow-500',
    checkpoint_required: 'text-orange-500',
    completed: 'text-green-500',
    cancelled: 'text-red-500',
  };
  const labels: Record<string, string> = {
    step_start: '▶',
    step_complete: '✔',
    step_error: '✗',
    step_progress: '⋯',
    agent_decision: '💡',
    checkpoint_required: '⏳',
    completed: '✓',
    cancelled: '⛔',
  };
  return <span className={`${colors[type] || 'text-text-muted'} shrink-0`}>{labels[type] || '•'}</span>;
}

function buildStepStates(
  events: PipelineEvent[],
  currentStep: string | null,
  stepProgress: { current: number; total: number } | null,
): Record<string, StepState> {
  const states: Record<string, StepState> = {};

  for (const step of STEP_ORDER) {
    states[step] = { status: 'pending', reasoning: '', progress: null, decision: '' };
  }

  for (const evt of events) {
    const step = evt.step;
    if (!step || !states[step]) continue;

    if (evt.type === 'step_start') {
      states[step].status = 'active';
      states[step].reasoning = (evt.reasoning as string) || '';
    } else if (evt.type === 'step_complete') {
      states[step].status = 'done';
      const res = evt.result as Record<string, unknown> | undefined;
      if (res) {
        const total = res.total as number | undefined;
        const added = res.added as number | undefined;
        const scored = res.scored as number | undefined;
        const message = res.message as string | undefined;
        if (total !== undefined) states[step].reasoning = `共 ${total} 条`;
        else if (added !== undefined) states[step].reasoning = `已加入 ${added} 条`;
        else if (scored !== undefined) states[step].reasoning = `已评分 ${scored} 张`;
        else if (message) states[step].reasoning = message;
      }
    } else if (evt.type === 'step_error') {
      states[step].status = 'error';
      states[step].reasoning = (evt.error as string) || '出错';
    } else if (evt.type === 'agent_decision') {
      states[step].reasoning = (evt.reasoning as string) || (evt.decision as string) || '';
      states[step].decision = (evt.decision as string) || '';
    }
  }

  if (currentStep && states[currentStep] && states[currentStep].status === 'pending') {
    states[currentStep].status = 'active';
  }

  if (currentStep && stepProgress && states[currentStep]) {
    states[currentStep].progress = stepProgress;
  }

  return states;
}
