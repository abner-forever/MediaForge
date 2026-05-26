import type { PipelineSummary } from '../../api/client';

export default function SummaryPanel({
  summary,
  onRunAgain,
}: {
  summary: PipelineSummary;
  onRunAgain: () => void;
}) {
  const successCount = summary.items.filter(i => i.status !== 'failed').length;
  const failedCount = summary.items.filter(i => i.status === 'failed').length;

  return (
    <div className="card space-y-4">
      <div className="section-header">运行结果</div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <StatBox label="处理帖子" value={summary.total_posts} color="text-accent" />
        <StatBox label="下载图片" value={summary.total_images} color="text-green-500" />
        <StatBox label="成功" value={successCount} color="text-green-500" />
        <StatBox label="失败" value={failedCount} color="text-red-500" />
      </div>

      {/* Timing & Tokens */}
      <div className="flex gap-4 text-xs text-text-muted flex-wrap">
        <span>运行 ID: {summary.run_id}</span>
        {summary.elapsed_seconds !== undefined && (
          <span>耗时: {summary.elapsed_seconds}s</span>
        )}
        {(summary.prompt_tokens || summary.completion_tokens) && (
          <span>Token: 输入 {summary.prompt_tokens ?? 0} / 输出 {summary.completion_tokens ?? 0}</span>
        )}
      </div>

      {/* Item Details */}
      {summary.items.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-text">明细</div>
          <div className="divide-y divide-border">
            {summary.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <StatusDot status={item.status} />
                  <span className="text-text truncate">{item.title}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-text-muted text-xs">{item.celebrity}</span>
                  <span className="text-text-muted text-xs">{item.images} 张</span>
                  {item.score > 0 && (
                    <span className="text-yellow-500 text-xs font-medium">{item.score} 分</span>
                  )}
                  <StatusLabel status={item.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-3 pt-1">
        <button onClick={onRunAgain} className="btn btn-primary">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          再次运行
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
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
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status] || 'bg-text-muted'}`} />
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued: '已入队列',
    saved_to_wechat: '已存草稿',
    published: '已发布',
    failed: '失败',
    done: '完成',
  };
  return (
    <span className="text-xs text-text-muted">{labels[status] || status}</span>
  );
}
