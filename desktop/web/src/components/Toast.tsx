import { useStore } from '../stores';

export default function Toast() {
  const { toasts, removeToast } = useStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} onClick={() => removeToast(t.id)}
          className={`pointer-events-auto px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer shadow-lg animate-up ${
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            t.type === 'error' ? 'bg-red-500 text-white' :
            'bg-bg-card text-text border border-border'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
