import { useEffect } from 'react';
import { useStore } from '../../stores';
import { queueApi } from '../../api/client';
import { formatTime } from './utils';
import QueueCard from './QueueCard';

export default function Queue() {
  const { queue, setQueue } = useStore();
  useEffect(() => { queueApi.get().then(d => setQueue(d.queue)); }, [setQueue]);

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">发布队列</h1>
        <p className="text-sm text-text-secondary mt-1">预览和发布图文内容到公众号</p>
      </div>

      {queue.length === 0 ? (
        <div className="card">
          <div className="empty-state py-16">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">发布队列为空</div>
            <div className="empty-state-desc">请在「图片发现」页面选图并加入发布队列</div>
          </div>
        </div>
      ) : (
        (() => {
          const sortedIndices = queue
            .map((item, i) => ({ item, i }))
            .sort((a, b) => {
              const tA = a.item.time || '';
              const tB = b.item.time || '';
              return tB.localeCompare(tA);
            });
          return (
            <div className="relative">
              {sortedIndices.length > 1 && (
                <div className="absolute left-[10px] top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
              )}
              {sortedIndices.map(({ i }, idx) => (
                <div key={i} className="flex gap-4">
                  <div className="w-5 flex justify-center shrink-0">
                    <div className={`relative z-10 w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                      idx === 0 ? 'bg-accent ring-[3px] ring-accent/15' : 'bg-border'
                    }`} />
                  </div>
                  <div className={`flex-1 min-w-0 ${idx < sortedIndices.length - 1 ? 'pb-7' : ''}`}>
                    <div className="text-[11px] text-text-muted/60 leading-none mb-2 mt-1.5">{formatTime(queue[i].time)}</div>
                    <QueueCard item={queue[i]} index={i} />
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}
