import type { SettingsData } from '../../api/client';
import ThemeSection from './ThemeSection';
import RunSection from './RunSection';
import AboutSection from './AboutSection';

export default function GeneralTab({
  data,
  save,
  subTab,
  onSubTabChange,
}: {
  data: SettingsData;
  save: (u: Record<string, string>) => void;
  subTab: string;
  onSubTabChange: (s: string) => void;
}) {
  const SUB_TABS = [
    { id: 'theme', label: '主题管理' },
    { id: 'run', label: '运行参数' },
    { id: 'about', label: '关于' },
  ];
  return (
    <div className="flex gap-6">
      <div className="w-44 shrink-0 flex flex-col gap-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSubTabChange(t.id)}
            className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              subTab === t.id
                ? 'bg-accent-soft text-accent shadow-sm'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-secondary'
            }`}
          >
            <span
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-accent rounded-full transition-all ${
                subTab === t.id ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <span className="pl-2">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0 animate-in">
        {subTab === 'theme' && <ThemeSection />}
        {subTab === 'run' && <RunSection data={data} save={save} />}
        {subTab === 'about' && <AboutSection />}
      </div>
    </div>
  );
}
