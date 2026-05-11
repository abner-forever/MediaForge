import { NavLink } from 'react-router-dom';

function Icon({ children, className = 'w-4 h-4' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`}>
      {children}
    </svg>
  );
}

const ICONS = {
  home: (<Icon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Icon>),
  search: (<Icon><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>),
  list: (<Icon><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Icon>),
  image: (<Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Icon>),
  settings: (<Icon className="w-4 h-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.51-1 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>),
} as const;

const NAV_ITEMS = [
  { path: '/', icon: ICONS.home, label: '首页' },
  { path: '/discovery', icon: ICONS.search, label: '图片发现' },
  { path: '/queue', icon: ICONS.list, label: '发布队列' },
  { path: '/materials', icon: ICONS.image, label: '本地素材' },
] as const;

export default function Sidebar() {
  return (
    <aside className="flex flex-col w-56 h-full shrink-0 border-r border-white/[0.08]" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white text-xs font-bold shrink-0">
          <img src="/static/logo.png" alt="图文工坊" className="w-full h-full object-contain rounded-lg" onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.parentElement!.textContent = 'M') }} />
        </div>
        <div>
          <div className="text-sm font-bold text-white tracking-tight">图文工坊</div>
          <div className="text-[10px] text-white/30 tracking-widest uppercase">MediaForge</div>
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/[0.06] space-y-2">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-accent text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
            }`
          }
        >
          {ICONS.settings}
          <span>系统设置</span>
        </NavLink>
        <div className="text-center">
          <span className="text-[9px] text-zinc-700 tracking-widest">v{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
