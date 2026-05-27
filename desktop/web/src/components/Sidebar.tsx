import { NavLink } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { wechatAccountApi, type WeChatAccount } from '../api/client';
import { useStore } from '../stores';

/* ── Constants ───────────────────────────────────── */
const COLLAPSE_THRESHOLD = 140;
const NARROW_WIDTH = 60;
const MIN_EXPANDED = 180;
const MAX_WIDTH = 400;

/* ── Icons ────────────────────────────────────────── */
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
  pipeline: (<Icon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Icon>),
  edit: (<Icon><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>),
  list: (<Icon><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Icon>),
  image: (<Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Icon>),
  settings: (<Icon className="w-4 h-4"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.51-1 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>),
} as const;

const NAV_ITEMS = [
  { path: '/', icon: ICONS.home, label: '首页' },
  { path: '/discovery', icon: ICONS.search, label: '图片发现' },
  { path: '/pipeline', icon: ICONS.pipeline, label: '智能流水线' },
  { path: '/articles', icon: ICONS.edit, label: '文章发布' },
  { path: '/queue', icon: ICONS.list, label: '发布队列' },
  { path: '/materials', icon: ICONS.image, label: '本地素材' },
] as const;

export default function Sidebar() {
  const [account, setAccount] = useState<WeChatAccount | null>(null);
  const wechatRefreshKey = useStore(s => s.wechatRefreshKey);
  const width = useStore(s => s.sidebarWidth);
  const setWidth = useStore(s => s.setSidebarWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverHandle, setHoverHandle] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const collapsed = width <= NARROW_WIDTH + 10;
  const effectiveWidth = collapsed ? NARROW_WIDTH : width;

  useEffect(() => {
    wechatAccountApi.list().then(({ accounts }) => {
      setAccount(accounts.find(a => a.is_default) || accounts[0] || null);
    }).catch(() => setAccount(null));
  }, [wechatRefreshKey]);

  const snapWidth = useCallback((w: number) => {
    if (w < COLLAPSE_THRESHOLD) return NARROW_WIDTH;
    if (w < MIN_EXPANDED) return MIN_EXPANDED;
    return Math.min(w, MAX_WIDTH);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = effectiveWidth;
  }, [effectiveWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - startXRef.current;
        const newWidth = startWidthRef.current + delta;
        const snapped = snapWidth(newWidth);
        setWidth(snapped);
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const final = snapWidth(useStore.getState().sidebarWidth);
      setWidth(final);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, snapWidth, setWidth]);

  const toggleCollapse = useCallback(() => {
    const current = useStore.getState().sidebarWidth;
    setWidth(current <= NARROW_WIDTH + 10 ? MIN_EXPANDED : NARROW_WIDTH);
  }, [setWidth]);

  return (
    <aside
      ref={asideRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: effectiveWidth,
        height: '100%',
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--sidebar-border)',
        transition: isDragging ? 'none' : 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : undefined,
        gap: collapsed ? 0 : 14,
        padding: collapsed ? '16px 0 24px' : '16px 20px 24px',
      }}>
        <div style={{
          width: collapsed ? 36 : 42,
          height: collapsed ? 36 : 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <img src="/static/logo.png" alt="图文工坊" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--sidebar-text-logo)', letterSpacing: '-0.3px', lineHeight: 1.3, whiteSpace: 'nowrap' }}>图文工坊</div>
            <div style={{ fontSize: 11, color: 'var(--sidebar-text-muted)', letterSpacing: '0.4px', fontWeight: 500, marginTop: 1 }}>MediaForge</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: collapsed ? '0 6px' : '0 10px' }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-[10px] rounded-lg text-sm font-medium ${
                isActive
                  ? 'nav-active'
                  : 'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'
              }`
            }
            style={{ marginBottom: 2, textDecoration: 'none' }}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{
        padding: collapsed ? '12px 4px' : '12px 10px',
        borderTop: '1px solid var(--sidebar-border)',
      }}>
        {!collapsed && (
          <NavLink
            to="/settings"
            className="block rounded-lg px-3 py-[10px] mb-2 hover:bg-[var(--sidebar-hover)]"
            style={{ textDecoration: 'none', border: '1px solid var(--sidebar-border)' }}
            title="进入公众号账号设置"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: account?.logged_in ? 'var(--status-ok)' : 'var(--status-error)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--sidebar-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account?.name || '未设置公众号'}
                </div>
                <div style={{ fontSize: 11, color: account?.logged_in ? 'var(--status-ok)' : 'var(--status-error)' }}>
                  {account?.logged_in ? '默认账号已登录' : '需要扫码登录'}
                </div>
              </div>
            </div>
          </NavLink>
        )}
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 px-3 py-[10px] rounded-lg text-sm font-medium ${
              isActive
                ? 'nav-active'
                : 'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'
            }`
          }
          style={{ textDecoration: 'none' }}
          title={collapsed ? '设置' : undefined}
        >
          {ICONS.settings}
          {!collapsed && <span>设置</span>}
        </NavLink>
        {!collapsed && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--sidebar-text-muted)', letterSpacing: '0.15em', opacity: 0.4 }}>v{__APP_VERSION__}</span>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHoverHandle(true)}
        onMouseLeave={() => setHoverHandle(false)}
        onDoubleClick={toggleCollapse}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 8,
          cursor: 'col-resize',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Handle visual bar — shows on hover / drag */}
        <div style={{
          width: 3,
          height: hoverHandle || isDragging ? '40%' : 0,
          borderRadius: 999,
          background: isDragging
            ? 'var(--accent)'
            : 'rgba(255,255,255,0.15)',
          transition: 'height 0.15s, background 0.15s, opacity 0.15s',
          opacity: hoverHandle || isDragging ? 1 : 0,
          pointerEvents: 'none',
        }} />
      </div>
    </aside>
  );
}
