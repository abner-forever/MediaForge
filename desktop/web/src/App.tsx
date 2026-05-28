import { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Loading from './components/Loading';
import { appRoutes } from './routes';

export default function App() {
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
