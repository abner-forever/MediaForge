import { useEffect, useState } from 'react';
import { useStore, THEME_PRESETS } from '../stores';
import { settingsApi, type SettingsData, type WeiboLoginEvent } from '../api/client';
import Select from '../components/Select';
import NumberInput from '../components/NumberInput';
import EyeIcon from '../components/EyeIcon';
import { useLoading } from '../hooks/useLoading';

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
  if (!data) return <div className="empty-state py-24 animate-in"><div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin mb-3" /><span className="text-sm text-text-muted">加载中...</span></div>;

  async function save(updates: Record<string, string>) {
    try { await settingsApi.save(updates); addToast('配置已保存', 'success'); settingsApi.get().then(setData); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">系统设置</h1>
        <p className="text-sm text-text-secondary mt-1">修改后点击保存，配置将写入 .env 文件并立即生效</p>
      </div>

      {/* Tabs */}
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

function GeneralTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  return <div className="space-y-4"><ThemeSection /><RunSection data={data} save={save} /></div>;
}

function ThemeSection() {
  const { theme, setTheme, accentId, setAccentId } = useStore();
  return (
    <div className="card space-y-5">
      <div className="section-header">主题管理</div>
      <div>
        <p className="text-xs text-text-muted mb-3">显示模式</p>
        <div className="flex gap-2">
          {[{ value: 'light', icon: '☀️', label: '浅色' }, { value: 'dark', icon: '🌙', label: '深色' }, { value: 'auto', icon: '💻', label: '跟随系统' }].map(t => (
            <button key={t.value} onClick={() => setTheme(t.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-all ${
                theme === t.value
                  ? 'border-accent bg-accent-soft text-accent shadow-sm'
                  : 'border-border bg-bg-secondary text-text-muted hover:border-accent/40 hover:text-text-secondary'
              }`}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-text-muted mb-3">主题配色</p>
        <div className="grid grid-cols-4 gap-3">
          {THEME_PRESETS.map(preset => (
            <button key={preset.id} onClick={() => setAccentId(preset.id)}
              className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-all ${
                accentId === preset.id
                  ? 'border-accent bg-accent-soft shadow-sm ring-1 ring-accent/20'
                  : 'border-border bg-bg-secondary hover:border-accent/40'
              }`}>
              <div className="flex gap-1.5">
                <span className="w-4 h-4 rounded-full ring-1 ring-black/10" style={{ background: preset.light }} />
                <span className="w-4 h-4 rounded-full ring-1 ring-black/10" style={{ background: preset.dark }} />
              </div>
              <span className="text-[11px] text-text-secondary font-medium">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [platform, setPlatform] = useState(data.platform);
  const [postLimit, setPostLimit] = useState(data.post_limit);
  const [weiboPages, setWeiboPages] = useState(data.weibo_pages);
  const [interval, setInterval_] = useState(data.publish_interval);
  const [timeout, setTimeout_] = useState(data.request_timeout);
  const [retry, setRetry] = useState(data.retry_times);
  const [confirm, setConfirm] = useState(data.require_confirm);

  return (
    <div className="card space-y-4">
      <div className="section-header">运行参数</div>
      <div className="grid grid-cols-2 gap-4">
        <label>激活平台<Select value={platform} onChange={setPlatform} options={[{ label: '微博', value: 'weibo' }, { label: '今日头条', value: 'toutiao' }]} /></label>
        <label>每次条数<NumberInput value={postLimit} onChange={setPostLimit} min={1} max={20} /></label>
        <label>抓取页数<NumberInput value={weiboPages} onChange={setWeiboPages} min={1} max={5} /></label>
        <label>发布间隔<NumberInput value={interval} onChange={setInterval_} min={5} max={60} /></label>
        <label>请求超时<NumberInput value={timeout} onChange={setTimeout_} min={5} max={60} /></label>
        <label>重试次数<NumberInput value={retry} onChange={setRetry} min={1} max={5} /></label>
        <label className="toggle col-span-2">
          <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">发布前需确认</span>
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => save({ PLATFORM: platform, POST_LIMIT: String(postLimit), WEIBO_PAGES: String(weiboPages), PUBLISH_INTERVAL_SECONDS: String(interval), REQUEST_TIMEOUT: String(timeout), RETRY_TIMES: String(retry), REQUIRE_CONFIRM: confirm ? 'true' : 'false' }))} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存运行参数'}
      </button>
    </div>
  );
}

function SystemTab({ data, save, onReload }: { data: SettingsData; save: (u: Record<string, string>) => void; onReload: () => Promise<void> }) {
  return <div className="space-y-4"><LLMSection data={data} save={save} /><WeiboSection data={data} save={save} onReload={onReload} /><ToutiaoSection data={data} save={save} /><WatermarkSection data={data} save={save} /><MaterialsSection data={data} save={save} /></div>;
}

const PROVIDERS: Record<string, { name: string; models: string[]; baseUrl: string; keyName: string; urlHint: string }> = {
  mimo: { name: '小米 MiMo', models: ['mimo-chat', 'mimo-v2.5-pro'], baseUrl: 'https://api.xiaomimimo.com/v1', keyName: 'MIMO_API_KEY', urlHint: '小米 Mimo OpenAI 兼容地址，格式：https://api.xiaomimimo.com/v1' },
  deepseek: { name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], baseUrl: 'https://api.deepseek.com/v1', keyName: 'DEEPSEEK_API_KEY', urlHint: 'DeepSeek API 地址，格式：https://api.deepseek.com/v1' },
  openai: { name: 'OpenAI', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'], baseUrl: 'https://api.openai.com/v1', keyName: 'OPENAI_API_KEY', urlHint: 'OpenAI API 地址，格式：https://api.openai.com/v1' },
  glm: { name: '智谱 GLM', models: ['GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-Flash', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4-Long'], baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyName: 'GLM_API_KEY', urlHint: '智谱 API 地址，格式：https://open.bigmodel.cn/api/paas/v4' },
};

function LLMSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [provider, setProvider] = useState(data.ai_provider);
  const [model, setModel] = useState(data.ai_model);
  const [baseUrl, setBaseUrl] = useState(data.ai_base_url);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fullKey, setFullKey] = useState('');
  const current = PROVIDERS[provider];

  function handleProviderChange(p: string) { setProvider(p); const c = PROVIDERS[p]; if (c) { setBaseUrl(c.baseUrl); setModel(c.models[0]); } setApiKey(''); setFullKey(''); }
  async function toggleKeyVisibility() {
    if (showKey) { setShowKey(false); return; }
    if (!fullKey) { try { setFullKey((await settingsApi.getKey(provider)).key); } catch {} }
    setShowKey(true);
  }
  const currentKey = data.ai_api_keys?.[provider] || '';
  const displayKey = showKey ? (fullKey || apiKey) : (apiKey || currentKey);

  return (
    <div className="card space-y-4">
      <div className="section-header">大模型配置</div>
      <div className="grid grid-cols-2 gap-4">
        <label>AI 服务商<Select value={provider} onChange={handleProviderChange} options={Object.entries(PROVIDERS).map(([k, v]) => ({ label: v.name, value: k }))} /></label>
        <label>模型<Select value={model} onChange={setModel} options={(current?.models || []).map(m => ({ label: m, value: m }))} /></label>
        <label className="col-span-2">Base URL<input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={current?.urlHint} /></label>
        <label className="col-span-2">API Key
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={displayKey} onChange={e => { setApiKey(e.target.value); setFullKey(''); }} placeholder={currentKey ? '已设置（留空保持不变）' : `请输入 ${current?.keyName || 'API Key'}`} className="w-full pr-9" />
            {currentKey && <button type="button" onClick={toggleKeyVisibility} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors"><EyeIcon visible={showKey} /></button>}
          </div>
        </label>
      </div>
      <div className="bg-bg-secondary rounded-xl p-3">
        <p className="text-xs text-text-muted leading-relaxed">Base URL 请填写 OpenAI 兼容地址，以 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/v1</code> 结尾。系统自动拼接 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">/chat/completions</code>。</p>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl }; if (apiKey) u[current?.keyName || 'AI_API_KEY'] = apiKey; await save(u); })} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存模型配置'}
      </button>
    </div>
  );
}

function WeiboSection({ data, save, onReload }: { data: SettingsData; save: (u: Record<string, string>) => void; onReload?: () => Promise<void> }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [cookie, setCookie] = useState(data.weibo_cookie || '');
  const [uid, setUid] = useState(data.weibo_uid);
  const [screenName, setScreenName] = useState(data.weibo_screen_name || '');
  const [avatar, setAvatar] = useState(data.weibo_avatar || '');
  const [fetchMode, setFetchMode] = useState(data.weibo_fetch_mode);
  const [celebs, setCelebs] = useState(data.weibo_celebrities);
  const [tags, setTags] = useState(data.weibo_search_tags);
  const [sceneTags, setSceneTags] = useState(data.weibo_scene_extra_tags);
  const [superTopics, setSuperTopics] = useState(data.weibo_super_topics);
  const [loginState, setLoginState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loginMessage, setLoginMessage] = useState('');
  const [cookieRevealed, setCookieRevealed] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const { addToast } = useStore();

  /** 实际 cookie 明文值 */
  const rawCookie = cookie || data.weibo_cookie || '';

  /** 脱敏显示：保留前 4 和后 4 字符，中间用 *** 代替 */
  function maskCookie(val: string): string {
    if (!rawCookie) return '<未设置>';
    if (rawCookie.length <= 12) return rawCookie;
    return rawCookie.slice(0, 4) + '***' + rawCookie.slice(-4);
  }

  async function handleCopyCookie() {
    if (!rawCookie) { addToast('没有可复制的 Cookie', 'error'); return; }
    try {
      await navigator.clipboard.writeText(rawCookie);
      addToast('Cookie 已复制到剪贴板', 'success');
    } catch {
      addToast('复制失败', 'error');
    }
  }

  async function handleVerify() {
    if (!rawCookie) {
      setVerifyState('invalid');
      setVerifyMessage('请先填写或登录获取微博 Cookie');
      return;
    }
    setVerifyState('verifying');
    setVerifyMessage('');
    try {
      const result = await settingsApi.verifyWeibo(cookie || data.weibo_cookie || undefined);
      if (result.valid) {
        setVerifyState('valid');
        setVerifyMessage(`账号：${result.screen_name || ''}（${result.uid || ''}）`);
        if (result.screen_name) setScreenName(result.screen_name);
        if (result.uid) setUid(result.uid);
        if (result.avatar) setAvatar(result.avatar);
      } else {
        setVerifyState('invalid');
        setVerifyMessage(result.message || 'Cookie 无效');
      }
    } catch (err: any) {
      setVerifyState('invalid');
      setVerifyMessage(err.message || '验证失败');
    }
  }

  async function handleWeiboLogin() {
    setLoginState('loading');
    setLoginMessage('正在启动浏览器...');
    try {
      await settingsApi.weiboLogin((evt: WeiboLoginEvent) => {
        if (evt.type === 'progress') {
          setLoginMessage(evt.message || '');
        } else if (evt.type === 'done') {
          if (evt.cookie) setCookie(evt.cookie);
          if (evt.uid) setUid(evt.uid);
          if (evt.screen_name) setScreenName(evt.screen_name);
          if (evt.avatar) setAvatar(evt.avatar);
          setLoginState('idle');
          setLoginMessage('登录成功，Cookie 已自动填入');
          addToast('微博登录成功，请点击保存', 'success');
        } else if (evt.type === 'error') {
          setLoginState('error');
          setLoginMessage(evt.message || '登录失败');
          addToast(evt.message || '微博登录失败', 'error');
        }
      });
    } catch (err: any) {
      setLoginState('error');
      setLoginMessage(err.message || '登录异常');
      addToast(err.message || '登录异常', 'error');
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="section-header">微博配置</div>
        <div className="flex items-center gap-2">
          {loginState === 'loading' && (
            <span className="text-xs text-text-muted flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {loginMessage}
            </span>
          )}
          {loginState === 'error' && (
            <span className="text-xs text-danger">{loginMessage}</span>
          )}
          <button className="btn btn-sm" onClick={handleWeiboLogin} disabled={loginState === 'loading'}>
            {loginState === 'loading' ? '登录中...' : '微博快速登录'}
          </button>
        </div>
      </div>

      {/* 用户信息展示 */}
      {screenName && (
        <div className="bg-accent-soft/40 border border-accent/20 rounded-xl px-4 py-3 flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={screenName} className="w-9 h-9 rounded-full shrink-0 object-cover border border-accent/20"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
          ) : null}
          <div className={`w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0 ${avatar ? 'hidden' : ''}`}>
            {screenName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{screenName}</p>
            <p className="text-xs text-text-muted">UID: {uid || '未知'}</p>
          </div>
          <div className="text-xs text-accent font-medium bg-accent/10 px-2 py-1 rounded-lg">已登录</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span>微博 Cookie</span>
            <div className="flex items-center gap-1">
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={() => setCookieRevealed(!cookieRevealed)}>
                {cookieRevealed ? '隐藏' : '显示'}
              </button>
              <button type="button" className="text-xs text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-lg hover:bg-bg-secondary transition-colors" onClick={handleCopyCookie}>
                复制
              </button>
            </div>
          </div>
          <textarea value={cookieRevealed ? rawCookie : maskCookie('')} onChange={e => { setCookie(e.target.value); setCookieRevealed(true); }} placeholder={data.weibo_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} className="font-mono text-xs" readOnly={!cookieRevealed && !cookie} />
        </label>
        <label>微博 UID<input type="text" value={uid} onChange={e => setUid(e.target.value)} placeholder="留空自动推断" /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '本人时间线', value: 'own' }, { label: '明星列表', value: 'celebrities' }, { label: '混合模式', value: 'mixed' }, { label: '超话抓取', value: 'super_topic' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label>明星列表<input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} placeholder="迪丽热巴,杨幂（逗号分隔）" /></label>
        <label>搜索标签<input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="写真,街拍（逗号分隔）" /></label>
        <label>超话列表<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="迪丽热巴超话,杨幂超话（逗号分隔）" /></label>
        <label>场景标签<input type="text" value={sceneTags} onChange={e => setSceneTags(e.target.value)} placeholder="例如：写真,街拍" /></label>
      </div>

      {/* 验证结果 — Ant Design Alert 风格 */}
      {(verifyMessage || (!rawCookie && verifyState === 'idle')) && (
        <div className={`relative overflow-hidden rounded-xl border-l-4 ${
          verifyState === 'valid' ? 'border-l-green-500 text-green-600 dark:text-green-400' :
          verifyState === 'invalid' || verifyMessage ? 'border-l-danger text-danger' :
          'border-l-warning text-amber-600 dark:text-amber-400'
        }`} style={{
          background: verifyState === 'valid'
            ? '#22c55e1a'
            : verifyState === 'invalid' || verifyMessage
              ? '#ef44441a'
              : '#f59e0b1a'
        }}>
          <div className="px-4 py-3 flex items-start gap-3">
            {verifyState === 'valid' ? (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
            ) : verifyState === 'invalid' || (verifyMessage && !rawCookie) ? (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            ) : (
              <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {verifyState === 'valid' ? '验证通过' :
                 verifyState === 'invalid' ? 'Cookie 无效或已过期' :
                 verifyMessage ? '配置提示' : 'Cookie 未配置'}
              </p>
              <p className="text-xs mt-1 opacity-80 leading-relaxed">{verifyMessage || '请先通过微博快速登录获取 Cookie，或手动填写'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { WEIBO_COOKIE: rawCookie, WEIBO_UID: uid, WEIBO_SCREEN_NAME: screenName, WEIBO_AVATAR: avatar, WEIBO_FETCH_MODE: fetchMode, WEIBO_CELEBRITIES: celebs, WEIBO_SEARCH_TAGS: tags, WEIBO_SCENE_EXTRA_TAGS: sceneTags, WEIBO_SUPER_TOPICS: superTopics }; await save(u); })} disabled={saving || loginState === 'loading'}>
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存微博配置'}
        </button>
        <button className="btn btn-sm" onClick={handleVerify} disabled={verifyState === 'verifying'}>
          {verifyState === 'verifying' ? <><span className="w-3 h-3 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin mr-1" /> 验证中</> : '测试连接'}
        </button>
        <button className="btn btn-sm btn-danger ml-auto" onClick={async () => {
          if (!window.confirm('确定清空微博鉴权信息（Cookie、UID）吗？')) return;
          try {
            await settingsApi.clearWeibo();
            setCookie('');
            setUid('');
            setScreenName('');
            setAvatar('');
            setVerifyState('idle');
            setVerifyMessage('');
            addToast('微博鉴权信息已清空', 'success');
            onReload?.();
          } catch (err: any) {
            addToast(err.message, 'error');
          }
        }}>
          清空
        </button>
      </div>
    </div>
  );
}

function ToutiaoSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [cookie, setCookie] = useState('');
  const [userId, setUserId] = useState(data.toutiao_user_id);
  const [fetchMode, setFetchMode] = useState(data.toutiao_fetch_mode);
  const [searchTags, setSearchTags] = useState(data.toutiao_search_tags);

  return (
    <div className="card space-y-4">
      <div className="section-header">今日头条配置</div>
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2">头条 Cookie<textarea value={cookie} onChange={e => setCookie(e.target.value)} placeholder={data.toutiao_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} /></label>
        <label>用户ID<input type="text" value={userId} onChange={e => setUserId(e.target.value)} /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '推荐流', value: 'feed' }, { label: '用户主页', value: 'user' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label className="col-span-2">搜索关键词<input type="text" value={searchTags} onChange={e => setSearchTags(e.target.value)} placeholder="时尚,明星,穿搭（逗号分隔）" /></label>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => { const u: Record<string, string> = { TOUTIAO_USER_ID: userId, TOUTIAO_FETCH_MODE: fetchMode, TOUTIAO_SEARCH_TAGS: searchTags }; if (cookie) u.TOUTIAO_COOKIE = cookie; await save(u); })} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存头条配置'}
      </button>
    </div>
  );
}

function WatermarkSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [wmFilter, setWmFilter] = useState(data.watermark_filter);
  const [wmStrict, setWmStrict] = useState(data.watermark_strict_mode);
  const [minClean, setMinClean] = useState(data.min_clean_images);
  const [wmFallback, setWmFallback] = useState(data.allow_watermark_fallback);
  const [cornerRatio, setCornerRatio] = useState(data.watermark_corner_ratio);
  const [bottomRatio, setBottomRatio] = useState(data.watermark_bottom_ratio);

  return (
    <div className="card space-y-4">
      <div className="section-header">水印过滤</div>
      <div className="grid grid-cols-2 gap-4">
        <label className="toggle">
          <input type="checkbox" checked={wmFilter} onChange={e => setWmFilter(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">启用水印过滤</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={wmStrict} onChange={e => setWmStrict(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">严格模式</span>
        </label>
        <label>最少无水印图片数<NumberInput value={minClean} onChange={setMinClean} min={1} max={10} /></label>
        <label className="toggle">
          <input type="checkbox" checked={wmFallback} onChange={e => setWmFallback(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">允许降级</span>
        </label>
        <label><div className="flex items-center justify-between"><span>角标阈值</span><span className="text-xs font-mono text-accent tabular-nums">{cornerRatio.toFixed(2)}</span></div><input type="range" min={1.0} max={2.0} step={0.02} value={cornerRatio} onChange={e => setCornerRatio(+e.target.value)} /></label>
        <label><div className="flex items-center justify-between"><span>底边阈值</span><span className="text-xs font-mono text-accent tabular-nums">{bottomRatio.toFixed(2)}</span></div><input type="range" min={1.0} max={2.0} step={0.02} value={bottomRatio} onChange={e => setBottomRatio(+e.target.value)} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => save({ WATERMARK_FILTER: wmFilter ? 'true' : 'false', WATERMARK_STRICT_MODE: wmStrict ? 'true' : 'false', MIN_CLEAN_IMAGES: String(minClean), ALLOW_WATERMARK_FALLBACK: wmFallback ? 'true' : 'false', WATERMARK_CORNER_RATIO: String(cornerRatio), WATERMARK_BOTTOM_RATIO: String(bottomRatio) }))} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存水印配置'}
      </button>
    </div>
  );
}

function MaterialsSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const { addToast } = useStore();
  const [materialsPath, setMaterialsPath] = useState(data.download_dir);
  const [browsing, setBrowsing] = useState(false);

  // 保存后同步外部数据变化到本地状态
  useEffect(() => {
    setMaterialsPath(data.download_dir);
  }, [data.download_dir]);

  async function handleBrowse() {
    setBrowsing(true);
    try {
      const res = await fetch('/api/pick-folder');
      const { path } = await res.json();
      if (path) setMaterialsPath(path);
    } catch (err: any) {
      addToast(err.message || '选择文件夹失败', 'error');
    } finally {
      setBrowsing(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="section-header">素材保存位置</div>
      <div className="space-y-2">
        <p className="text-xs text-text-muted">图片下载后的本地保存目录，置空恢复默认路径</p>
        <div className="flex gap-2">
          <input type="text" value={materialsPath} onChange={e => setMaterialsPath(e.target.value)} placeholder="默认路径" className="flex-1" />
          <button type="button" className="btn btn-sm" onClick={handleBrowse} disabled={browsing}>
            {browsing ? '选择中...' : '选择文件夹'}
          </button>
        </div>
      </div>
      <button className="btn btn-primary" onClick={() => withSave(async () => save({ MATERIALS_PATH: materialsPath }))} disabled={saving}>
        {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 保存中</> : '保存'}
      </button>
    </div>
  );
}
