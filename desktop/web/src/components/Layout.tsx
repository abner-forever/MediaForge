import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toast from './Toast';
import Lightbox from './Lightbox';
import ProgressOverlay from './ProgressOverlay';
import { useStore } from '../stores';

const isWin = typeof navigator !== 'undefined' && navigator.platform?.includes('Win');

export default function Layout() {
  const syncTheme = useStore(s => s.syncTheme);
  const pipelineRunning = useStore(s => s.pipelineRunning);
  const sidebarWidthSynced = useStore(s => s.sidebarWidthSynced);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => { syncTheme(); }, [syncTheme]);

  // 不在流水线页面时显示全局浮动指示器
  const showPipelineIndicator = pipelineRunning && location.pathname !== '/pipeline';

  return (
    <div className={`flex h-screen overflow-hidden${isWin ? ' win32' : ''}`} style={{ background: 'var(--bg)' }}>
      {sidebarWidthSynced && <Sidebar />}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(120,104,208,0.015) 0%, transparent 30%), var(--bg)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px', flex: 1, minHeight: 0, width: '100%', overflowY: 'auto' }}>
          <Outlet />
        </div>
      </main>
      <Toast />
      <Lightbox />
      <ProgressOverlay />

      {/* 流水线运行中浮动指示器 */}
      {showPipelineIndicator && (
        <button
          onClick={() => navigate('/pipeline')}
          className="fixed bottom-6 right-6 z-[7000] group flex items-center gap-2 border border-border rounded-full pl-3 pr-4 py-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          style={{ background: 'var(--bg-card)', boxShadow: 'var(--card-shadow)' }}
          title="点击查看流水线进度"
        >
          {/* 水波纹动画 */}
          <span className="relative flex items-center justify-center w-8 h-8">
            <span className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
            <span className="absolute inset-1 rounded-full bg-accent/30 animate-pulse" />
            <span className="relative w-3 h-3 rounded-full bg-accent" />
          </span>
          <span className="text-xs font-medium text-text">流水线运行中</span>
        </button>
      )}
    </div>
  );
}
