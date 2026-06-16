import { useState, useCallback, useEffect } from 'react';
import { logsApi, type LogFileInfo } from '../../api/client';
import { useStore } from '../../stores';

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AboutSection() {
  const addToast = useStore((s) => s.addToast);
  const [clickCount, setClickCount] = useState(0);
  const [devMode, setDevMode] = useState(false);

  // ── 日志管理状态 ──
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [logError, setLogError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [openedFile, setOpenedFile] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string[]>>({});
  const [loadingContent, setLoadingContent] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    logsApi
      .list()
      .then((res) => {
        setLogFiles(res.files);
        setLogError('');
      })
      .catch((err) => {
        setLogError(err.message || '加载日志列表失败');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopyAll = useCallback(async () => {
    setCopying(true);
    try {
      const parts: string[] = [];
      for (const f of logFiles) {
        try {
          const res = await logsApi.content(f.name, 1000);
          parts.push(`── ${f.name} (${res.total} 行) ──\n${res.lines.join('\n')}`);
        } catch {
          parts.push(`── ${f.name} (读取失败) ──`);
        }
      }
      await logsApi.copyToClipboard(parts.join('\n\n'));
      addToast('所有日志已复制到剪贴板', 'success');
    } catch (err: any) {
      addToast(err.message || '复制失败', 'error');
    } finally {
      setCopying(false);
    }
  }, [logFiles, addToast]);

  const handleSaveAll = useCallback(async () => {
    setSavingAll(true);
    try {
      let saved = 0;
      for (const f of logFiles) {
        try {
          await logsApi.saveToDownloads(f.name);
          saved++;
        } catch {
          /* skip */
        }
      }
      addToast(`${saved} 个日志文件已保存到下载目录`, 'success');
    } catch (err: any) {
      addToast(err.message || '保存失败', 'error');
    } finally {
      setSavingAll(false);
    }
  }, [logFiles, addToast]);

  const toggleFile = useCallback(
    async (name: string) => {
      if (openedFile === name) {
        setOpenedFile(null);
        return;
      }
      setOpenedFile(name);
      if (!fileContents[name]) {
        setLoadingContent(name);
        try {
          const res = await logsApi.content(name, 100);
          setFileContents((prev) => ({ ...prev, [name]: res.lines }));
        } catch {
          setFileContents((prev) => ({ ...prev, [name]: ['（读取失败）'] }));
        } finally {
          setLoadingContent(null);
        }
      }
    },
    [openedFile, fileContents],
  );

  const handleCopyFile = useCallback(
    async (file: LogFileInfo) => {
      setCopying(true);
      try {
        const res = await logsApi.content(file.name, 2000);
        const header = `── ${file.name} (${formatSize(file.size)}, ${res.total} 行) ──\n`;
        await logsApi.copyToClipboard(header + res.lines.join('\n'));
        addToast(`「${file.name}」日志已复制到剪贴板`, 'success');
      } catch (err: any) {
        addToast(err.message || '复制失败', 'error');
      } finally {
        setCopying(false);
      }
    },
    [addToast],
  );

  const handleDeleteFile = useCallback(
    async (file: LogFileInfo) => {
      setDeleting(file.name);
      try {
        await logsApi.delete(file.name);
        setLogFiles((prev) => prev.filter((f) => f.name !== file.name));
        if (openedFile === file.name) setOpenedFile(null);
        setFileContents((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
        addToast(`已删除「${file.name}」`, 'success');
      } catch (err: any) {
        addToast(err.message || '删除失败', 'error');
      } finally {
        setDeleting(null);
      }
    },
    [openedFile, addToast],
  );

  const handleClearAll = useCallback(async () => {
    setClearingAll(true);
    try {
      const res = await logsApi.clearAll();
      setLogFiles([]);
      setOpenedFile(null);
      setFileContents({});
      addToast(`已清空 ${res.deleted} 个日志文件`, 'success');
    } catch (err: any) {
      addToast(err.message || '清空失败', 'error');
    } finally {
      setClearingAll(false);
    }
  }, [addToast]);

  const handleVersionClick = useCallback(async () => {
    const next = clickCount + 1;
    setClickCount(next);

    if (next >= 5) {
      setClickCount(0);
      if (vConsoleInstance) return;

      try {
        await loadScript('https://unpkg.com/vconsole@3/dist/vconsole.min.js');
        const VConsole = (window as any).VConsole;
        vConsoleInstance = new VConsole();
        setDevMode(true);
      } catch (err) {
        console.error('vConsole 加载失败:', err);
      }
      return;
    }

    setTimeout(() => setClickCount((c) => Math.max(0, c - 1)), 2000);
  }, [clickCount]);

  const handleExitDevMode = () => {
    if (vConsoleInstance) {
      vConsoleInstance.destroy();
      vConsoleInstance = null;
    }
    setDevMode(false);
  };

  const totalSize = logFiles.reduce((s, f) => s + f.size, 0);

  return (
    <div className="space-y-5">
      {/* ── App Info Card ── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-soft shrink-0">
            <img
              src="/static/logo.png"
              alt="图文工坊"
              style={{ width: '90%', height: '90%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text tracking-tight">MediaForge</h2>
            <p className="text-sm text-text-muted">图文工坊 · 自动化微信公众号内容发布系统</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">
          MediaForge 是专为微信公众号运营者设计的内容生产效率工具。自动完成热点发现、素材采集、AI
          写作、排版优化和定时发布的完整工作流，让运营团队从繁琐的重复劳动中解放出来，专注于内容创意本身。
        </p>
      </div>

      {/* ── 新手引导 Card ── */}
      <div className="card space-y-3">
        <div className="section-header">新手快速入门</div>
        <ol className="space-y-2.5 text-sm text-text-secondary">
          {[
            [
              '配置 AI 服务',
              '前往「系统设置 → 大模型配置」填写 API Key 和 Base URL，这是 AI 写作和智能评分的动力来源。',
            ],
            [
              '登录内容平台',
              '在「系统设置 → 媒体来源」中登录微博、今日头条等平台，开启图文发现能力。',
            ],
            ['发现与采集', '在「图片发现」页设置艺人关键词或话题标签，一键搜索并下载图片素材。'],
            [
              'AI 创作内容',
              '选中素材加入发布队列，使用 AI 润色生成标题；或在「文章发布」中让 AI 根据话题自动创作全文。',
            ],
            [
              '发布到公众号',
              '在「系统设置 → 微信配置」中添加并登录公众号账号，回到队列一键保存草稿或直接发布。',
            ],
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
        <button
          onClick={handleVersionClick}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-bg-secondary hover:bg-accent-softer transition-colors cursor-pointer"
        >
          <span className="text-sm text-text-secondary">应用版本</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text font-mono">v{__APP_VERSION__}</span>
            {clickCount > 0 && !devMode && (
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
        <div className="flex items-center justify-between px-4 py-2.5 mt-1 rounded-xl bg-bg-secondary/50">
          <span className="text-sm text-text-secondary">更新时间</span>
          <span className="text-sm text-text-muted">
            {new Date(__BUILD_TIME__).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* ── 日志与反馈 ── */}
      <div className="card space-y-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="section-header">日志与反馈</span>
          </div>
          {!loading && !logError && (
            <span className="text-xs text-text-muted">
              {logFiles.length} 个文件 · {formatSize(totalSize)}
            </span>
          )}
        </button>

        {/* 折叠状态下只显示懒人操作按钮 */}
        {!expanded && !loading && !logError && logFiles.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleCopyAll} disabled={copying} className="btn btn-sm">
              {copying ? '复制中...' : '复制全部日志'}
            </button>
            <button onClick={handleSaveAll} disabled={savingAll} className="btn btn-sm">
              {savingAll ? '保存中...' : '保存到下载目录'}
            </button>
            <button
              onClick={handleClearAll}
              disabled={clearingAll}
              className="btn btn-sm btn-danger"
            >
              {clearingAll ? '清空中...' : '清空全部'}
            </button>
          </div>
        )}
        {!expanded && !loading && !logError && logFiles.length === 0 && (
          <p className="text-sm text-text-muted pt-1">暂无日志文件</p>
        )}

        {/* 展开后显示详情 */}
        {expanded && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="ml-2 text-sm text-text-muted">加载日志列表...</span>
              </div>
            )}

            {logError && (
              <div className="empty-state py-4">
                <p className="text-sm text-danger">{logError}</p>
                <button
                  className="btn btn-xs mt-2"
                  onClick={() => {
                    setLoading(true);
                    setLogError('');
                    logsApi
                      .list()
                      .then((res) => {
                        setLogFiles(res.files);
                        setLogError('');
                      })
                      .catch((err) => setLogError(err.message || '加载失败'))
                      .finally(() => setLoading(false));
                  }}
                >
                  重试
                </button>
              </div>
            )}

            {!loading && !logError && logFiles.length === 0 && (
              <div className="empty-state py-4">
                <p className="text-sm text-text-muted">暂无日志文件</p>
              </div>
            )}

            {!loading && !logError && logFiles.length > 0 && (
              <div className="space-y-1">
                {logFiles.map((file) => (
                  <div key={file.name} className="rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleFile(file.name)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-bg-secondary hover:bg-accent-softer transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <svg
                          className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform ${openedFile === file.name ? 'rotate-90' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <svg
                          className="w-4 h-4 text-text-muted shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-text">{file.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-xs text-text-muted">{formatSize(file.size)}</span>
                        <span className="text-xs text-text-muted">{formatTime(file.mtime)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file);
                          }}
                          disabled={deleting === file.name}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors cursor-pointer"
                          title="删除此日志"
                        >
                          {deleting === file.name ? (
                            <div className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg
                              className="w-3.5 h-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </button>

                    {openedFile === file.name && (
                      <div className="border-t border-border bg-bg-secondary/50">
                        <pre className="max-h-60 overflow-auto p-3 text-[11px] leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-all select-text">
                          {loadingContent === file.name ? (
                            <span className="text-text-muted">加载中...</span>
                          ) : fileContents[file.name]?.length ? (
                            fileContents[file.name].join('\n')
                          ) : (
                            <span className="text-text-muted">（空）</span>
                          )}
                        </pre>
                        <div className="flex justify-end px-3 pb-2">
                          <button
                            onClick={() => handleCopyFile(file)}
                            disabled={copying}
                            className="btn btn-xs"
                          >
                            {copying ? '复制中...' : '复制此文件'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loading && !logError && logFiles.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <button onClick={handleCopyAll} disabled={copying} className="btn btn-sm">
                  {copying ? '复制中...' : '复制全部日志'}
                </button>
                <button onClick={handleSaveAll} disabled={savingAll} className="btn btn-sm">
                  {savingAll ? '保存中...' : '保存到下载目录'}
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  className="btn btn-sm btn-danger"
                >
                  {clearingAll ? '清空中...' : '清空全部'}
                </button>
              </div>
            )}

            <p className="text-xs text-text-muted pt-1">
              日志文件包含应用运行期间的操作记录和错误信息。如需反馈问题，请复制日志内容并联系开发团队。
            </p>
          </>
        )}
      </div>

      {/* ── Dev mode hint ── */}
      {devMode && (
        <div className="card border-accent/30 bg-accent-softer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-accent"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span className="text-sm font-medium text-accent">开发者模式已开启</span>
            </div>
            <button onClick={handleExitDevMode} className="btn btn-xs btn-danger">
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
