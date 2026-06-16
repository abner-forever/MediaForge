import type { DailyTask } from '@/types';

interface TaskCardProps {
  task: DailyTask;
}

const ICON_MAP: Record<string, { bg: string; icon: string; doneBg: string }> = {
  video: {
    bg: 'from-blue-500/20 to-blue-600/10 border-blue-500/20',
    icon: '▶',
    doneBg: 'from-green-500/20 to-green-600/10 border-green-500/20',
  },
  checkin: {
    bg: 'from-amber-500/20 to-amber-600/10 border-amber-500/20',
    icon: '📅',
    doneBg: 'from-green-500/20 to-green-600/10 border-green-500/20',
  },
};

export default function TaskCard({ task }: TaskCardProps) {
  const progress =
    task.target > 0 ? Math.min(Math.round((task.current / task.target) * 100), 100) : 0;
  const styles = ICON_MAP[task.type] ?? ICON_MAP.video;
  const isDone = task.completed;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-200 ${
        isDone
          ? `${styles.doneBg} border-green-500/20`
          : `${styles.bg} border-border/50 hover:border-border hover:shadow-md hover:-translate-y-0.5`
      }`}
    >
      <div className="flex items-start gap-4">
        {/* 图标 */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg ${
            isDone ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/80'
          }`}
        >
          {isDone ? (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="leading-none">{styles.icon}</span>
          )}
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h4 className={`text-sm font-semibold ${isDone ? 'text-green-400' : 'text-text'}`}>
              {task.label}
            </h4>
            <span
              className={`shrink-0 text-xs font-medium ${isDone ? 'text-green-400' : 'text-text-secondary'}`}
            >
              {isDone ? '已完成' : `${task.reward}`}
            </span>
          </div>
          <p
            className={`mt-1 text-xs leading-relaxed ${isDone ? 'text-green-400/60' : 'text-text-muted'}`}
          >
            {task.description}
          </p>

          {/* 进度条（多步任务） */}
          {!isDone && task.target > 1 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
                <span>进度</span>
                <span>
                  {task.current}/{task.target}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
