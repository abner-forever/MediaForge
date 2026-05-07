import { NavLink } from 'react-router-dom';

/* ── SVG Icons (Feather-style) ─────────────── */

function Icon({ children, className = 'w-4 h-4' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`}>
      {children}
    </svg>
  );
}

const ICONS = {
  home: (
    <Icon>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  ),
  list: (
    <Icon>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.51-1 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
} as const;

const NAV_ITEMS = [
  { path: '/', icon: ICONS.home, label: '首页' },
  { path: '/discovery', icon: ICONS.search, label: '图片发现' },
  { path: '/queue', icon: ICONS.list, label: '发布队列' },
  { path: '/materials', icon: ICONS.image, label: '本地素材' },
] as const;

export default function Sidebar() {
  return (
    <aside className="flex flex-col w-56 h-full shrink-0 border-r border-border" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <img src="/static/logo.png" alt="图文工坊" className="w-7 h-7 rounded-md object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <div>
          <h1 className="text-sm font-semibold text-white tracking-tight">图文工坊</h1>
          <p className="text-[10px] text-white/40 leading-tight">自动化内容发布</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-0 space-y-0">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all border-l-2 ${
                isActive
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom: Settings & Version (centered) */}
      <div className="px-3 py-3 border-t border-white/10 space-y-1">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              isActive
                ? 'bg-accent/15 text-accent'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`
          }
        >
          {ICONS.settings}
        </NavLink>
        <div className="text-center">
          <span className="text-[10px] text-zinc-600 tracking-wide">v0.3.0</span>
        </div>
      </div>
    </aside>
  );
}
