import { useRef, useEffect, useState, useCallback } from 'react';
import { fileUrl } from '../../utils/file';
// 类型导入（编译时擦除），运行时动态 import 避免 460 kB 阻塞页面加载
import type * as pdfjsLib from 'pdfjs-dist';
// Vite 构建时自动处理 worker URL（作为静态资源，体积不影响主线程）
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite ?url 导入
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export default function PdfPreview({ path, onClose }: { path: string; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [actualScale, setActualScale] = useState(1);

  // 点击遮罩关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const downloadHref = fileUrl(path);
  const fileName = path.split('/').pop();

  // ════════════════ 加载 PDF（延迟导入 pdfjs-dist） ════════════════
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = fileUrl(path);
        const res = await fetch(url);
        if (!res.ok) throw new Error('获取失败');
        const buf = await res.arrayBuffer();

        // 动态导入 pdfjs-dist（460 kB chunk 按需加载）
        const pdfjs = await import('pdfjs-dist');
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          (pdfjs.GlobalWorkerOptions as any).workerSrc = workerUrl;
        }

        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled) return;

        pdfRef.current = pdf as any;
        setPageCount(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // ════════════════ 渲染当前页 ════════════════
  const renderCurrent = useCallback(async () => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!pdf || !canvas || !container) return;

    // 取消前一次渲染
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        /* */
      }
      renderTaskRef.current = null;
    }

    const page = await pdf.getPage(currentPage);
    const containerWidth = container.clientWidth - 4; // 留 2px 边距
    if (containerWidth <= 0) return;

    // 适配高 DPI 屏幕：canvas 物理像素 = CSS 像素 × devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    const baseVp = page.getViewport({ scale: 1 });
    const scale = (containerWidth * 0.8) / baseVp.width;
    const vp = page.getViewport({ scale });

    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    canvas.width = vp.width * dpr;
    canvas.height = vp.height * dpr;

    const ctx = canvas.getContext('2d')!;
    // 清除前一次渲染残留，重置变换矩阵
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
    renderTaskRef.current = task;
    await task.promise;
    renderTaskRef.current = null;

    setActualScale(scale);
  }, [currentPage]);

  // 加载完毕或翻页时渲染
  useEffect(() => {
    if (!loading && pdfRef.current) {
      renderCurrent();
    }
  }, [loading, currentPage, renderCurrent]);

  // 窗口 resize 重新渲染
  useEffect(() => {
    if (loading || !pdfRef.current) return;
    const onResize = () => renderCurrent();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [loading, renderCurrent]);

  // 组件卸载时销毁
  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* */
        }
      }
      pdfRef.current?.cleanup();
    };
  }, []);

  // ════════════════ 渲染 ════════════════
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="relative w-[90vw] max-w-5xl h-[90vh] bg-bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-text truncate">{fileName}</h3>
          <div className="flex items-center gap-2">
            <a
              href={downloadHref}
              download={fileName}
              className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors"
              title="下载"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
            <button
              className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors"
              onClick={onClose}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* PDF 预览区 */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 bg-gray-100 dark:bg-gray-900 relative overflow-auto flex flex-col items-center py-4"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex items-center gap-3 text-text-muted">
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-20"
                  />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-sm">加载 PDF 中...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="text-sm text-red-500">PDF 加载失败，请尝试下载后查看</div>
              <a
                href={downloadHref}
                download={fileName}
                className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                下载 PDF
              </a>
            </div>
          )}
          {!loading && !error && (
            <>
              <canvas ref={canvasRef} className="shadow-xl rounded-sm bg-white" />

              {/* 页码导航 */}
              {pageCount > 1 && (
                <div className="sticky bottom-2 mt-4 flex items-center gap-3 bg-bg-card/90 backdrop-blur rounded-full px-4 py-2 shadow-lg border border-border">
                  <button
                    className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 transition-colors"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span className="text-xs text-text tabular-nums whitespace-nowrap">
                    {currentPage} / {pageCount}
                    {actualScale !== 1 && (
                      <span className="ml-1.5 text-text-muted">
                        ({Math.round(actualScale * 100)}%)
                      </span>
                    )}
                  </span>
                  <button
                    className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 transition-colors"
                    disabled={currentPage >= pageCount}
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
