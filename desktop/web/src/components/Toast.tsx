import { useStore } from '../stores';

const ICONS = {
  success: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

export default function Toast() {
  const { toasts, removeToast } = useStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} onClick={() => removeToast(t.id)}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium cursor-pointer shadow-lg animate-scale ${
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            t.type === 'error' ? 'bg-red-500 text-white' :
            'glass text-text shadow-xl'
          }`}
          style={{ animation: 'toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          {ICONS[t.type]}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
