import type { SettingsData } from '../../api/client';
import LLMSection from './LLMSection';
import MediaSourceSection from './MediaSourceSection';
import WechatSection from './WechatSection';
import WatermarkSection from './WatermarkSection';
import MaterialsSection from './MaterialsSection';

export default function SystemTab({ data, save, onReload, subTab, onSubTabChange }: { data: SettingsData; save: (u: Record<string, string>) => void; onReload: () => Promise<void>; subTab: string; onSubTabChange: (s: string) => void }) {
  const SUB_TABS = [
    { id: 'llm', label: '大模型配置' },
    { id: 'media-source', label: '媒体来源' },
    { id: 'wechat', label: '微信配置' },
    { id: 'watermark', label: '水印过滤' },
    { id: 'materials', label: '素材保存位置' },
  ];
  return (
    <div className="flex gap-6">
      <div className="w-44 shrink-0 flex flex-col gap-1">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => onSubTabChange(t.id)}
            className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              subTab === t.id
                ? 'bg-accent-soft text-accent shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-secondary'
            }`}>
            <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent rounded-full transition-all ${
              subTab === t.id ? 'opacity-100' : 'opacity-0'
            }`} />
            <span className="pl-2">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0 animate-in">
        {subTab === 'llm' && <LLMSection data={data} save={save} />}
        {subTab === 'media-source' && <MediaSourceSection data={data} save={save} onReload={onReload} />}
        {subTab === 'wechat' && <WechatSection data={data} onReload={onReload} />}
        {subTab === 'watermark' && <WatermarkSection data={data} save={save} />}
        {subTab === 'materials' && <MaterialsSection data={data} save={save} />}
      </div>
    </div>
  );
}
