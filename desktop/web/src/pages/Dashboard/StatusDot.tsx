export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function StatusDot({ ok }: { ok: boolean | undefined }) {
  const bg = ok === undefined ? '#94a3b8' : ok ? '#10b981' : '#ef4444';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: bg }} />
      {ok && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: bg,
            animation: 'pulse-ring 2s ease-out infinite',
            opacity: 0.5,
          }}
        />
      )}
    </span>
  );
}
