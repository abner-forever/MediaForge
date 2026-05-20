import { useEffect, useState } from 'react';
import type { SettingsData } from '../../api/client';
import Select from '../../components/Select';
import EyeIcon from '../../components/EyeIcon';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import { settingsApi } from '../../api/client';
import { PROVIDERS } from './providers';

export default function LLMSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { addToast } = useStore();
  const { loading: saving, withLoading: withSave } = useLoading();
  const [provider, setProvider] = useState(data.ai_provider);
  const [model, setModel] = useState(data.ai_model);
  const [baseUrl, setBaseUrl] = useState(data.ai_base_url);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fullKey, setFullKey] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const current = PROVIDERS[provider];

  useEffect(() => {
    if (data.ai_api_keys?.[provider]) {
      settingsApi.getKey(provider).then(({ key }) => {
        if (key) setFullKey(key);
      }).catch(() => {});
    }
  }, [provider]);

  function handleProviderChange(p: string) {
    const prev = provider;
    setProvider(p);
    const c = PROVIDERS[p];
    if (c) { setBaseUrl(c.baseUrl); setModel(c.models[0]); }
    setApiKey('');
    setFullKey('');
    setTestState('idle');
    setTestMessage('');
    if (p !== prev && !data.ai_api_keys?.[p]) {
      settingsApi.getKey(p).then(({ key }) => {
        if (key) setApiKey(key);
      }).catch(() => {});
    }
  }

  async function testConnection() {
    setTestState('testing');
    setTestMessage('');
    try {
      const res = await settingsApi.testAiConnection({
        provider, model, base_url: baseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setTestState(res.success ? 'success' : 'error');
      setTestMessage(res.message);
    } catch (err: any) {
      setTestState('error');
      setTestMessage(err.message || '测试失败');
    }
  }

  function maskKey(key: string): string {
    if (!key || key.length <= 8) return key;
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  async function toggleKeyVisibility() {
    if (showKey) { setShowKey(false); return; }
    if (!fullKey) { try { setFullKey((await settingsApi.getKey(provider)).key); } catch {} }
    setShowKey(true);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }

  async function copyApiKey() {
    const text = fullKey || apiKey;
    if (text) {
      copyToClipboard(text);
      addToast('已复制', 'success');
      return;
    }
    try {
      const { key } = await settingsApi.getKey(provider);
      if (key) {
        copyToClipboard(key);
        addToast('已复制', 'success');
        setFullKey(key);
      }
    } catch { /* ignore */ }
  }

  const currentKey = data.ai_api_keys?.[provider] || '';
  const displayValue = showKey
    ? (fullKey || apiKey)
    : (apiKey ? maskKey(apiKey) : (currentKey ? maskKey(currentKey) : ''));

  return (
    <div className="card space-y-4">
      <div className="section-header">大模型配置</div>
      <div className="grid grid-cols-2 gap-4">
        <label>AI 服务商<Select value={provider} onChange={handleProviderChange} options={Object.entries(PROVIDERS).map(([k, v]) => ({ label: v.name, value: k }))} /></label>
        <label>模型<Select value={model} onChange={setModel} options={(current?.models || []).map(m => ({ label: m, value: m }))} /></label>
        <label className="col-span-2">Base URL<input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={current?.urlHint} /></label>
        <label className="col-span-2">API Key
          <div className="relative">
            <input type="text" value={displayValue} onChange={e => { setApiKey(e.target.value); setFullKey(''); }} placeholder={`请输入 ${current?.keyName || 'API Key'}`} className="w-full pr-16" />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
              <button type="button" onClick={copyApiKey} className="p-1 text-text-muted hover:text-text-secondary transition-colors" title="复制">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button type="button" onClick={toggleKeyVisibility} className="p-1 text-text-muted hover:text-text-secondary transition-colors" title={showKey ? '隐藏' : '显示'}>
                <EyeIcon visible={showKey} />
              </button>
            </div>
          </div>
        </label>
      </div>
      <div className="bg-bg-secondary rounded-xl p-3">
        <p className="text-xs text-text-muted leading-relaxed">Base URL 请填写 OpenAI 兼容地址，以 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/v1</code> 结尾。系统自动拼接 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/chat/completions</code>。</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl }; if (apiKey) u[current?.keyName || 'AI_API_KEY'] = apiKey; await save(u); setTestState('idle'); setTestMessage(''); })} disabled={saving}>
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存模型配置'}
        </button>
        <button className="btn btn-sm" onClick={testConnection} disabled={testState === 'testing'}>
          {testState === 'testing' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin mr-1" /> 测试中</> : '测试连接'}
        </button>
        {testState !== 'idle' && (
          <span className="text-xs" style={{ color: testState === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {testMessage}
          </span>
        )}
      </div>
    </div>
  );
}
