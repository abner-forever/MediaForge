import { useRef, useState, useCallback } from 'react';

let vConsoleInstance: any = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

export default function AboutSection() {
  const [clickCount, setClickCount] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const loadingRef = useRef(false);

  const handleVersionClick = useCallback(async () => {
    const next = clickCount + 1;
    setClickCount(next);

    if (next >= 5) {
      setClickCount(0);
      if (vConsoleInstance) return; // already open

      loadingRef.current = true;
      try {
        await loadScript('https://unpkg.com/vconsole@3/dist/vconsole.min.js');
        const VConsole = (window as any).VConsole;
        vConsoleInstance = new VConsole();
        setDevMode(true);
      } catch (err) {
        console.error('vConsole 加载失败:', err);
      }
      loadingRef.current = false;
      return;
    }

    setTimeout(() => setClickCount(c => Math.max(0, c - 1)), 2000);
  }, [clickCount]);

  const handleExitDevMode = useCallback(() => {
    if (vConsoleInstance) {
      vConsoleInstance.destroy();
      vConsoleInstance = null;
    }
    setDevMode(false);
  }, []);

  // Auto-cleanup on unmount
  // (We intentionally do NOT use useEffect cleanup for the instance,
  //  because vConsole persists across page navigation in SPA — cleanup
  //  only happens when user explicitly clicks "退出" or refreshes the page.)

  return (
    <div className="space-y-5">
      {/* ── App Info Card ── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-soft shrink-0">
            <svg className="w-7 h-7 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20" />
              <path d="M12 6v7M9 9l3-3 3 3" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-text tracking-tight">MediaForge</h2>
            <p className="text-sm text-text-muted">图文工坊 · 自动化微信公众号内容发布系统</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">
          MediaForge 是一个自动化微信公众号内容发布工具。核心流程：微博/头条图文发现 → 图片下载与水印过滤 → AI 智能评分/写作 → 文章草稿与发布队列 → 一键保存草稿或发布到微信公众号。
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { label: '前端技术', value: 'React + TypeScript + TailwindCSS' },
            { label: '后端框架', value: 'FastAPI (Python)' },
            { label: '桌面容器', value: 'PyWebView' },
            { label: 'AI 模型', value: 'OpenAI / DeepSeek / GLM / Qwen' },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-xl bg-bg-secondary">
              <p className="text-text-muted mb-0.5">{item.label}</p>
              <p className="text-text-secondary font-medium">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Version Card ── */}
      <div className="card">
        <div className="section-header mb-3">版本信息</div>
        <button
          onClick={handleVersionClick}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-bg-secondary hover:bg-accent-softer transition-colors cursor-pointer"
          title={`连续点击 5 次进入开发者模式`}
        >
          <span className="text-sm text-text-secondary">应用版本</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text font-mono">v{__APP_VERSION__}</span>
            {clickCount > 0 && (
              <span className="text-[10px] text-accent font-medium bg-accent-soft px-2 py-0.5 rounded-full">
                {5 - clickCount}
              </span>
            )}
            {devMode && (
              <span className="text-[10px] text-green-500 font-medium bg-green-500/10 px-2 py-0.5 rounded-full">
                已解锁
              </span>
            )}
          </div>
        </button>
        <p className="text-[11px] text-text-muted mt-2 text-center">连续点击版本号 5 次可进入开发者模式</p>
      </div>

      {/* ── Dev mode hint ── */}
      {devMode && (
        <div className="card border-accent/30 bg-accent-softer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span className="text-sm font-medium text-accent">开发者模式已开启</span>
            </div>
            <button onClick={handleExitDevMode}
              className="btn btn-xs btn-danger">
              退出开发者模式
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5 ml-6">
            vConsole 调试面板已加载，点击页面右下角的浮窗按钮即可使用
          </p>
        </div>
      )}
    </div>
  );
}
