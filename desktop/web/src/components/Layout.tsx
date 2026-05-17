import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toast from './Toast';
import Lightbox from './Lightbox';
import ProgressOverlay from './ProgressOverlay';
import { useStore } from '../stores';

export default function Layout() {
  const syncTheme = useStore(s => s.syncTheme);
  useEffect(() => { syncTheme(); }, [syncTheme]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
          <Outlet />
        </div>
      </main>
      <Toast />
      <Lightbox />
      <ProgressOverlay />
    </div>
  );
}
