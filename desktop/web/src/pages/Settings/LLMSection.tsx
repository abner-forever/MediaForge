import { useEffect, useState } from 'react';
import type { SettingsData } from '../../api/client';
import Select from '../../components/Select';
import EyeIcon from '../../components/EyeIcon';
import { useLoading } from '../../hooks/useLoading';
import { useStore } from '../../stores';
import { settingsApi } from '../../api/client';
import { PROVIDERS } from './providers';

export default function LLMSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const addToast = useStore(s => s.addToast);
  const { loading: saving, withLoading: withSave } = useLoading();
  const [provider, setProvider] = useState(data.ai_provider);
  const [model, setModel] = useState(data.ai_model);
  const [baseUrl, setBaseUrl] = useState(data.ai_base_url);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fullKey, setFullKey] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testDetails, setTestDetails] = useState<{ url: string; status?: number; summary: string; detail: string }[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState('');
  const current = PROVIDERS[provider];

  useEffect(() => {
    if (data.ai_api_keys?.[provider]) {
      settingsApi.getKey(provider).then(({ key }) => {
        if (key) setFullKey(key);
      }).catch(() => {});
    }
  }, [provider]);

  useEffect(() => {
    if (data.ai_api_keys?.[provider]) {
      fetchBalance();
    }
  }, []);

  async function fetchBalance(opts?: { provider?: string; base_url?: string; api_key?: string }) {
    setBalanceLoading(true);
    setBalanceMessage('');
    try {
      const res = await settingsApi.aiBalance({
        provider: opts?.provider || provider,
        base_url: opts?.base_url || baseUrl,
        api_key: opts?.api_key || fullKey || apiKey || undefined,
      });
      if (res.success && res.balance) {
        setBalance(res.balance);
        setBalanceMessage('');
      } else {
        setBalance(null);
        setBalanceMessage(res.message || '无法获取余额');
      }
    } catch {
      setBalance(null);
      setBalanceMessage('查询失败');
    }
    setBalanceLoading(false);
  }

  function formatBalanceLabel(): string {
    if (!balance) return '';
    // DeepSeek: balance_infos[]
    if (Array.isArray(balance.balance_infos) && balance.balance_infos.length > 0) {
      const info = balance.balance_infos[0];
      const sym = info.currency === 'CNY' ? '¥' : '$';
      return `${sym}${parseFloat(info.total_balance).toFixed(2)}`;
    }
    if (typeof balance.balance === 'number') {
      return `¥${balance.balance.toFixed(2)}`;
    }
    if (typeof balance.total_granted === 'number') {
      const available = balance.total_available ?? (balance.total_granted - balance.total_used);
      return `$${available.toFixed(2)}`;
    }
    return '';
  }

  function formatBalanceDetails(): { label: string; value: string }[] | null {
    if (!balance) return null;
    // DeepSeek: balance_infos[]
    if (Array.isArray(balance.balance_infos) && balance.balance_infos.length > 0) {
      const info = balance.balance_infos[0];
      return [
        { label: '总余额', value: `${info.currency === 'CNY' ? '¥' : '$'}${parseFloat(info.total_balance).toFixed(2)}` },
        { label: '充值', value: `${info.currency === 'CNY' ? '¥' : '$'}${parseFloat(info.topped_up_balance).toFixed(2)}` },
        { label: '赠送', value: `${info.currency === 'CNY' ? '¥' : '$'}${parseFloat(info.granted_balance).toFixed(2)}` },
        { label: '状态', value: balance.is_available ? '可用' : '不可用' },
      ];
    }
    if (typeof balance.balance === 'number') {
      return [
        { label: '余额', value: `¥${balance.balance.toFixed(2)}` },
        { label: '状态', value: balance.is_available ? '可用' : '不可用' },
      ];
    }
    if (typeof balance.total_granted === 'number') {
      return [
        { label: '总额度', value: `$${balance.total_granted.toFixed(2)}` },
        { label: '已使用', value: `$${balance.total_used.toFixed(2)}` },
        { label: '剩余', value: `$${(balance.total_granted - balance.total_used).toFixed(2)}` },
      ];
    }
    return null;
  }

  function balanceRawDisplay(): string {
    if (!balance) return '';
    try { return JSON.stringify(balance); } catch { return ''; }
  }

  function handleProviderChange(p: string) {
    const prev = provider;
    setProvider(p);
    const c = PROVIDERS[p];
    if (c) { setBaseUrl(c.baseUrl); setModel(c.models[0]); }
    setApiKey('');
    setFullKey('');
    setTestState('idle');
    setTestMessage('');
    setTestDetails([]);
    if (p !== prev && !data.ai_api_keys?.[p]) {
      settingsApi.getKey(p).then(({ key }) => {
        if (key) setApiKey(key);
      }).catch(() => {});
    }
    if (data.ai_api_keys?.[p]) {
      fetchBalance({ provider: p, base_url: PROVIDERS[p]?.baseUrl });
    } else {
      setBalance(null);
      setBalanceMessage('未配置 API Key');
    }
  }

  async function testConnection() {
    setTestState('testing');
    setTestMessage('');
    setTestDetails([]);
    try {
      const res = await settingsApi.testAiConnection({
        provider, model, base_url: baseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      setTestState(res.success ? 'success' : 'error');
      setTestMessage(res.message);
      setTestDetails(res.errors || []);
    } catch (err: any) {
      setTestState('error');
      setTestMessage(err.message || '测试失败');
      setTestDetails([]);
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
      <div className="bg-bg-secondary rounded-xl p-3 space-y-2">
        <p className="text-xs text-text-muted leading-relaxed">Base URL 请填写 OpenAI 兼容地址，以 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/v1</code> 结尾。系统自动拼接 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/chat/completions</code>。</p>
        {current && (
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary transition-colors select-none">
              📖 如何获取 {current.name} API Key
            </summary>
            <div className="mt-2 pl-2 border-l-2 border-border space-y-1">
              <p>{current.guide}</p>
              <a href={current.guideUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                {current.guideUrl}
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M7 7h10v10" /></svg>
              </a>
            </div>
          </details>
        )}
      </div>

      {/* 余额展示 */}
      <div className="bg-bg-secondary rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">账户余额</span>
          <button type="button" onClick={() => fetchBalance()} disabled={balanceLoading} className="text-xs text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1">
            <svg className={`w-3 h-3 ${balanceLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            刷新
          </button>
        </div>
        {balance || balanceMessage ? (
          balance ? (
            <div>
              <span className="text-lg font-semibold">{formatBalanceLabel()}</span>
              {formatBalanceDetails() ? (
                <div className="flex gap-4 mt-1 text-xs text-text-muted">
                  {formatBalanceDetails()!.map(d => (
                    <span key={d.label}>{d.label}: {d.value}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted mt-1 break-all">{balanceRawDisplay()}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted mt-1">{balanceMessage}</p>
          )
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl }; if (apiKey) u[current?.keyName || 'AI_API_KEY'] = apiKey; await save(u); setTestState('idle'); setTestMessage(''); setTestDetails([]); })} disabled={saving}>
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存模型配置'}
        </button>
        <button className="btn" onClick={testConnection} disabled={testState === 'testing'}>
          {testState === 'testing' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin mr-1" /> 测试中</> : '测试连接'}
        </button>
        {testState === 'success' && (
          <span className="text-xs text-[var(--success)] flex items-center gap-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            {testMessage}
          </span>
        )}
      </div>
      {testState === 'error' && (
        <div className="rounded-lg border border-[var(--danger)]/20 bg-[var(--danger)]/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <span className="text-sm text-[var(--danger)]">{testMessage}</span>
          </div>
          {testDetails.length > 0 && (
            <details className="text-xs text-text-muted group">
              <summary className="cursor-pointer hover:text-text-secondary transition-colors select-none flex items-center gap-1">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                查看详情
              </summary>
              <div className="mt-2 space-y-2">
                {testDetails.map((err, i) => (
                  <div key={i} className="rounded bg-bg-secondary p-2 space-y-1">
                    <div className="flex items-center gap-2 text-text-secondary">
                      <code className="text-[11px] px-1 py-0.5 bg-bg rounded break-all">{err.url}</code>
                      {err.status && <span className="text-[var(--danger)]">HTTP {err.status}</span>}
                    </div>
                    <pre className="text-[11px] text-text-muted whitespace-pre-wrap break-all max-h-32 overflow-auto m-0 bg-bg p-2 rounded">{err.detail}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
