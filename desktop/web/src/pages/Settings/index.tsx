import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../stores';
import { settingsApi, type SettingsData } from '../../api/client';
import Loading from '../../components/Loading';
import { useLoading } from '../../hooks/useLoading';
import GeneralTab from './GeneralTab';
import SystemTab from './SystemTab';

const TABS = [
  { id: 'general', label: '常规设置' },
  { id: 'system', label: '业务设置' },
];

const GENERAL_SUB = ['theme', 'run', 'about'];
const SYSTEM_SUB = ['llm', 'media-source', 'wechat', 'watermark', 'materials'];

function parseHash(hash: string): { tab: string; sub: string } {
  const h = hash.replace(/^#/, '');
  if (!h) return { tab: 'general', sub: 'theme' };
  const [tab, ...rest] = h.split('-');
  const sub = rest.join('-');
  if (tab === 'general' && GENERAL_SUB.includes(sub)) return { tab, sub };
  if (tab === 'system' && SYSTEM_SUB.includes(sub)) return { tab, sub };
  return { tab: 'general', sub: 'theme' };
}

function getHash(): string {
  return window.location.hash;
}

export default function Settings() {
  const addToast = useStore(s => s.addToast);
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => parseHash(getHash()).tab);
  const [subTab, setSubTab] = useState(() => parseHash(getHash()).sub);
  const { loading: retrying, withLoading: withRetry } = useLoading();

  async function load() {
    await withRetry(async () => {
      try { setData(await settingsApi.get()); setError(''); }
      catch (err: any) { setError(err.message || '加载失败'); }
    });
  }
  useEffect(() => { load(); }, []);

  // 同步 hash → 状态：监听 useLocation 和原生 hashchange（双保险）
  useEffect(() => {
    const sync = () => {
      const { tab, sub } = parseHash(getHash());
      setActiveTab(tab);
      setSubTab(sub);
    };
    // useLocation 触发时同步
    sync();
    // 原生 hashchange 兜底（react-router 同路由 hash 变化可能不触发 location 更新）
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [location.hash]);

  function switchTab(tab: string) {
    const sub = tab === 'general' ? 'theme' : 'llm';
    setActiveTab(tab);
    setSubTab(sub);
    navigate({ hash: `${tab}-${sub}` }, { replace: true });
  }

  function switchSubTab(sub: string) {
    setSubTab(sub);
    navigate({ hash: `${activeTab}-${sub}` }, { replace: true });
  }

  if (error) return <div className="empty-state py-24 animate-in"><p className="text-sm text-danger">{error}</p><button className="btn btn-sm mt-3" onClick={load} disabled={retrying}>{retrying ? '重试中...' : '重试'}</button></div>;
  if (!data) return <div className="empty-state py-24 animate-in"><Loading text="加载中" /></div>;

  async function save(updates: Record<string, string>) {
    try { await settingsApi.save(updates); addToast('配置已保存', 'success'); settingsApi.get().then(setData); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">设置</h1>
        <p className="text-sm text-text-secondary mt-1">修改后点击保存，配置将立即生效</p>
      </div>

      <div className="flex gap-0 border-b border-border">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => switchTab(tab.id)}
            className={`relative px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-accent'
                : 'text-text-muted hover:text-text-secondary'
            }`}>
            {tab.label}
            {activeTab === tab.id && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab data={data} save={save} subTab={subTab} onSubTabChange={switchSubTab} />}
      {activeTab === 'system' && <SystemTab data={data} save={save} onReload={load} subTab={subTab} onSubTabChange={switchSubTab} />}
    </div>
  );
}
