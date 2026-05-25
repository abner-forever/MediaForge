import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../stores';
import { queueApi, wechatAccountApi, type QueueItem, type WeChatAccount } from '../../api/client';
import Select from '../../components/Select';
import { imgSrc } from './utils';
import ConfirmDialog from '../../components/ConfirmDialog';
import PublishConfirmModal from '../../components/PublishConfirmModal';
import EffectEntry from '../../components/EffectEntry';

const ArticleCard = React.memo(function ArticleCard({ item }: { item: QueueItem }) {
  const itemId = item.id!;
  const navigate = useNavigate();
  const { addToast, setQueue } = useStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState<'draft' | 'publish' | null>(null);
  const [wechatAccounts, setWechatAccounts] = useState<WeChatAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(item.account_id || '');
  const tags = item.tags || [];

  useEffect(() => {
    wechatAccountApi.list().then(({ accounts }) => {
      setWechatAccounts(accounts);
      if (!item.account_id) {
        const def = accounts.find(a => a.is_default);
        if (def) setSelectedAccountId(def.account_id);
      }
    }).catch(() => {});
  }, [item.account_id]);

  async function deleteItem() {
    try {
      await queueApi.remove(itemId);
      setQueue((await queueApi.get()).queue);
      addToast('已删除', 'info');
    } catch (err: any) {
      addToast(err.message || '删除失败', 'error');
    }
  }

  async function pollQueueDone(signal: AbortSignal): Promise<boolean> {
    for (let i = 0; i < 150; i++) {
      if (signal.aborted) return false;
      try {
        const refreshed = await queueApi.get();
        setQueue(refreshed.queue);
        const updated = refreshed.queue.find(q => q.id === itemId);
        if (updated) {
          if (updated.status === 'saved_to_wechat' || updated.status === 'published') return true;
          if (updated.status === 'failed') return false;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  async function publish(opts: { save_draft?: boolean }) {
    const action = opts.save_draft ? '保存草稿' : '发布';
    addToast(`正在${action}...`, 'info');
    try {
      const r = await queueApi.publish(itemId, { ...opts, account_id: selectedAccountId || undefined });
      if (r.started) {
        // 后台执行，轮询等终态
        const ok = await pollQueueDone(new AbortController().signal);
        addToast(ok ? `${action}成功` : '发布失败', ok ? 'success' : 'error');
        setQueue((await queueApi.get()).queue);
        return;
      }
      if (r.success) {
        addToast(`${action}成功`, 'success');
        const newStatus: QueueItem['status'] = opts.save_draft ? 'saved_to_wechat' : 'published';
        const q = useStore.getState().queue;
        const idx = q.findIndex(qi => qi.id === itemId);
        if (idx >= 0) {
          const newQueue = [...q];
          newQueue[idx] = { ...newQueue[idx], status: newStatus };
          setQueue(newQueue);
        }
      } else {
        addToast(`失败：${r.message}`, 'error');
      }
      setQueue((await queueApi.get()).queue);
    } catch (err: any) {
      addToast(err.message || '发布失败', 'error');
    }
  }

  const isPublished = item.status === 'published';

  return (
    <div className="card overflow-visible">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-48 relative bg-accent-softer border-b md:border-b-0 md:border-r border-border-subtle shrink-0 min-h-[140px]">
          {item.cover ? (
            <img src={imgSrc(item.cover)} alt="" className="w-full h-full absolute inset-0 object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg className="w-12 h-12 text-[var(--accent)]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span className="text-xs text-[var(--text-muted)] mt-2">文章</span>
            </div>
          )}
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-card/80 text-text-muted border border-border/50 backdrop-blur">
            {item.type === 'article' ? '文章' : '图片'}
          </div>
        </div>

        <div className="flex-1 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {item.celebrity && (
              <span className="font-medium text-[var(--text-secondary)]">{item.celebrity}</span>
            )}
            {item.status === 'saved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">保存成功</span>
            )}
            {item.status === 'saved_to_wechat' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">公众号草稿</span>
            )}
            {item.status === 'published' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">已发布</span>
            )}
            {item.status === 'failed' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/20">发布失败</span>
            )}
          </div>

          <h3 className="text-base font-semibold leading-snug">{item.title || '无标题'}</h3>

          {item.content && (
            <p className="text-sm text-[var(--text-secondary)] line-clamp-4 leading-relaxed">{item.content}</p>
          )}

          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--bg-secondary)] text-[var(--text-muted)]">{tag}</span>
              ))}
            </div>
          )}

          {wechatAccounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted shrink-0">发布到</span>
              <div className="w-44">
                <Select
                  value={selectedAccountId}
                  onChange={setSelectedAccountId}
                  options={wechatAccounts.map(acc => ({
                      label: `${acc.name}${acc.logged_in ? '' : ' (未登录)'}`,
                      value: acc.account_id,
                    }))}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap pt-1">
            <button className="btn btn-sm" onClick={() => navigate(`/articles?edit=${item.article_id || item.id}`)}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              编辑
            </button>
            {!isPublished ? (
              <>
                <button className="btn btn-sm" onClick={() => setPublishConfirm('draft')}>保存草稿</button>
                <button className="btn btn-sm" onClick={() => setPublishConfirm('publish')}>直接发布</button>
                <button className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => setShowDeleteConfirm(true)}>删除</button>
              </>
            ) : (
              <EffectEntry itemId={itemId} title={item.title} />
            )}
          </div>

          <ConfirmDialog
            open={showDeleteConfirm}
            title="删除发布队列项"
            message={`确认删除《${item.title || '无标题'}》？`}
            confirmText="删除"
            danger
            onConfirm={() => { setShowDeleteConfirm(false); deleteItem(); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
          <PublishConfirmModal
            open={!!publishConfirm}
            action={publishConfirm || 'draft'}
            account={wechatAccounts.find(a => a.account_id === selectedAccountId) || null}
            title={item.title}
            content={item.content || item.desc}
            cover={item.cover}
            images={item.images || []}
            onConfirm={() => {
              const action = publishConfirm;
              setPublishConfirm(null);
              publish({ save_draft: action !== 'publish' });
            }}
            onCancel={() => setPublishConfirm(null)}
          />
        </div>
      </div>
    </div>
  );
});

export default ArticleCard;
