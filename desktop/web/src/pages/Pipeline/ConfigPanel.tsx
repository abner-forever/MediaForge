import { useEffect, useState } from 'react';
import {
  platformApi,
  settingsApi,
  wechatAccountApi,
  type PlatformMeta,
  type WeChatAccount,
  type PipelineConfig,
} from '../../api/client';
import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import Checkbox from '../../components/Checkbox';

const DECISION_MODE_OPTIONS = [
  { label: '全自动', value: 'auto' },
  { label: '交互确认（询问用户）', value: 'interactive' },
];

const DEFAULT_CONFIG: PipelineConfig = {
  platform: 'weibo',
  mode: '',
  celebrities: [],
  search_tags: [],
  super_topics: [],
  max_pages: 2,
  post_limit: 3,
  dry_run: false,
  require_confirm: true,
  account_id: undefined,
  filter_watermark: false,
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
    Promise.all([platformApi.list(), settingsApi.get(), wechatAccountApi.list()])
      .then(([p, s, wa]) => {
        setPlatforms(p.platforms);
        setAccounts(wa.accounts);
        const def = p.default || 'weibo';
        if (p.platforms[def]) {
          setConfig((prev) => ({
            ...prev,
            platform: def,
            mode: p.platforms[def].default_fetch_mode,
            celebrities: s.weibo_celebrities
              ? s.weibo_celebrities
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            search_tags: s.weibo_search_tags
              ? s.weibo_search_tags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            super_topics: s.weibo_super_topics
              ? s.weibo_super_topics
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            post_limit: s.post_limit || 3,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activePlatform = platforms[config.platform];
  const modeOptions = activePlatform
    ? Object.entries(activePlatform.fetch_modes).map(([k, v]) => ({ label: v, value: k }))
    : [];
  const accountOptions = accounts
    .filter((a) => a.logged_in)
    .map((a) => ({ label: a.name, value: a.account_id }));

  function update<K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handlePlatformChange(p: string) {
    const meta = platforms[p];
    update('platform', p);
    if (meta) update('mode', meta.default_fetch_mode);
  }

  return (
    <div className="card space-y-4">
      <div className="section-header">流水线配置</div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          加载配置...
        </div>
      ) : (
        <>
          {/* ── 数据源（始终可见） ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-4 h-4 text-accent"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <span className="text-sm font-semibold text-text">数据源</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text mb-1">数据平台</label>
                <Select
                  options={Object.entries(platforms).map(([k, v]) => ({ label: v.name, value: k }))}
                  value={config.platform}
                  onChange={handlePlatformChange}
                  disabled={running}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">抓取模式</label>
                <Select
                  options={modeOptions}
                  value={config.mode}
                  onChange={(v) => update('mode', v as string)}
                  disabled={running || !modeOptions.length}
                />
              </div>
            </div>
          </div>

          {/* ── 搜索目标 ── */}
          <CollapsibleSection icon="search" title="搜索目标" defaultOpen>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="例: 迪丽热巴,杨幂,刘亦菲"
                  value={config.celebrities.join(',')}
                  onChange={(e) =>
                    update(
                      'celebrities',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  disabled={running}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text mb-1">搜索标签</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="美图,穿搭,日常"
                    value={config.search_tags.join(',')}
                    onChange={(e) =>
                      update(
                        'search_tags',
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    disabled={running}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text mb-1">超话</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="例: 迪丽热巴,杨幂"
                    value={config.super_topics.join(',')}
                    onChange={(e) =>
                      update(
                        'super_topics',
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    disabled={running}
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── 运行参数 ── */}
          <CollapsibleSection icon="tune" title="运行参数">
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <label className="block text-sm font-medium text-text mb-1">翻页数</label>
                <NumberInput
                  value={config.max_pages}
                  min={1}
                  max={10}
                  onChange={(v) => update('max_pages', v)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">处理条数</label>
                <NumberInput
                  value={config.post_limit}
                  min={1}
                  max={3}
                  onChange={(v) => update('post_limit', v)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">图片最低限制</label>
                <NumberInput
                  value={config.min_images_per_post}
                  min={1}
                  max={20}
                  onChange={(v) => update('min_images_per_post', v)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text mb-1">AI 决策模式</label>
                <Select
                  options={DECISION_MODE_OPTIONS}
                  value={config.ai_decision_mode || 'auto'}
                  onChange={(v) => update('ai_decision_mode', v as string)}
                  disabled={running}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">公众号账号</label>
                <Select
                  options={accountOptions}
                  value={config.account_id || ''}
                  onChange={(v) => update('account_id', v || undefined)}
                  disabled={running}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── 操作按钮 ── */}
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-border">
            <div className="flex gap-3">
              {!running ? (
                <button onClick={() => onRun(config)} className="btn btn-primary">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  启动流水线
                </button>
              ) : (
                <button onClick={onCancel} className="btn btn-danger">
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  取消运行
                </button>
              )}
            </div>
            <div className="flex items-center gap-x-5 gap-y-1 flex-wrap justify-end">
              <Checkbox
                checked={config.dry_run}
                onChange={(v) => update('dry_run', v)}
                disabled={running}
              >
                试运行
              </Checkbox>
              <Checkbox
                checked={config.require_confirm}
                onChange={(v) => update('require_confirm', v)}
                disabled={running}
              >
                发布前确认
              </Checkbox>
              <Checkbox
                checked={config.filter_watermark}
                onChange={(v) => update('filter_watermark', v)}
                disabled={running}
              >
                过滤水印
              </Checkbox>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  search: (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  tune: (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  send: (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
};

function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: keyof typeof SECTION_ICONS;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div data-open={open}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full group cursor-pointer mb-0"
      >
        <div className="flex items-center gap-2 py-1">
          <span className="text-accent shrink-0">{SECTION_ICONS[icon]}</span>
          <span className="text-sm font-semibold text-text">{title}</span>
        </div>
        <svg
          className={`w-4 h-4 text-text-muted/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-50'}`}
      >
        {children}
      </div>
    </div>
  );
}
