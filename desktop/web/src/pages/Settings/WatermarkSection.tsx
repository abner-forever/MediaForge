import { useState } from 'react';
import type { SettingsData } from '../../api/client';
import NumberInput from '../../components/NumberInput';
import Slider from '../../components/Slider';
import { useLoading } from '../../hooks/useLoading';

export default function WatermarkSection({
  data,
  save,
}: {
  data: SettingsData;
  save: (u: Record<string, string>) => void;
}) {
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
        <div className="flex flex-col gap-1">
          <label className="toggle">
            <input
              type="checkbox"
              checked={wmFilter}
              onChange={(e) => setWmFilter(e.target.checked)}
            />
            <span className="toggle-track" />
            <span className="toggle-label">启用水印过滤</span>
          </label>
          <p className="text-xs text-text-muted leading-relaxed pl-11">
            下载图片时自动检测并过滤含水印的图片。关闭后所有图片不做水印筛查直接保留。
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="toggle">
            <input
              type="checkbox"
              checked={wmStrict}
              onChange={(e) => setWmStrict(e.target.checked)}
            />
            <span className="toggle-track" />
            <span className="toggle-label">严格模式</span>
          </label>
          <p className="text-xs text-text-muted leading-relaxed pl-11">
            过滤后若无水印图片数量不足，直接跳过该帖子，不进入发布流程。
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label>
            最少无水印图片数
            <NumberInput value={minClean} onChange={setMinClean} min={1} max={10} />
          </label>
          <p className="text-xs text-text-muted leading-relaxed">
            每篇帖子至少需要保留多少张无水印图片。配合严格模式使用——低于此数量时帖子会被跳过。
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="toggle">
            <input
              type="checkbox"
              checked={wmFallback}
              onChange={(e) => setWmFallback(e.target.checked)}
            />
            <span className="toggle-track" />
            <span className="toggle-label">允许降级</span>
          </label>
          <p className="text-xs text-text-muted leading-relaxed pl-11">
            与严格模式搭配。开启后即使无水印图片不足最低数量，仍继续使用已有图片发布，而不是跳过帖子。
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">角标阈值</span>
            <span className="text-xs font-mono text-accent tabular-nums">
              {cornerRatio.toFixed(2)}
            </span>
          </div>
          <Slider value={cornerRatio} onChange={setCornerRatio} min={1.0} max={2.0} step={0.02} />
          <p className="text-xs text-text-muted leading-relaxed">
            检测图片四角水印的灵敏度。值越小越容易被判定为有水印（更严格），值越大越宽松。默认
            1.38。
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">底边阈值</span>
            <span className="text-xs font-mono text-accent tabular-nums">
              {bottomRatio.toFixed(2)}
            </span>
          </div>
          <Slider value={bottomRatio} onChange={setBottomRatio} min={1.0} max={2.0} step={0.02} />
          <p className="text-xs text-text-muted leading-relaxed">
            检测图片底部横条水印的灵敏度。值越小越严格，值越大越宽松。默认 1.48。
          </p>
        </div>
      </div>
      <button
        className="btn btn-primary"
        onClick={() =>
          withSave(async () =>
            save({
              WATERMARK_FILTER: wmFilter ? 'true' : 'false',
              WATERMARK_STRICT_MODE: wmStrict ? 'true' : 'false',
              MIN_CLEAN_IMAGES: String(minClean),
              ALLOW_WATERMARK_FALLBACK: wmFallback ? 'true' : 'false',
              WATERMARK_CORNER_RATIO: String(cornerRatio),
              WATERMARK_BOTTOM_RATIO: String(bottomRatio),
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
          '保存水印配置'
        )}
      </button>
    </div>
  );
}
