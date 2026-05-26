import { useRef, useEffect } from 'react';
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

const STEP_ICONS: Record<string, string> = {
  health_check: '✓',
  fetch: '📡',
  download: '⬇',
  score: '⭐',
  generate: '✍',
  enqueue: '📋',
  publish: '🚀',
};

interface StepState {
  status: 'pending' | 'active' | 'done' | 'error';
  reasoning: string;
  progress: { current: number; total: number } | null;
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
  // Build step states from events
  const steps = buildStepStates(events, currentStep, stepProgress);

  if (!currentStep && events.length === 0) return null;

  return (
    <div className="card space-y-4">
      <div className="section-header">运行进度</div>

      {/* Step Timeline */}
      <div className="space-y-1">
        {STEP_ORDER.map((stepId, idx) => {
          const state = steps[stepId];
          if (!state) return null;

          return (
            <div key={stepId} className="flex gap-3">
              {/* Timeline connector */}
              <div className="flex flex-col items-center w-6 shrink-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${state.status === 'done' ? 'bg-green-500/20 text-green-500' :
                    state.status === 'error' ? 'bg-red-500/20 text-red-500' :
                    state.status === 'active' ? 'bg-accent-soft text-accent animate-pulse' :
                    'bg-bg-secondary text-text-muted'}`}>
                  {state.status === 'done' ? '✓' :
                   state.status === 'error' ? '✗' :
                   state.status === 'active' ? '▶' : `${idx + 1}`}
                </div>
                {idx < STEP_ORDER.length - 1 && (
                  <div className={`w-0.5 h-6 mt-1
                    ${state.status === 'done' ? 'bg-green-500/30' :
                      state.status === 'active' ? 'bg-accent/30' : 'bg-border'}`} />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-4 min-w-0">
                <div className={`text-sm font-medium ${state.status === 'pending' ? 'text-text-muted' : 'text-text'}`}>
                  {STEP_LABELS[stepId] || stepId}
                </div>

                {/* Reasoning / Agent decision */}
                {state.reasoning && (
                  <div className="mt-1 text-xs text-text-muted leading-relaxed">
                    {state.reasoning}
                  </div>
                )}

                {/* Progress bar */}
                {state.progress && state.progress.total > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((state.progress.current / state.progress.total) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted shrink-0">
                      {state.progress.current}/{state.progress.total}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event Log */}
      {events.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium text-text-muted mb-2">事件日志</div>
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

  return (
    <div ref={scrollRef} className="max-h-40 overflow-y-auto space-y-1">
      {events.map((evt, i) => {
        const time = evt.time ? new Date(evt.time as string).toLocaleTimeString() : '';
        const text = String(evt.reasoning || evt.message || evt.decision || evt.detail || evt.error || evt.type);
        const fullLine = time ? `[${time}] ${evt.type}: ${text}` : `${evt.type}: ${text}`;
        return (
          <div key={i} className="group text-xs text-text-muted font-mono leading-relaxed flex items-start gap-1">
            {time && <span className="text-text-muted/50 shrink-0">[{time}]</span>}
            <EventBadge type={evt.type} />
            <span className="ml-1 flex-1 min-w-0">{text}</span>
            <button
              onClick={() => navigator.clipboard.writeText(fullLine)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted/30 hover:text-text-muted transition-opacity"
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
  );
}

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    step_start: 'text-accent',
    step_complete: 'text-green-500',
    step_error: 'text-red-500',
    step_progress: 'text-blue-500',
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
    completed: '🏁',
    cancelled: '⛔',
  };
  return <span className={colors[type] || 'text-text-muted'}>{labels[type] || type}</span>;
}

function buildStepStates(
  events: PipelineEvent[],
  currentStep: string | null,
  stepProgress: { current: number; total: number } | null,
): Record<string, StepState> {
  const states: Record<string, StepState> = {};

  // Initialize all steps as pending
  for (const step of STEP_ORDER) {
    states[step] = { status: 'pending', reasoning: '', progress: null };
  }

  // Process events to compute step states
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
    }
  }

  // Set current step as active if no step_start event processed yet
  if (currentStep && states[currentStep] && states[currentStep].status === 'pending') {
    states[currentStep].status = 'active';
  }

  // Apply progress to current step
  if (currentStep && stepProgress && states[currentStep]) {
    states[currentStep].progress = stepProgress;
  }

  return states;
}
