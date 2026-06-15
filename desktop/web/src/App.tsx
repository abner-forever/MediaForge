import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Loading from './components/Loading';
import PublishStatusPanel from './components/feature/PublishStatusPanel';
import { appRoutes } from './routes';
import { useStore } from './stores';
import { userApi } from './api/client';

export default function App() {
  const { isAuthenticated, setToken, setUser, setAuthenticated, login, logout } = useStore();

  // 应用启动时恢复登录状态
  // PyWebView 的 localStorage 重启后会丢失，所以优先从后端文件恢复 token
  useEffect(() => {
    const checkAuth = async () => {
      // 优先从 localStorage 读取（同一次会话内有效）
      let savedToken = localStorage.getItem('auth_token');

      // localStorage 没有（PyWebView 重启），从后端持久化文件恢复
      if (!savedToken) {
        try {
          const saved = await userApi.getSavedToken();
          if (saved.success && saved.token) {
            savedToken = saved.token;
          }
        } catch {
          // 后端不可用，跳过
        }
      }

      if (!savedToken) return;

      try {
        setToken(savedToken);

        // 验证 token 是否有效
        const result = await userApi.checkAuth();
        if (result.success && result.authenticated) {
          const userResult = await userApi.getCurrentUser();
          if (userResult.success) {
            login(userResult.data, savedToken);
          } else {
            logout();
          }
        } else {
          logout();
        }
      } catch (err) {
        console.error('自动登录失败:', err);
        logout();
      }
    };

    checkAuth();

    // 监听 auth:logout 事件
    const handleLogout = () => { logout(); };
    window.addEventListener('auth:logout', handleLogout);
    return () => { window.removeEventListener('auth:logout', handleLogout); };
  }, []);

  // PyWebView 环境：拦截外部链接，通过 bridge 打开新应用窗口
  useEffect(() => {
    if (!window.pywebview?.api) return;

    const handler = (e: MouseEvent) => {
      const link = (e.target as Element).closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;

      // 跳过内部链接、锚点、javascript 协议
      if (href.startsWith('/') || href.startsWith('#') || href.startsWith('javascript:')) return;

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin) return;
      } catch {
        return;
      }

      e.preventDefault();
      window.pywebview!.api.open_url(href).catch(() => {
        // bridge 失败时兜底：用浏览器默认方式打开
        window.open(href, '_blank');
      });
    };

    document.addEventListener('click', handler, false);
    return () => document.removeEventListener('click', handler, false);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {appRoutes.map(({ path, element: Page, errorBoundary }) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={<PageLoading />}>
                  {errorBoundary ? (
                    <ErrorBoundary><Page /></ErrorBoundary>
                  ) : (
                    <Page />
                  )}
                </Suspense>
              }
            />
          ))}
        </Route>
      </Routes>
      <PublishStatusPanel />
    </BrowserRouter>
  );
}

function PageLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loading />
    </div>
  );
}
