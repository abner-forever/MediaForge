import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { wechatAccountApi, type WeChatAccount } from '../api/client';
import { useStore } from '../stores';

function Icon({ children, className = 'w-5 h-5' }: { children: React.ReactNode; className?: string }) {
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
  const [account, setAccount] = useState<WeChatAccount | null>(null);
  const wechatRefreshKey = useStore(s => s.wechatRefreshKey);

  useEffect(() => {
    wechatAccountApi.list().then(({ accounts }) => {
      setAccount(accounts.find(a => a.is_default) || accounts[0] || null);
    }).catch(() => setAccount(null));
  }, [wechatRefreshKey]);

  return (
    <aside style={{
      display: 'flex',
      flexDirection: 'column',
      width: 240,
      height: '100%',
      flexShrink: 0,
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px 24px' }}>
        <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src="/static/logo.png" alt="图文工坊" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#f7f8f8', letterSpacing: '-0.3px', lineHeight: 1.3 }}>图文工坊</div>
          <div style={{ fontSize: 11, color: 'rgba(247,248,248,0.3)', letterSpacing: '0.4px', fontWeight: 500, marginTop: 1 }}>MediaForge</div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 10px' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-[10px] rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/[0.06]'
              }`
            }
            style={{ marginBottom: 2, textDecoration: 'none' }}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <NavLink
          to="/settings"
          className="block rounded-lg px-3 py-[10px] mb-2 hover:bg-white/[0.04]"
          style={{ textDecoration: 'none', border: '1px solid rgba(255,255,255,0.06)' }}
          title="进入公众号账号设置"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: account?.logged_in ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#d0d6e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {account?.name || '未设置公众号'}
              </div>
              <div style={{ fontSize: 11, color: account?.logged_in ? '#6ee7b7' : '#fca5a5' }}>
                {account?.logged_in ? '默认账号已登录' : '需要扫码登录'}
              </div>
            </div>
          </div>
        </NavLink>
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 px-3 py-[10px] rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-[var(--accent)] text-white'
                : 'text-[#62666d] hover:text-[#d0d6e0] hover:bg-white/[0.04]'
            }`
          }
          style={{ textDecoration: 'none' }}
        >
          {ICONS.settings}
          <span>系统设置</span>
        </NavLink>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#3e3e44', letterSpacing: '0.15em' }}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
