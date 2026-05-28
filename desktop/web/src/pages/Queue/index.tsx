import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../stores';
import { queueApi, wechatAccountApi } from '../../api/client';
import type { WeChatAccount } from '../../api/client';
import { formatTime } from './utils';
import QueueCard from './QueueCard';
import Select from '../../components/Select';
import HelpGuide from '../../components/ui/HelpGuide';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  reviewing: '审核中',
  queued: '排队中',
  saved: '保存成功',
  saved_to_wechat: '公众号草稿',
  publishing: '发布中',
  published: '已发布',
  failed: '发布失败',
};

export default function Queue() {
  const { queue, setQueue } = useStore();
  const [accounts, setAccounts] = useState<WeChatAccount[]>([]);
  const [filterAccount, setFilterAccount] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    queueApi.get().then(d => setQueue(d.queue));
    wechatAccountApi.list().then(d => setAccounts(d.accounts)).catch(() => {});
  }, [setQueue]);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    queue.forEach(item => seen.add(item.type || 'image'));
    return [
      { label: '全部类型', value: '' },
      ...Array.from(seen).map(t => ({ label: t === 'image' ? '图文' : '文章', value: t })),
    ];
  }, [queue]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    queue.forEach(item => { if (item.status) seen.add(item.status); });
    return [
      { label: '全部状态', value: '' },
      ...Array.from(seen).map(s => ({ label: STATUS_LABELS[s] || s, value: s })),
    ];
  }, [queue]);

  const filteredQueue = queue.filter(item => {
    if (filterAccount && item.account_id !== filterAccount) return false;
    if (filterType && (item.type || 'image') !== filterType) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">发布队列{queue.length > 0 && <span className="text-text-muted font-normal text-base ml-2">共 {queue.length} 项</span>}</h1>
          <p className="text-sm text-text-secondary mt-1">预览和发布图文内容到公众号</p>
        </div>
        <HelpGuide title="发布队列 — 使用说明">
          <p><b>1. 队列概览</b>：所有待发布内容按时间排列，每张卡片显示标题、封面图、图片数量和当前状态。</p>
          <p><b>2. 筛选与排序</b>：顶部可按公众号账号、内容类型（图文/文章）、状态（待发布/已发布/失败）筛选。</p>
          <p><b>3. 预览内容</b>：展开卡片可预览完整标题、图片列表和文章摘要，确认无误后再发布。</p>
          <p><b>4. 发布操作</b>：点击卡片上的「发布」按钮将内容推送到绑定的公众号。发布过程中请勿关闭程序。</p>
          <p><b>5. 效果录入</b>：已发布的项目可录入阅读量、点赞、评论等数据，用于后续效果分析。</p>
          <p><b>6. 编辑与删除</b>：可编辑队列项的标题和图片顺序，或将其从队列中移除。</p>
        </HelpGuide>
      </div>

      {accounts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
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
        <div className="w-28">
          <Select
            value={filterType}
            onChange={setFilterType}
            options={typeOptions}
          />
        </div>
        <div className="w-32">
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            options={statusOptions}
          />
        </div>
      </div>
    )}

      {filteredQueue.length === 0 ? (
        <div className="card">
          <div className="empty-state py-16">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">{queue.length === 0 ? '发布队列为空' : '没有匹配的项'}</div>
            <div className="empty-state-desc">{queue.length === 0 ? '请在「图片发现」页面选图并加入发布队列' : '试试调整筛选条件'}</div>
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
                    <QueueCard item={item} seq={sorted.length - idx} accounts={accounts} />
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
