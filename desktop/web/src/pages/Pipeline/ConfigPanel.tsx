import { useEffect, useState } from 'react';
import { platformApi, settingsApi, wechatAccountApi, type PlatformMeta, type WeChatAccount, type PipelineConfig } from '../../api/client';
import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import Checkbox from '../../components/Checkbox';

const DECISION_MODE_OPTIONS = [
  { label: '全自动（LLM 决策失败时使用默认策略）', value: 'auto' },
  { label: '交互确认（LLM 决策失败时询问用户）', value: 'interactive' },
];

const DEFAULT_CONFIG: PipelineConfig = {
  platform: 'weibo',
  mode: '',
  celebrities: [],
  search_tags: [],
  super_topics: [],
  max_pages: 2,
  post_limit: 3,
  dry_run: true,
  require_confirm: true,
  account_id: undefined,
  filter_watermark: true,
  min_images_per_post: 5,
  ai_decision_mode: 'auto',
};

export default function ConfigPanel({
  onRun,
  onCancel,
  running,
}: {
  onRun: (config: PipelineConfig) => void;
  onCancel: () => void;
  running: boolean;
}) {
  const [config, setConfig] = useState<PipelineConfig>({ ...DEFAULT_CONFIG });
  const [platforms, setPlatforms] = useState<Record<string, PlatformMeta>>({});
  const [accounts, setAccounts] = useState<WeChatAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      platformApi.list(),
      settingsApi.get(),
      wechatAccountApi.list(),
    ]).then(([p, s, wa]) => {
      setPlatforms(p.platforms);
      setAccounts(wa.accounts);
      const def = p.default || 'weibo';
      if (p.platforms[def]) {
        setConfig(prev => ({
          ...prev,
          platform: def,
          mode: p.platforms[def].default_fetch_mode,
          celebrities: s.weibo_celebrities ? s.weibo_celebrities.split(',').map(s => s.trim()).filter(Boolean) : [],
          search_tags: s.weibo_search_tags ? s.weibo_search_tags.split(',').map(s => s.trim()).filter(Boolean) : [],
          super_topics: s.weibo_super_topics ? s.weibo_super_topics.split(',').map(s => s.trim()).filter(Boolean) : [],
          post_limit: s.post_limit || 3,
        }));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const activePlatform = platforms[config.platform];
  const modeOptions = activePlatform
    ? Object.entries(activePlatform.fetch_modes).map(([k, v]) => ({ label: v, value: k }))
    : [];
  const accountOptions = accounts
    .filter(a => a.logged_in)
    .map(a => ({ label: a.name, value: a.account_id }));

  function update<K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  function handlePlatformChange(p: string) {
    const meta = platforms[p];
    update('platform', p);
    if (meta) update('mode', meta.default_fetch_mode);
  }

  return (
    <div className="card space-y-5">
      <div className="section-header">流水线配置</div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          加载配置...
        </div>
      ) : (
        <>
          {/* 平台选择 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">数据平台</label>
              <Select
                options={Object.entries(platforms).map(([k, v]) => ({ label: v.name, value: k }))}
                value={config.platform}
                onChange={handlePlatformChange}
                disabled={running}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">抓取模式</label>
              <Select
                options={modeOptions}
                value={config.mode}
                onChange={v => update('mode', v as string)}
                disabled={running || !modeOptions.length}
              />
            </div>
          </div>

          {/* 搜索参数 */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">艺人 / 关键词（逗号分隔）</label>
            <input
              type="text"
              className="input w-full"
              placeholder="例: 迪丽热巴,杨幂,刘亦菲"
              value={config.celebrities.join(',')}
              onChange={e => update('celebrities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              disabled={running}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">搜索标签</label>
              <input
                type="text"
                className="input w-full"
                placeholder="美图,穿搭,日常"
                value={config.search_tags.join(',')}
                onChange={e => update('search_tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                disabled={running}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">超话（逗号分隔）</label>
              <input
                type="text"
                className="input w-full"
                placeholder="例: 迪丽热巴,杨幂"
                value={config.super_topics.join(',')}
                onChange={e => update('super_topics', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                disabled={running}
              />
            </div>
          </div>

          {/* 运行参数 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">翻页数</label>
              <NumberInput value={config.max_pages} min={1} max={10} onChange={v => update('max_pages', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">处理条数</label>
              <NumberInput value={config.post_limit} min={1} max={3} onChange={v => update('post_limit', v)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">图片最低限制</label>
              <NumberInput value={config.min_images_per_post} min={1} max={20} onChange={v => update('min_images_per_post', v)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-text mb-1.5">公众号账号</label>
              <Select
                options={[{ label: '不使用', value: '' }, ...accountOptions]}
                value={config.account_id || ''}
                onChange={v => update('account_id', v || undefined)}
                disabled={running}
              />
            </div>
          </div>

          {/* AI 决策模式 */}
          <div className="grid grid-cols-1 gap-4">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-text mb-1.5">AI 决策模式</label>
              <Select
                options={DECISION_MODE_OPTIONS}
                value={config.ai_decision_mode || 'auto'}
                onChange={v => update('ai_decision_mode', v as string)}
                disabled={running}
              />
            </div>
          </div>

          {/* 开关选项 */}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Checkbox checked={config.dry_run} onChange={v => update('dry_run', v)} disabled={running}>
              试运行（不实际发布）
            </Checkbox>
            <Checkbox checked={config.require_confirm} onChange={v => update('require_confirm', v)} disabled={running}>
              发布前确认
            </Checkbox>
            <Checkbox checked={config.filter_watermark} onChange={v => update('filter_watermark', v)} disabled={running}>
              过滤水印
            </Checkbox>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            {!running ? (
              <button
                onClick={() => onRun(config)}
                className="btn btn-primary"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                启动流水线
              </button>
            ) : (
              <button
                onClick={onCancel}
                className="btn btn-danger"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
                取消运行
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
