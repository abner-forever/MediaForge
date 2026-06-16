import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSentry } from './sentry';
import App from './App';
import './index.css';

// 初始化 Sentry 错误监控（仅 production 生效）
initSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
