import { useState } from 'react';
import type { SettingsData } from '../../api/client';
import Select from '../../components/Select';
import NumberInput from '../../components/NumberInput';
import { useLoading } from '../../hooks/useLoading';

export default function RunSection({
  data,
  save,
}: {
  data: SettingsData;
  save: (u: Record<string, string>) => void;
}) {
  const { loading: saving, withLoading: withSave } = useLoading();
  const [platform, setPlatform] = useState(data.platform);
  const [postLimit, setPostLimit] = useState(data.post_limit);
  const [weiboPages, setWeiboPages] = useState(data.weibo_pages);
  const [interval, setInterval_] = useState(data.publish_interval);
  const [timeout, setTimeout_] = useState(data.request_timeout);
  const [aiTimeout, setAiTimeout] = useState(data.ai_timeout);
  const [retry, setRetry] = useState(data.retry_times);
  const [confirm, setConfirm] = useState(data.require_confirm);

  return (
    <div className="card space-y-4">
      <div className="section-header">运行参数</div>
      <div className="grid grid-cols-2 gap-4">
        <label>
          激活平台
          <Select
            value={platform}
            onChange={setPlatform}
            options={[
              { label: '微博', value: 'weibo' },
              { label: '今日头条', value: 'toutiao' },
            ]}
          />
        </label>
        <label>
          每次条数
          <NumberInput value={postLimit} onChange={setPostLimit} min={1} max={20} />
        </label>
        <label>
          抓取页数
          <NumberInput value={weiboPages} onChange={setWeiboPages} min={1} max={5} />
        </label>
        <label>
          发布间隔
          <NumberInput value={interval} onChange={setInterval_} min={5} max={60} />
        </label>
        <label>
          请求超时
          <NumberInput value={timeout} onChange={setTimeout_} min={5} max={60} />
        </label>
        <label>
          AI 超时
          <NumberInput value={aiTimeout} onChange={setAiTimeout} min={30} max={300} />
        </label>
        <label>
          重试次数
          <NumberInput value={retry} onChange={setRetry} min={1} max={5} />
        </label>
        <label className="toggle col-span-2">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span className="toggle-track" />
          <span className="toggle-label">发布前需确认</span>
        </label>
      </div>
      <button
        className="btn btn-primary"
        onClick={() =>
          withSave(async () =>
            save({
              PLATFORM: platform,
              POST_LIMIT: String(postLimit),
              WEIBO_PAGES: String(weiboPages),
              PUBLISH_INTERVAL_SECONDS: String(interval),
              REQUEST_TIMEOUT: String(timeout),
              AI_TIMEOUT: String(aiTimeout),
              RETRY_TIMES: String(retry),
              REQUIRE_CONFIRM: confirm ? 'true' : 'false',
            }),
          )
        }
        disabled={saving}
      >
        {saving ? (
          <>
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}
            保存中
          </>
        ) : (
          '保存运行参数'
        )}
      </button>
    </div>
  );
}
