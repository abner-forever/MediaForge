import { useEffect, useState } from 'react';
import { useStore, THEME_PRESETS } from '../stores';
import { settingsApi, type SettingsData } from '../api/client';
import Select from '../components/Select';
import NumberInput from '../components/NumberInput';
import EyeIcon from '../components/EyeIcon';

const TABS = [
  { id: 'general', label: '常规设置' },
  { id: 'system', label: '系统设置' },
];

export default function Settings() {
  const { addToast } = useStore();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('general');

  async function load() {
    try { setData(await settingsApi.get()); setError(''); }
    catch (err: any) { setError(err.message || '加载失败'); }
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="empty-state py-20 animate-in"><p className="text-sm text-danger">{error}</p><button className="btn btn-sm mt-3" onClick={load}>重试</button></div>;
  if (!data) return <div className="empty-state py-20 animate-in"><div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin mb-3" /><span className="text-sm text-text-muted">加载中...</span></div>;

  async function save(updates: Record<string, string>) {
    try { await settingsApi.save(updates); addToast('配置已保存', 'success'); settingsApi.get().then(setData); }
    catch (err: any) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-5 animate-in">
      <div>
        <h2 className="text-xl font-bold text-text tracking-tight">系统设置</h2>
        <p className="text-sm text-text-secondary mt-1">修改后点击保存，配置将写入 .env 文件并立即生效</p>
      </div>

      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab data={data} save={save} />}
      {activeTab === 'system' && <SystemTab data={data} save={save} />}
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
        <p className="text-xs text-text-muted mb-2">显示模式</p>
        <div className="flex gap-2">
          {[{ value: 'light', icon: '☀️', label: '浅色' }, { value: 'dark', icon: '🌙', label: '深色' }, { value: 'auto', icon: '💻', label: '跟随系统' }].map(t => (
            <button key={t.value} onClick={() => setTheme(t.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${theme === t.value ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-bg-secondary text-text-muted hover:border-accent/40'}`}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-text-muted mb-2">主题配色</p>
        <div className="grid grid-cols-4 gap-2">
          {THEME_PRESETS.map(preset => (
            <button key={preset.id} onClick={() => setAccentId(preset.id)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors ${accentId === preset.id ? 'border-accent bg-accent-soft' : 'border-border bg-bg-secondary hover:border-accent/40'}`}>
              <div className="flex gap-1"><span className="w-3.5 h-3.5 rounded-full" style={{ background: preset.light }} /><span className="w-3.5 h-3.5 rounded-full" style={{ background: preset.dark }} /></div>
              <span className="text-[11px] text-text-secondary">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
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
      <div className="grid grid-cols-3 gap-3">
        <label>激活平台<Select value={platform} onChange={setPlatform} options={[{ label: '微博', value: 'weibo' }, { label: '今日头条', value: 'toutiao' }]} /></label>
        <label>每次处理条数<NumberInput value={postLimit} onChange={setPostLimit} min={1} max={20} /></label>
        <label>抓取页数<NumberInput value={weiboPages} onChange={setWeiboPages} min={1} max={5} /></label>
        <label>发布间隔（秒）<NumberInput value={interval} onChange={setInterval_} min={5} max={60} /></label>
        <label>请求超时（秒）<NumberInput value={timeout} onChange={setTimeout_} min={5} max={60} /></label>
        <label>重试次数<NumberInput value={retry} onChange={setRetry} min={1} max={5} /></label>
        <label className="flex-row items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="w-3.5 h-3.5 accent-accent" />
          <span className="text-xs font-normal text-text-secondary">发布前需确认</span>
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => save({ PLATFORM: platform, POST_LIMIT: String(postLimit), WEIBO_PAGES: String(weiboPages), PUBLISH_INTERVAL_SECONDS: String(interval), REQUEST_TIMEOUT: String(timeout), RETRY_TIMES: String(retry), REQUIRE_CONFIRM: confirm ? 'true' : 'false' })}>保存运行参数</button>
    </div>
  );
}

function SystemTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  return <div className="space-y-4"><LLMSection data={data} save={save} /><WeiboSection data={data} save={save} /><ToutiaoSection data={data} save={save} /><WatermarkSection data={data} save={save} /></div>;
}

const PROVIDERS: Record<string, { name: string; models: string[]; baseUrl: string; keyName: string; urlHint: string }> = {
  mimo: { name: '小米 MiMo', models: ['mimo-chat', 'mimo-v2.5-pro'], baseUrl: 'https://api.xiaomimimo.com/v1', keyName: 'MIMO_API_KEY', urlHint: '小米 Mimo OpenAI 兼容地址，格式：https://api.xiaomimimo.com/v1' },
  deepseek: { name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'], baseUrl: 'https://api.deepseek.com/v1', keyName: 'DEEPSEEK_API_KEY', urlHint: 'DeepSeek API 地址，格式：https://api.deepseek.com/v1' },
  openai: { name: 'OpenAI', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'], baseUrl: 'https://api.openai.com/v1', keyName: 'OPENAI_API_KEY', urlHint: 'OpenAI API 地址，格式：https://api.openai.com/v1' },
  glm: { name: '智谱 GLM', models: ['GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-Flash', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4-Long'], baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyName: 'GLM_API_KEY', urlHint: '智谱 API 地址，格式：https://open.bigmodel.cn/api/paas/v4' },
};

function LLMSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [provider, setProvider] = useState(data.ai_provider);
  const [model, setModel] = useState(data.ai_model);
  const [baseUrl, setBaseUrl] = useState(data.ai_base_url);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [fullKey, setFullKey] = useState('');
  const current = PROVIDERS[provider];

  function handleProviderChange(p: string) { setProvider(p); const c = PROVIDERS[p]; if (c) { setBaseUrl(c.baseUrl); setModel(c.models[0]); } }
  async function toggleKeyVisibility() {
    if (showKey) { setShowKey(false); return; }
    if (!fullKey && data.ai_api_key_set) { try { setFullKey((await settingsApi.getKey()).key); } catch {} }
    setShowKey(true);
  }
  const displayKey = showKey ? (fullKey || apiKey) : (apiKey || (data.ai_api_key_set ? data.ai_api_key_masked : ''));

  return (
    <div className="card space-y-4">
      <div className="section-header">大模型配置</div>
      <div className="grid grid-cols-2 gap-3">
        <label>AI 服务商<Select value={provider} onChange={handleProviderChange} options={Object.entries(PROVIDERS).map(([k, v]) => ({ label: v.name, value: k }))} /></label>
        <label>模型<Select value={model} onChange={setModel} options={(current?.models || []).map(m => ({ label: m, value: m }))} /></label>
        <label className="col-span-2">Base URL<input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={current?.urlHint} /></label>
        <label className="col-span-2">API Key
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={displayKey} onChange={e => { setApiKey(e.target.value); setFullKey(''); }} placeholder={data.ai_api_key_set ? '已设置（留空保持不变）' : `请输入 ${current?.keyName || 'API Key'}`} className="pr-9" />
            {data.ai_api_key_set && <button type="button" onClick={toggleKeyVisibility} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary transition-colors"><EyeIcon visible={showKey} /></button>}
          </div>
        </label>
      </div>
      <p className="text-xs text-text-muted bg-bg-secondary rounded-lg p-3 leading-relaxed">Base URL 请填写 OpenAI 兼容地址，以 <code className="px-1 py-0.5 bg-bg rounded">/v1</code> 结尾。系统自动拼接 <code className="px-1 py-0.5 bg-bg rounded">/chat/completions</code>。</p>
      <button className="btn btn-primary" onClick={() => { const u: Record<string, string> = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl }; if (apiKey) u[current?.keyName || 'AI_API_KEY'] = apiKey; save(u); }}>保存模型配置</button>
    </div>
  );
}

function WeiboSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [cookie, setCookie] = useState('');
  const [uid, setUid] = useState(data.weibo_uid);
  const [fetchMode, setFetchMode] = useState(data.weibo_fetch_mode);
  const [celebs, setCelebs] = useState(data.weibo_celebrities);
  const [tags, setTags] = useState(data.weibo_search_tags);
  const [sceneTags, setSceneTags] = useState(data.weibo_scene_extra_tags);
  const [superTopics, setSuperTopics] = useState(data.weibo_super_topics);

  return (
    <div className="card space-y-4">
      <div className="section-header">微博配置</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">微博 Cookie<textarea value={cookie} onChange={e => setCookie(e.target.value)} placeholder={data.weibo_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} /></label>
        <label>微博 UID<input type="text" value={uid} onChange={e => setUid(e.target.value)} placeholder="留空自动推断" /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '本人时间线', value: 'own' }, { label: '明星列表', value: 'celebrities' }, { label: '混合模式', value: 'mixed' }, { label: '超话抓取', value: 'super_topic' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label>明星列表（逗号分隔）<input type="text" value={celebs} onChange={e => setCelebs(e.target.value)} /></label>
        <label>搜索标签（逗号分隔）<input type="text" value={tags} onChange={e => setTags(e.target.value)} /></label>
        <label>超话列表（逗号分隔）<input type="text" value={superTopics} onChange={e => setSuperTopics(e.target.value)} placeholder="如：迪丽热巴超话,杨幂超话" /></label>
        <label>场景补充标签<input type="text" value={sceneTags} onChange={e => setSceneTags(e.target.value)} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => { const u: Record<string, string> = { WEIBO_UID: uid, WEIBO_FETCH_MODE: fetchMode, WEIBO_CELEBRITIES: celebs, WEIBO_SEARCH_TAGS: tags, WEIBO_SCENE_EXTRA_TAGS: sceneTags, WEIBO_SUPER_TOPICS: superTopics }; if (cookie) u.WEIBO_COOKIE = cookie; save(u); }}>保存微博配置</button>
    </div>
  );
}

function ToutiaoSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [cookie, setCookie] = useState('');
  const [userId, setUserId] = useState(data.toutiao_user_id);
  const [fetchMode, setFetchMode] = useState(data.toutiao_fetch_mode);
  const [searchTags, setSearchTags] = useState(data.toutiao_search_tags);

  return (
    <div className="card space-y-4">
      <div className="section-header">今日头条配置</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">头条 Cookie<textarea value={cookie} onChange={e => setCookie(e.target.value)} placeholder={data.toutiao_cookie_set ? '已设置（留空保持不变）' : ''} rows={2} /></label>
        <label>用户 ID<input type="text" value={userId} onChange={e => setUserId(e.target.value)} /></label>
        <label>抓取模式<Select value={fetchMode} onChange={setFetchMode} options={[{ label: '推荐流', value: 'feed' }, { label: '用户主页', value: 'user' }, { label: '关键词搜索', value: 'keyword' }]} /></label>
        <label className="col-span-2">搜索关键词（逗号分隔）<input type="text" value={searchTags} onChange={e => setSearchTags(e.target.value)} placeholder="时尚,明星,穿搭" /></label>
      </div>
      <button className="btn btn-primary" onClick={() => { const u: Record<string, string> = { TOUTIAO_USER_ID: userId, TOUTIAO_FETCH_MODE: fetchMode, TOUTIAO_SEARCH_TAGS: searchTags }; if (cookie) u.TOUTIAO_COOKIE = cookie; save(u); }}>保存头条配置</button>
    </div>
  );
}

function WatermarkSection({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [wmFilter, setWmFilter] = useState(data.watermark_filter);
  const [wmStrict, setWmStrict] = useState(data.watermark_strict_mode);
  const [minClean, setMinClean] = useState(data.min_clean_images);
  const [wmFallback, setWmFallback] = useState(data.allow_watermark_fallback);
  const [cornerRatio, setCornerRatio] = useState(data.watermark_corner_ratio);
  const [bottomRatio, setBottomRatio] = useState(data.watermark_bottom_ratio);

  return (
    <div className="card space-y-4">
      <div className="section-header">水印过滤</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex-row items-center gap-2 cursor-pointer"><input type="checkbox" checked={wmFilter} onChange={e => setWmFilter(e.target.checked)} className="w-3.5 h-3.5 accent-accent" /><span className="text-xs font-normal text-text-secondary">启用水印过滤</span></label>
        <label className="flex-row items-center gap-2 cursor-pointer"><input type="checkbox" checked={wmStrict} onChange={e => setWmStrict(e.target.checked)} className="w-3.5 h-3.5 accent-accent" /><span className="text-xs font-normal text-text-secondary">严格模式</span></label>
        <label>最少无水印图片数<NumberInput value={minClean} onChange={setMinClean} min={1} max={10} /></label>
        <label className="flex-row items-center gap-2 cursor-pointer"><input type="checkbox" checked={wmFallback} onChange={e => setWmFallback(e.target.checked)} className="w-3.5 h-3.5 accent-accent" /><span className="text-xs font-normal text-text-secondary">允许降级</span></label>
        <label><div className="flex items-center justify-between"><span>角标阈值</span><span className="text-xs font-mono text-accent tabular-nums">{cornerRatio.toFixed(2)}</span></div><input type="range" min={1.0} max={2.0} step={0.02} value={cornerRatio} onChange={e => setCornerRatio(+e.target.value)} /></label>
        <label><div className="flex items-center justify-between"><span>底边阈值</span><span className="text-xs font-mono text-accent tabular-nums">{bottomRatio.toFixed(2)}</span></div><input type="range" min={1.0} max={2.0} step={0.02} value={bottomRatio} onChange={e => setBottomRatio(+e.target.value)} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => save({ WATERMARK_FILTER: wmFilter ? 'true' : 'false', WATERMARK_STRICT_MODE: wmStrict ? 'true' : 'false', MIN_CLEAN_IMAGES: String(minClean), ALLOW_WATERMARK_FALLBACK: wmFallback ? 'true' : 'false', WATERMARK_CORNER_RATIO: String(cornerRatio), WATERMARK_BOTTOM_RATIO: String(bottomRatio) })}>保存水印配置</button>
    </div>
  );
}
