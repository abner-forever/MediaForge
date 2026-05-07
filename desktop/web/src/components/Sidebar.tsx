import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', icon: '🏠', label: '首页' },
  { path: '/discovery', icon: '🔍', label: '图片发现' },
  { path: '/queue', icon: '📝', label: '发布队列' },
  { path: '/materials', icon: '🖼️', label: '本地素材' },
];

export default function Sidebar() {
  return (
    <aside className="flex flex-col w-56 h-full shrink-0 border-r border-border" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/static/logo.png" alt="图文工坊" className="w-8 h-8 rounded-lg object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
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

      {/* Bottom: Settings */}
      <div className="px-3 py-3 border-t border-white/5 space-y-2">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
              isActive
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`
          }
        >
          <span className="text-base">⚙️</span>
          <span>设置</span>
        </NavLink>
        <div className="text-[11px] text-zinc-700 text-center">v0.3.0</div>
      </div>
    </aside>
  );
}
