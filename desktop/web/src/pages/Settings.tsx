import { useEffect, useState } from 'react';
import { useStore } from '../stores';
import { settingsApi, type SettingsData } from '../api/client';

const TABS = [
  { id: 'llm', label: '大模型' },
  { id: 'weibo', label: '微博' },
  { id: 'run', label: '运行参数' },
  { id: 'watermark', label: '水印过滤' },
];

export default function Settings() {
  const { addToast } = useStore();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('llm');

  async function load() {
    try {
      setData(await settingsApi.get());
      setError('');
    } catch (err: any) {
      setError(err.message || '加载失败');
    }
  }

  useEffect(() => { load(); }, []);

  if (error) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-sm text-red-500">{error}</p>
      <button className="btn btn-sm" onClick={load}>重试</button>
    </div>
  );

  if (!data) return <div className="text-center py-16 text-text-muted text-sm">加载中...</div>;

  async function save(updates: Record<string, string>) {
    try {
      await settingsApi.save(updates);
      addToast('配置已保存', 'success');
      settingsApi.get().then(setData);
    } catch (err: any) { addToast(err.message, 'error'); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">系统设置</h2>
        <p className="text-xs text-text-muted mt-0.5">修改后点击保存，配置将写入 .env 文件并立即生效</p>
      </div>

      <div className="flex gap-0.5 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id ? 'border-text text-text' : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'llm' && <LLMTab data={data} save={save} />}
      {activeTab === 'weibo' && <WeiboTab data={data} save={save} />}
      {activeTab === 'run' && <RunTab data={data} save={save} />}
      {activeTab === 'watermark' && <WatermarkTab data={data} save={save} />}
    </div>
  );
}

function LLMTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [provider, setProvider] = useState(data.ai_provider);
  const [model, setModel] = useState(data.ai_model);
  const [baseUrl, setBaseUrl] = useState(data.ai_base_url);
  const [apiKey, setApiKey] = useState('');

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label>AI Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {['mimo', 'openai', 'deepseek', 'glm'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Model<input type="text" value={model} onChange={(e) => setModel(e.target.value)} /></label>
        <label>Base URL<input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" /></label>
        <label>API Key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={data.ai_api_key_set ? '已设置（留空保持不变）' : '请输入 API Key'} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => {
        const u: Record<string, string> = { AI_PROVIDER: provider, AI_MODEL: model, AI_BASE_URL: baseUrl };
        if (apiKey) { const m: Record<string, string> = { mimo: 'MIMO_API_KEY', openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', glm: 'GLM_API_KEY' }; u[m[provider] || 'AI_API_KEY'] = apiKey; }
        save(u);
      }}>保存模型配置</button>
    </div>
  );
}

function WeiboTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [cookie, setCookie] = useState('');
  const [uid, setUid] = useState(data.weibo_uid);
  const [fetchMode, setFetchMode] = useState(data.weibo_fetch_mode);
  const [celebs, setCelebs] = useState(data.weibo_celebrities);
  const [tags, setTags] = useState(data.weibo_search_tags);
  const [sceneTags, setSceneTags] = useState(data.weibo_scene_extra_tags);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2">微博 Cookie
          <textarea value={cookie} onChange={(e) => setCookie(e.target.value)} placeholder={data.weibo_cookie_set ? '已设置（留空保持不变）' : ''} rows={3} />
        </label>
        <label>微博 UID<input type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="留空自动推断" /></label>
        <label>抓取模式
          <select value={fetchMode} onChange={(e) => setFetchMode(e.target.value)}>
            {['own', 'celebrities', 'mixed'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>明星列表（逗号分隔）<input type="text" value={celebs} onChange={(e) => setCelebs(e.target.value)} /></label>
        <label>搜索标签（逗号分隔）<input type="text" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        <label>场景补充标签<input type="text" value={sceneTags} onChange={(e) => setSceneTags(e.target.value)} /></label>
      </div>
      <button className="btn btn-primary" onClick={() => {
        const u: Record<string, string> = { WEIBO_UID: uid, WEIBO_FETCH_MODE: fetchMode, WEIBO_CELEBRITIES: celebs, WEIBO_SEARCH_TAGS: tags, WEIBO_SCENE_EXTRA_TAGS: sceneTags };
        if (cookie && cookie !== '已设置（留空保持不变）') u.WEIBO_COOKIE = cookie;
        save(u);
      }}>保存微博配置</button>
    </div>
  );
}

function RunTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [postLimit, setPostLimit] = useState(data.post_limit);
  const [weiboPages, setWeiboPages] = useState(data.weibo_pages);
  const [interval, setInterval_] = useState(data.publish_interval);
  const [timeout, setTimeout_] = useState(data.request_timeout);
  const [retry, setRetry] = useState(data.retry_times);
  const [confirm, setConfirm] = useState(data.require_confirm);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <label>每次处理条数<input type="number" value={postLimit} onChange={(e) => setPostLimit(+e.target.value)} min={1} max={3} /></label>
        <label>微博抓取页数<input type="number" value={weiboPages} onChange={(e) => setWeiboPages(+e.target.value)} min={1} max={10} /></label>
        <label>发布间隔（秒）<input type="number" value={interval} onChange={(e) => setInterval_(+e.target.value)} min={5} max={60} /></label>
        <label>请求超时（秒）<input type="number" value={timeout} onChange={(e) => setTimeout_(+e.target.value)} min={5} max={60} /></label>
        <label>重试次数<input type="number" value={retry} onChange={(e) => setRetry(+e.target.value)} min={1} max={5} /></label>
        <label className="flex-row items-center gap-2">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-[13px] font-normal text-text-secondary">发布前需确认</span>
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => save({
        POST_LIMIT: String(postLimit), WEIBO_PAGES: String(weiboPages), PUBLISH_INTERVAL_SECONDS: String(interval),
        REQUEST_TIMEOUT: String(timeout), RETRY_TIMES: String(retry), REQUIRE_CONFIRM: confirm ? 'true' : 'false',
      })}>保存运行参数</button>
    </div>
  );
}

function WatermarkTab({ data, save }: { data: SettingsData; save: (u: Record<string, string>) => void }) {
  const [wmFilter, setWmFilter] = useState(data.watermark_filter);
  const [wmStrict, setWmStrict] = useState(data.watermark_strict_mode);
  const [minClean, setMinClean] = useState(data.min_clean_images);
  const [wmFallback, setWmFallback] = useState(data.allow_watermark_fallback);
  const [cornerRatio, setCornerRatio] = useState(data.watermark_corner_ratio);
  const [bottomRatio, setBottomRatio] = useState(data.watermark_bottom_ratio);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex-row items-center gap-2">
          <input type="checkbox" checked={wmFilter} onChange={(e) => setWmFilter(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-[13px] font-normal text-text-secondary">启用水印过滤</span>
        </label>
        <label className="flex-row items-center gap-2">
          <input type="checkbox" checked={wmStrict} onChange={(e) => setWmStrict(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-[13px] font-normal text-text-secondary">严格模式</span>
        </label>
        <label>最少无水印图片数<input type="number" value={minClean} onChange={(e) => setMinClean(+e.target.value)} min={1} max={10} /></label>
        <label className="flex-row items-center gap-2">
          <input type="checkbox" checked={wmFallback} onChange={(e) => setWmFallback(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-[13px] font-normal text-text-secondary">严格模式下允许降级</span>
        </label>
        <label>角标检测阈值: {cornerRatio}
          <input type="range" min={1.0} max={2.0} step={0.02} value={cornerRatio} onChange={(e) => setCornerRatio(+e.target.value)} />
        </label>
        <label>底边检测阈值: {bottomRatio}
          <input type="range" min={1.0} max={2.0} step={0.02} value={bottomRatio} onChange={(e) => setBottomRatio(+e.target.value)} />
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => save({
        WATERMARK_FILTER: wmFilter ? 'true' : 'false', WATERMARK_STRICT_MODE: wmStrict ? 'true' : 'false',
        MIN_CLEAN_IMAGES: String(minClean), ALLOW_WATERMARK_FALLBACK: wmFallback ? 'true' : 'false',
        WATERMARK_CORNER_RATIO: String(cornerRatio), WATERMARK_BOTTOM_RATIO: String(bottomRatio),
      })}>保存水印配置</button>
    </div>
  );
}
