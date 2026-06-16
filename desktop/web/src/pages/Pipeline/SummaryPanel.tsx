import type { PipelineSummary } from '../../api/client';

export default function SummaryPanel({
  summary,
  onRunAgain,
}: {
  summary: PipelineSummary;
  onRunAgain: () => void;
}) {
  const successCount = summary.items.filter((i) => i.status !== 'failed').length;
  const failedCount = summary.items.filter((i) => i.status === 'failed').length;
  const successRate =
    summary.total_posts > 0 ? Math.round((successCount / summary.total_posts) * 100) : 0;
  const hasTokens = (summary.prompt_tokens ?? 0) > 0 || (summary.completion_tokens ?? 0) > 0;

  return (
    <div className="card space-y-5">
      <div className="section-header">运行结果</div>

      {/* 状态大标题 */}
      <div className="flex items-center gap-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold
          ${
            failedCount > 0 && successCount > 0
              ? 'bg-yellow-500/15 text-yellow-500'
              : failedCount > 0
                ? 'bg-red-500/15 text-red-500'
                : 'bg-green-500/15 text-green-500'
          }`}
        >
          {failedCount > 0 && successCount > 0 ? (
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : failedCount > 0 ? (
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
        </div>
        <div>
          <div className="text-lg font-bold text-text">
            {failedCount > 0 && successCount > 0
              ? '部分完成'
              : failedCount > 0
                ? '运行失败'
                : '运行成功'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            成功率 {successRate}% &middot; {summary.total_posts} 个帖子 &middot;{' '}
            {summary.total_images} 张图片
          </div>
        </div>
      </div>

      {/* 统计网格 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-bg-secondary/70 rounded-xl p-3.5 text-center border border-border/30">
          <div className="text-xl font-bold text-accent tabular-nums">{summary.total_posts}</div>
          <div className="text-xs text-text-muted mt-1">处理帖子</div>
        </div>
        <div className="bg-bg-secondary/70 rounded-xl p-3.5 text-center border border-border/30">
          <div className="text-xl font-bold text-green-500 tabular-nums">
            {summary.total_images}
          </div>
          <div className="text-xs text-text-muted mt-1">下载图片</div>
        </div>
        <div className="bg-bg-secondary/70 rounded-xl p-3.5 text-center border border-border/30">
          <div className="text-xl font-bold text-green-600 tabular-nums">{successCount}</div>
          <div className="text-xs text-text-muted mt-1">成功</div>
        </div>
        <div className="bg-bg-secondary/70 rounded-xl p-3.5 text-center border border-border/30">
          <div
            className={`text-xl font-bold tabular-nums ${failedCount > 0 ? 'text-red-500' : 'text-text-muted'}`}
          >
            {failedCount}
          </div>
          <div className="text-xs text-text-muted mt-1">失败</div>
        </div>
      </div>

      {/* 运行信息 */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-muted bg-bg-secondary/30 rounded-xl px-4 py-3 border border-border/30">
        <span className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-text-muted/50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          运行 ID: {summary.run_id}
        </span>
        {summary.elapsed_seconds !== undefined && (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-text-muted/50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            耗时: {summary.elapsed_seconds}s
          </span>
        )}
        {hasTokens && (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-text-muted/50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            Token: 输入 {summary.prompt_tokens ?? 0} / 输出 {summary.completion_tokens ?? 0}
          </span>
        )}
      </div>

      {/* 明细列表 */}
      {summary.items.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-text mb-3">处理明细</div>
          <div className="divide-y divide-border/50 rounded-xl border border-border/30 overflow-hidden">
            {summary.items.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-2.5 px-3.5 text-sm transition-colors
                ${item.status === 'failed' ? 'bg-red-500/[0.03]' : 'hover:bg-bg-secondary/30'}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <StatusDot status={item.status} />
                  <span className="text-text truncate font-medium">{item.title || '无标题'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {item.celebrity && (
                    <span className="text-text-muted text-xs">{item.celebrity}</span>
                  )}
                  <span className="text-text-muted text-xs">{item.images} 张</span>
                  {item.score > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-yellow-600 text-xs font-medium bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      {item.score}
                    </span>
                  )}
                  <StatusLabel status={item.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作 */}
      <div className="flex gap-3 pt-1">
        <button onClick={onRunAgain} className="btn btn-primary">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          再次运行
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-accent',
    saved_to_wechat: 'bg-green-500',
    published: 'bg-green-500',
    failed: 'bg-red-500',
    done: 'bg-green-500',
  };
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || 'bg-text-muted'}`} />;
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued: '已入队列',
    saved_to_wechat: '已存草稿',
    published: '已发布',
    failed: '失败',
    done: '完成',
  };
  const colors: Record<string, string> = {
    queued: 'text-accent bg-accent/10',
    saved_to_wechat: 'text-green-600 bg-green-500/10',
    published: 'text-green-600 bg-green-500/10',
    failed: 'text-red-500 bg-red-500/10',
    done: 'text-green-600 bg-green-500/10',
  };
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors[status] || 'text-text-muted bg-bg-secondary'}`}
    >
      {labels[status] || status}
    </span>
  );
}
