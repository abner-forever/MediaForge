import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const STEPS = [
  '正在连接微博...',
  '正在抓取帖子列表...',
  '正在解析图片链接...',
  '即将完成...',
];

interface Props {
  message?: string;
}

export default function SearchLoadingOverlay({ message }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2000);
    return () => clearInterval(timer);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-2xl p-8 text-center min-w-[280px] shadow-2xl">
        {/* Spinner */}
        <div className="mx-auto w-12 h-12 relative">
          <div className="absolute inset-0 rounded-full border-[3px] border-[var(--border)]" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--accent)] animate-spin" />
        </div>

        <div className="mt-4 text-sm font-medium text-text">
          {message || '正在搜索微博内容'}
        </div>
        <div className="mt-2 text-xs text-text-muted h-4 transition-opacity duration-300">
          {STEPS[step]}
        </div>
      </div>
    </div>,
    document.body,
  );
}
