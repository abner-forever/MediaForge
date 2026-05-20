import { useEffect, useState } from 'react';
import { useStore } from '../../stores';
import { settingsApi, type SettingsData } from '../../api/client';
import Loading from '../../components/Loading';
import { useLoading } from '../../hooks/useLoading';
import GeneralTab from './GeneralTab';
import SystemTab from './SystemTab';

const TABS = [
  { id: 'general', label: '常规设置' },
  { id: 'system', label: '系统设置' },
];

export default function Settings() {
  const { addToast } = useStore();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const { loading: retrying, withLoading: withRetry } = useLoading();

  async function load() {
    await withRetry(async () => {
      try { setData(await settingsApi.get()); setError(''); }
      catch (err: any) { setError(err.message || '加载失败'); }
    });
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="empty-state py-24 animate-in"><p className="text-sm text-danger">{error}</p><button className="btn btn-sm mt-3" onClick={load} disabled={retrying}>{retrying ? '重试中...' : '重试'}</button></div>;
  if (!data) return <div className="empty-state py-24 animate-in"><Loading text="加载中" /></div>;

  async function save(updates: Record<string, string>) {
    try { await settingsApi.save(updates); addToast('配置已保存', 'success'); settingsApi.get().then(setData); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">系统设置</h1>
        <p className="text-sm text-text-secondary mt-1">修改后点击保存，配置将立即生效</p>
      </div>

      <div className="flex gap-0 border-b border-border">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
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

      {activeTab === 'general' && <GeneralTab data={data} save={save} />}
      {activeTab === 'system' && <SystemTab data={data} save={save} onReload={load} />}
    </div>
  );
}
