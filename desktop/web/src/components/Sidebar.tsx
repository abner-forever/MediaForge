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
  edit: (<Icon><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>),
  list: (<Icon><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Icon>),
  image: (<Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Icon>),
  settings: (<Icon className="w-4 h-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.51-1 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>),
} as const;

const NAV_ITEMS = [
  { path: '/', icon: ICONS.home, label: '首页' },
  { path: '/discovery', icon: ICONS.search, label: '图片发现' },
  { path: '/articles', icon: ICONS.edit, label: '文章发布' },
  { path: '/queue', icon: ICONS.list, label: '发布队列' },
  { path: '/materials', icon: ICONS.image, label: '本地素材' },
] as const;

export default function Sidebar() {
  return (
    <aside className="flex flex-col w-56 h-full shrink-0 border-r border-white/[0.06]" style={{ background: 'linear-gradient(180deg, var(--bg-sidebar) 0%, #0a0a14 100%)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-5">
        <div className="w-14 h-14 flex items-center justify-center shrink-0 overflow-hidden">
          <img src="/static/logo.png" alt="图文工坊" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="text-base font-bold text-white tracking-tight">图文工坊</div>
          <div className="text-[11px] text-white/30 tracking-[0.15em] uppercase">MediaForge</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent text-white shadow-md shadow-accent/20'
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
      <div className="px-3 py-4 border-t border-white/[0.06] space-y-3">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
            }`
          }
        >
          {ICONS.settings}
          <span>系统设置</span>
        </NavLink>
        <div className="text-center">
          <span className="text-[9px] text-zinc-700 tracking-[0.15em]">v{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
