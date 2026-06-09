import { lazy } from 'react';
import type { ComponentType } from 'react';

export interface AppRoute {
  path: string;
  element: React.LazyExoticComponent<ComponentType>;
  errorBoundary?: boolean;
}

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Discovery = lazy(() => import('./pages/Discovery'));
const Queue = lazy(() => import('./pages/Queue'));
const Materials = lazy(() => import('./pages/Materials'));
const Settings = lazy(() => import('./pages/Settings'));
const ArticlePublish = lazy(() => import('./pages/ArticlePublish'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Effects = lazy(() => import('./pages/Effects'));
const Credits = lazy(() => import('./pages/Credits'));
const Auth = lazy(() => import('./pages/Auth'));
const UserCenter = lazy(() => import('./pages/UserCenter'));

export const appRoutes: AppRoute[] = [
  { path: '/', element: Dashboard },
  { path: '/discovery', element: Discovery },
  { path: '/pipeline', element: Pipeline },
  { path: '/articles', element: ArticlePublish },
  { path: '/queue', element: Queue, errorBoundary: true },
  { path: '/effects', element: Effects },
  { path: '/credits', element: Credits },
  { path: '/materials', element: Materials },
  { path: '/settings', element: Settings },
  { path: '/auth', element: Auth },
  { path: '/user', element: UserCenter },
];
