import { useStore, THEME_PRESETS } from '../../stores';

export default function ThemeSection() {
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
                  ? 'border-accent bg-accent-soft'
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
