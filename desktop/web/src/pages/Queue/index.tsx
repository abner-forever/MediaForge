import { useEffect, useState } from 'react';
import { useStore } from '../../stores';
import { queueApi, wechatAccountApi } from '../../api/client';
import type { WeChatAccount } from '../../api/client';
import { formatTime } from './utils';
import QueueCard from './QueueCard';
import Select from '../../components/Select';

export default function Queue() {
  const { queue, setQueue } = useStore();
  const [accounts, setAccounts] = useState<WeChatAccount[]>([]);
  const [filterAccount, setFilterAccount] = useState('');

  useEffect(() => {
    queueApi.get().then(d => setQueue(d.queue));
    wechatAccountApi.list().then(d => setAccounts(d.accounts)).catch(() => {});
  }, [setQueue]);

  const filteredQueue = filterAccount
    ? queue.filter(item => item.account_id === filterAccount)
    : queue;

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">发布队列</h1>
        <p className="text-sm text-text-secondary mt-1">预览和发布图文内容到公众号</p>
      </div>

      {accounts.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted shrink-0">按账号筛选</span>
          <div className="w-44">
            <Select
              value={filterAccount}
              onChange={setFilterAccount}
              options={[
                { label: '全部账号', value: '' },
                ...accounts.map(acc => ({
                  label: `${acc.name}${acc.logged_in ? '' : ' (未登录)'}`,
                  value: acc.account_id,
                })),
              ]}
            />
          </div>
        </div>
      )}

      {filteredQueue.length === 0 ? (
        <div className="card">
          <div className="empty-state py-16">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">发布队列为空</div>
            <div className="empty-state-desc">请在「图片发现」页面选图并加入发布队列</div>
          </div>
        </div>
      ) : (
        (() => {
          const sorted = [...filteredQueue].sort((a, b) => {
            const tA = a.time || '';
            const tB = b.time || '';
            return tB.localeCompare(tA);
          });
          return (
            <div className="relative">
              {sorted.length > 1 && (
                <div className="absolute left-[10px] top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
              )}
              {sorted.map((item, idx) => (
                <div key={item.id} className="flex gap-4">
                  <div className="w-5 flex justify-center shrink-0">
                    <div className={`relative z-10 w-2.5 h-2.5 rounded-full shrink-0 ${
                      idx === 0 ? 'bg-accent ring-[3px] ring-accent/15' : 'bg-border'
                    }`} />
                  </div>
                  <div className={`flex-1 min-w-0 ${idx < sorted.length - 1 ? 'pb-7' : ''}`}>
                    <div className="text-[11px] text-text-muted/60 leading-none mb-2 mt-1.5">{formatTime(item.time)}</div>
                    <QueueCard item={item} />
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
