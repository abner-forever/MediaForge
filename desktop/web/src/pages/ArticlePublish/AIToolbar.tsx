import Loading from '../../components/Loading';

export default function AIToolbar({
  onGenerate,
  onPolish,
  onDeAi,
  onGenerateTitle,
  onOptimizeLayout,
  genLoading,
  polishLoading,
  deAiLoading,
  titleLoading,
  layoutLoading,
  content,
}: {
  onGenerate: () => void;
  onPolish: () => void;
  onDeAi: () => void;
  onGenerateTitle: () => void;
  onOptimizeLayout: () => void;
  genLoading: boolean;
  polishLoading: boolean;
  deAiLoading: boolean;
  titleLoading: boolean;
  layoutLoading: boolean;
  content: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '6px 0',
        marginBottom: 0,
      }}
    >
      <button
        onClick={onGenerate}
        disabled={genLoading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          border: '1px solid var(--accent-soft)',
          borderRadius: 6,
          background: 'var(--accent-softer)',
          color: 'var(--accent)',
          cursor: genLoading ? 'not-allowed' : 'pointer',
          opacity: genLoading ? 0.5 : 1,
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!genLoading) {
            e.currentTarget.style.background = 'var(--accent-soft)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }
        }}
        onMouseLeave={(e) => {
          if (!genLoading) {
            e.currentTarget.style.background = 'var(--accent-softer)';
            e.currentTarget.style.borderColor = 'var(--accent-soft)';
          }
        }}
      >
        {genLoading ? (
          <Loading size="xs" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
          </svg>
        )}
        生成正文
      </button>
      <button
        onClick={onPolish}
        disabled={polishLoading || !content}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: polishLoading || !content ? 'not-allowed' : 'pointer',
          opacity: polishLoading || !content ? 0.4 : 1,
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!polishLoading && content) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.background = 'var(--accent-softer)';
          }
        }}
        onMouseLeave={(e) => {
          if (!polishLoading && content) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {polishLoading ? (
          <Loading size="xs" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )}
        AI 校对
      </button>
      <button
        onClick={onDeAi}
        disabled={deAiLoading || !content}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: deAiLoading || !content ? 'not-allowed' : 'pointer',
          opacity: deAiLoading || !content ? 0.4 : 1,
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!deAiLoading && content) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.background = 'var(--accent-softer)';
          }
        }}
        onMouseLeave={(e) => {
          if (!deAiLoading && content) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {deAiLoading ? (
          <Loading size="xs" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 2a10 10 0 1 0 10 10" />
            <path d="M2 12a10 10 0 0 1 10-10" />
            <path d="M12 12 8 8" />
            <path d="M16 16 9 9" />
          </svg>
        )}
        去 AI 味儿
      </button>
      <button
        onClick={onGenerateTitle}
        disabled={titleLoading || !content}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: titleLoading || !content ? 'not-allowed' : 'pointer',
          opacity: titleLoading || !content ? 0.4 : 1,
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!titleLoading && content) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.background = 'var(--accent-softer)';
          }
        }}
        onMouseLeave={(e) => {
          if (!titleLoading && content) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {titleLoading ? (
          <Loading size="xs" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7V4h16v3" />
            <path d="M9 20h6" />
            <path d="M12 4v16" />
          </svg>
        )}
        生成标题
      </button>
      <div
        style={{
          width: 1,
          height: 20,
          background: 'var(--border-subtle)',
          margin: '0 4px',
          alignSelf: 'center',
        }}
      />
      <button
        onClick={onOptimizeLayout}
        disabled={layoutLoading || !content}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.3,
          border: '1px solid var(--accent)',
          borderRadius: 6,
          background: 'var(--accent-softer)',
          color: 'var(--accent)',
          cursor: layoutLoading || !content ? 'not-allowed' : 'pointer',
          opacity: layoutLoading || !content ? 0.5 : 1,
          transition: 'all 0.15s',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!layoutLoading && content) {
            e.currentTarget.style.background = 'var(--accent-soft)';
          }
        }}
        onMouseLeave={(e) => {
          if (!layoutLoading && content) {
            e.currentTarget.style.background = 'var(--accent-softer)';
          }
        }}
      >
        {layoutLoading ? (
          <Loading size="xs" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3h18v4H3z" />
            <path d="M3 10h18v4H3z" />
            <path d="M3 17h12v4H3z" />
          </svg>
        )}
        优化排版
      </button>
    </div>
  );
}
