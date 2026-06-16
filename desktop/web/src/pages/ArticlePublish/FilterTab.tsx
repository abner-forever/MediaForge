export default function FilterTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        lineHeight: 1.4,
        letterSpacing: '0.02em',
        borderRadius: 9999,
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        padding: '3px 10px',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {children}
    </button>
  );
}
