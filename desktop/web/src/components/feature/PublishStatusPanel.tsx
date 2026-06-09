import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../stores';
import type { PublishTaskState } from '../../stores/queueSlice';

/* ── 单个任务日志面板 ────────────────────────── */
function TaskLogPanel({ taskId, task }: { taskId: string; task: PublishTaskState }) {
  const [expanded, setExpanded] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logsLenRef = useRef(task.logs.length);
  const removePublishTask = useStore(s => s.removePublishTask);

  // 自动滚动到底部
  useEffect(() => {
    if (task.logs.length > logsLenRef.current) {
      const el = logContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
    logsLenRef.current = task.logs.length;
  }, [task.logs]);

  const isActive = task.status === 'publishing';
  const isError = task.status === 'error';
  const isDone = task.status === 'done';

  // 自动移除完成的任务（延迟 3 秒）
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => removePublishTask(taskId), 3000);
      return () => clearTimeout(timer);
    }
  }, [isDone, taskId, removePublishTask]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-bg-card shadow-sm">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {isActive && <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />}
        {isDone && <span className="inline-block w-2 h-2 rounded-full bg-success shrink-0" />}
        {isError && <span className="inline-block w-2 h-2 rounded-full bg-danger shrink-0" />}
        <span className="truncate">{task.title || '无标题'}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {!isActive && (
            <span
              className="text-text-muted hover:text-danger transition-colors"
              onClick={e => { e.stopPropagation(); removePublishTask(taskId); }}
            >
              ×
            </span>
          )}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
      <div
        ref={logContainerRef}
        className="overflow-y-auto transition-all duration-300 ease-in-out"
        style={{
          maxHeight: expanded ? '10rem' : '0px',
          opacity: expanded ? 1 : 0,
          paddingBlock: expanded ? undefined : 0,
          paddingInline: expanded ? '0.625rem' : '0.625rem',
        }}
      >
        <div className="pb-2">
          <div className="space-y-0.5 select-text">
            {task.logs.map((msg, i) => (
              <div key={i} className="text-xs text-text-secondary font-mono leading-relaxed">
                {msg}
              </div>
            ))}
            {task.logs.length === 0 && (
              <div className="text-xs text-text-muted italic">等待日志...</div>
            )}
          </div>
          {task.error && (
            <div className="mt-2 text-xs text-danger">{task.error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 全局发布状态面板 ────────────────────────── */
export default function PublishStatusPanel() {
  const publishingTasks = useStore(s => s.publishingTasks);
  const [expanded, setExpanded] = useState(false);

  const activeTasks = Object.entries(publishingTasks).filter(
    ([_, task]) => task.status === 'publishing'
  );
  const recentTasks = Object.entries(publishingTasks).filter(
    ([_, task]) => task.status !== 'publishing'
  );

  const hasActiveTasks = activeTasks.length > 0;
  const hasRecentTasks = recentTasks.length > 0;

  // 没有任务时不显示
  if (!hasActiveTasks && !hasRecentTasks) {
    return null;
  }

  // 紧凑模式：只显示一个状态图标
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 cursor-pointer border-0"
        style={{ background: hasActiveTasks ? 'var(--accent)' : 'var(--success)' }}
        title={hasActiveTasks ? `${activeTasks.length} 个任务发布中` : `${recentTasks.length} 个任务已完成`}
      >
        {hasActiveTasks ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {hasActiveTasks && activeTasks.length > 1 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            {activeTasks.length}
          </span>
        )}
      </button>
    );
  }

  // 展开模式：紧凑面板
  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 bg-bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-softer border-b border-border">
        {hasActiveTasks && (
          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
        )}
        <span className="text-xs font-medium text-text">
          {hasActiveTasks ? '发布中' : '已完成'}
        </span>
        <span className="text-[10px] text-text-muted">
          {hasActiveTasks ? activeTasks.length : recentTasks.length}
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-secondary transition-colors"
          title="收起"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {/* 任务列表 */}
      <div className="overflow-y-auto p-1.5 space-y-1.5 max-h-[50vh]">
        {activeTasks.map(([taskId, task]) => (
          <TaskLogPanel key={taskId} taskId={taskId} task={task} />
        ))}
        {recentTasks.map(([taskId, task]) => (
          <TaskLogPanel key={taskId} taskId={taskId} task={task} />
        ))}
      </div>
    </div>
  );
}
