import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toast from './Toast';
import Lightbox from './Lightbox';
import ProgressOverlay from './ProgressOverlay';

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 bg-bg">
        <Outlet />
      </main>
      <Toast />
      <Lightbox />
      <ProgressOverlay />
    </div>
  );
}
