import { useStore } from '../stores';

export default function Toast() {
  const { toasts, removeToast } = useStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium cursor-pointer
            animate-[slideIn_0.25s_ease] backdrop-blur-sm
            ${t.type === 'success' ? 'bg-emerald-600/90 text-white' :
              t.type === 'error' ? 'bg-red-600/90 text-white' :
              'bg-zinc-900/80 text-zinc-100 dark:bg-zinc-100/90 dark:text-zinc-900'}`}
        >
          {t.msg}
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
