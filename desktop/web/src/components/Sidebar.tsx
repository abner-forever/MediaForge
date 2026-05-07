import { NavLink } from 'react-router-dom';
import { useStore } from '../stores';

const NAV_ITEMS = [
  { path: '/', icon: '📊', label: '仪表盘' },
  { path: '/discovery', icon: '🔍', label: '图片发现' },
  { path: '/queue', icon: '📝', label: '发布队列' },
  { path: '/materials', icon: '🖼️', label: '本地素材' },
  { path: '/settings', icon: '⚙️', label: '设置' },
];

const THEMES = [
  { value: 'light', icon: '☀️', title: '浅色' },
  { value: 'dark', icon: '🌙', title: '深色' },
  { value: 'auto', icon: '💻', title: '跟随系统' },
];

export default function Sidebar() {
  const { theme, setTheme } = useStore();

  return (
    <aside className="flex flex-col w-56 h-full shrink-0 border-r border-border" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/static/logo.png" alt="" className="w-8 h-8 rounded-lg object-contain hidden" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <div>
          <h1 className="text-sm font-semibold text-white tracking-tight">图文工坊</h1>
          <p className="text-[11px] text-zinc-500">自动化内容发布</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-1 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 space-y-3 border-t border-white/5">
        <div className="flex gap-1">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={`flex-1 py-1.5 rounded-md text-sm transition-all ${
                theme === t.value ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title={t.title}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-zinc-700 text-center">v0.3.0</div>
      </div>
    </aside>
  );
}
