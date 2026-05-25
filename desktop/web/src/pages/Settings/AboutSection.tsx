import { useState } from 'react';

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
  const [devMode, setDevMode] = useState(false);

  const handleExitDevMode = () => {
    if (vConsoleInstance) {
      vConsoleInstance.destroy();
      vConsoleInstance = null;
    }
    setDevMode(false);
  };

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
          MediaForge 是专为微信公众号运营者设计的内容生产效率工具。自动完成热点发现、素材采集、AI 写作、排版优化和定时发布的完整工作流，让运营团队从繁琐的重复劳动中解放出来，专注于内容创意本身。
        </p>
      </div>

      {/* ── 新手引导 Card ── */}
      <div className="card space-y-3">
        <div className="section-header">新手快速入门</div>
        <ol className="space-y-2.5 text-sm text-text-secondary">
          {[
            ['配置 AI 服务', '前往「系统设置 → 大模型配置」填写 API Key 和 Base URL，这是 AI 写作和智能评分的动力来源。'],
            ['登录内容平台', '在「系统设置 → 媒体来源」中登录微博、今日头条等平台，开启图文发现能力。'],
            ['发现与采集', '在「图片发现」页设置艺人关键词或话题标签，一键搜索并下载图片素材。'],
            ['AI 创作内容', '选中素材加入发布队列，使用 AI 润色生成标题；或在「文章发布」中让 AI 根据话题自动创作全文。'],
            ['发布到公众号', '在「系统设置 → 微信配置」中添加并登录公众号账号，回到队列一键保存草稿或直接发布。'],
          ].map(([step, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-soft text-accent text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="font-medium text-text">{step}</span>
                <p className="text-text-muted mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Version Card ── */}
      <div className="card">
        <div className="section-header mb-3">版本信息</div>
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-bg-secondary">
          <span className="text-sm text-text-secondary">应用版本</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text font-mono">v{__APP_VERSION__}</span>
          </div>
        </div>
      </div>

      {/* ── Dev mode hint (hidden unless triggered via console) ── */}
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
