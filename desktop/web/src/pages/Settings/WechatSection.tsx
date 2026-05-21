import { useEffect, useState } from 'react';
import type { SettingsData, WeChatLoginEvent, PublishHistoryItem } from '../../api/client';
import { useStore } from '../../stores';
import { wechatAccountApi } from '../../api/client';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function WechatSection({ data, onReload }: { data: SettingsData; onReload?: () => Promise<void> }) {
  const { addToast, incWechatRefreshKey } = useStore();
  const [accounts, setAccounts] = useState(data.wechat_accounts || []);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [loginState, setLoginState] = useState<Record<string, { loading: boolean; message: string }>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ accountId: string; name: string } | null>(null);

  // 每次挂载时从 API 刷新账号列表，避免子选项卡切换导致的数据过期
  useEffect(() => { refreshAccounts(); }, []);

  async function refreshAccounts() {
    try {
      const { accounts: list } = await wechatAccountApi.list();
      setAccounts(list);
      incWechatRefreshKey();
    } catch { /* ignore */ }
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) { addToast('请输入公众号名称', 'error'); return; }
    setAdding(true);
    try {
      const { account } = await wechatAccountApi.add(name);
      setNewName('');
      await refreshAccounts();
      addToast(`「${account.name}」已添加`, 'success');
      handleLogin(account.account_id);
    } catch (err: any) {
      addToast(err.message || '添加失败', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleLogin(accountId: string) {
    setLoginState(s => ({ ...s, [accountId]: { loading: true, message: '正在启动浏览器...' } }));
    try {
      await wechatAccountApi.login(accountId, (evt: WeChatLoginEvent) => {
        if (evt.type === 'progress') {
          setLoginState(s => ({ ...s, [accountId]: { loading: true, message: evt.message || '' } }));
        } else if (evt.type === 'done') {
          setLoginState(s => ({ ...s, [accountId]: { loading: false, message: '登录成功' } }));
          addToast('登录成功', 'success');
          refreshAccounts();
        } else if (evt.type === 'error') {
          setLoginState(s => ({ ...s, [accountId]: { loading: false, message: evt.message || '登录失败' } }));
          addToast(evt.message || '登录失败', 'error');
        }
      });
    } catch (err: any) {
      setLoginState(s => ({ ...s, [accountId]: { loading: false, message: err.message } }));
    }
  }

  async function handleDelete(accountId: string, name: string) {
    setDeleteConfirm({ accountId, name });
  }

  async function handleLogout(accountId: string) {
    try {
      await wechatAccountApi.logout(accountId);
      addToast('已清除登录态', 'info');
      await refreshAccounts();
    } catch (err: any) {
      addToast(err.message || '操作失败', 'error');
    }
  }

  const [historyModal, setHistoryModal] = useState<{ accountId: string; name: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<PublishHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function openHistory(accountId: string, name: string) {
    setHistoryModal({ accountId, name });
    setLoadingHistory(true);
    try {
      const { items } = await wechatAccountApi.history(accountId);
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSetDefault(accountId: string) {
    try {
      await wechatAccountApi.setDefault(accountId);
      addToast('已设为默认账号', 'success');
      await refreshAccounts();
    } catch (err: any) {
      addToast(err.message || '操作失败', 'error');
    }
  }

  return (
    <div className="card space-y-4">
      <div className="section-header">微信配置</div>
      <p className="text-xs text-text-muted">管理多个微信公众号，每个账号有独立的浏览器配置和登录态</p>

      {accounts.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">暂无公众号账号，请添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => {
            const ls = loginState[acc.account_id];
            return (
              <div key={acc.account_id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-border">
                <div className={`w-2 h-2 rounded-full shrink-0 ${acc.logged_in ? 'bg-success' : 'bg-text-muted/40'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-text truncate">{acc.name}</p>
                    {acc.is_default && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">默认</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    {acc.logged_in ? '已登录' : '未登录'}
                    {acc.last_used ? ` · 最后使用: ${new Date(acc.last_used).toLocaleString()}` : ''}
                  </p>
                </div>
                {ls?.loading ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-text-muted/30 border-t-accent rounded-full animate-spin" />
                    <span className="text-xs text-text-muted">{ls.message}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {!acc.is_default && (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleSetDefault(acc.account_id)} title="设为默认账号">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    )}
                    {acc.logged_in ? (
                      <>
                        <button className="btn btn-sm" onClick={() => handleLogin(acc.account_id)} title="重新登录">重登</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => handleLogout(acc.account_id)} title="清除登录态">注销</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" onClick={() => handleLogin(acc.account_id)}>登录</button>
                    )}
                    <button className="btn btn-sm btn-ghost" onClick={() => openHistory(acc.account_id, acc.name)} title="发布历史">历史</button>
                    <button className="btn btn-sm btn-ghost text-danger" onClick={() => handleDelete(acc.account_id, acc.name)}>删除</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-text-muted">公众号名称</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="例如：娱乐号、时尚号" className="w-full" />
        </div>
        <button className="btn btn-primary" onClick={handleAdd} disabled={adding}>
          {adding ? '添加中...' : '添加公众号'}
        </button>
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="删除公众号账号"
        message={`确定删除公众号「${deleteConfirm?.name}」及其所有数据吗？`}
        confirmText="删除"
        danger
        onConfirm={async () => {
          const dc = deleteConfirm;
          if (!dc) return;
          setDeleteConfirm(null);
          try {
            await wechatAccountApi.remove(dc.accountId);
            addToast(`「${dc.name}」已删除`, 'success');
            await refreshAccounts();
          } catch (err: any) {
            addToast(err.message || '删除失败', 'error');
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} className="w-[640px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-text mb-4">发布历史 — {historyModal?.name}</h3>
        {loadingHistory ? (
          <div className="py-8 text-center text-sm text-text-muted">加载中...</div>
        ) : historyItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-muted">暂无发布记录</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs text-text-muted px-3 py-2">
              <span>标题</span>
              <span>状态</span>
              <span>时间</span>
            </div>
            {historyItems.map((item, i) => (
              <div key={`${item.id}-${i}`} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors">
                <div className="text-sm text-text truncate">
                  <span className="text-[10px] text-text-muted mr-1.5">{item.type === 'article' ? '📄' : '🖼'}</span>
                  {item.title || '无标题'}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.status === 'published' ? 'bg-success/10 text-success'
                    : item.status === 'saved_to_wechat' ? 'bg-warning/10 text-warning'
                      : 'bg-danger/10 text-danger'
                }`}>
                  {item.status === 'published' ? '已发布' : item.status === 'saved_to_wechat' ? '草稿' : '失败'}
                </span>
                <span className="text-xs text-text-muted tabular-nums">{item.publish_time ? new Date(item.publish_time).toLocaleString() : '-'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
