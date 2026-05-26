import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Loading from './components/Loading';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Discovery = lazy(() => import('./pages/Discovery'));
const Queue = lazy(() => import('./pages/Queue'));
const Materials = lazy(() => import('./pages/Materials'));
const Settings = lazy(() => import('./pages/Settings'));
const ArticlePublish = lazy(() => import('./pages/ArticlePublish'));
const Pipeline = lazy(() => import('./pages/Pipeline'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={
            <Suspense fallback={<PageLoading />}><Dashboard /></Suspense>
          } />
          <Route path="/discovery" element={
            <Suspense fallback={<PageLoading />}><Discovery /></Suspense>
          } />
          <Route path="/pipeline" element={
            <Suspense fallback={<PageLoading />}><Pipeline /></Suspense>
          } />
          <Route path="/articles" element={
            <Suspense fallback={<PageLoading />}><ArticlePublish /></Suspense>
          } />
          <Route path="/queue" element={
            <Suspense fallback={<PageLoading />}>
              <ErrorBoundary><Queue /></ErrorBoundary>
            </Suspense>
          } />
          <Route path="/materials" element={
            <Suspense fallback={<PageLoading />}><Materials /></Suspense>
          } />
          <Route path="/settings" element={
            <Suspense fallback={<PageLoading />}><Settings /></Suspense>
          } />
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
