import { createPortal } from 'react-dom';

interface Props {
  title?: string;
  message?: string;
  platformName?: string;
  onCancel?: () => void;
}

export default function SearchLoadingOverlay({ title, message, platformName, onCancel }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[320px] shadow-xl animate-scale">
        {/* 多层旋转圆环 */}
        <div className="relative mx-auto w-20 h-20">
          {/* 外环 - 慢速逆时针 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ animation: 'search-ring-outer 4s linear infinite' }}
          >
            <svg className="w-full h-full" viewBox="0 0 80 80">
              <defs>
                <linearGradient id="outerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(59, 130, 246, 0.1)" />
                  <stop offset="50%" stopColor="rgba(59, 130, 246, 0.6)" />
                  <stop offset="100%" stopColor="rgba(59, 130, 246, 0.1)" />
                </linearGradient>
              </defs>
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="url(#outerGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="180 226"
              />
            </svg>
          </div>

          {/* 中环 - 中速顺时针 */}
          <div
            className="absolute inset-1 rounded-full"
            style={{ animation: 'search-ring-mid 2.5s linear infinite' }}
          >
            <svg className="w-full h-full" viewBox="0 0 72 72">
              <defs>
                <linearGradient id="midGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(139, 92, 246, 0.1)" />
                  <stop offset="50%" stopColor="rgba(139, 92, 246, 0.8)" />
                  <stop offset="100%" stopColor="rgba(236, 72, 153, 0.6)" />
                </linearGradient>
              </defs>
              <circle
                cx="36"
                cy="36"
                r="32"
                fill="none"
                stroke="url(#midGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="120 201"
              />
            </svg>
          </div>

          {/* 内环 - 快速逆时针 */}
          <div
            className="absolute inset-2 rounded-full"
            style={{ animation: 'search-ring-inner 1.8s linear infinite' }}
          >
            <svg className="w-full h-full" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="innerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(236, 72, 153, 0.2)" />
                  <stop offset="50%" stopColor="rgba(245, 158, 11, 0.8)" />
                  <stop offset="100%" stopColor="rgba(236, 72, 153, 0.2)" />
                </linearGradient>
              </defs>
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="url(#innerGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="80 176"
              />
            </svg>
          </div>

          {/* 中心光点 */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ animation: 'search-pulse 2s ease-in-out infinite' }}
          >
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-accent to-pink-500 shadow-lg shadow-accent/30" />
          </div>
        </div>

        <div className="mt-5 text-sm font-semibold text-text">
          {title || `正在搜索${platformName || ''}内容`}
        </div>
        {message ? (
          <div className="mt-2 text-xs text-text-muted leading-relaxed max-w-[260px]">
            {message}
          </div>
        ) : (
          <div className="mt-2 text-xs text-text-muted">正在获取图文数据…</div>
        )}
        {onCancel && (
          <button className="btn mt-5" onClick={onCancel}>
            取消
          </button>
        )}
      </div>

      <style>{`
        @keyframes search-ring-outer {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes search-ring-mid {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes search-ring-inner {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes search-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
