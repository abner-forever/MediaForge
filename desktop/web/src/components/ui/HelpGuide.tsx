import { useState } from 'react';
import type { ReactNode } from 'react';
import Modal from './Modal';

interface HelpGuideProps {
  title: string;
  children: ReactNode;
}

export default function HelpGuide({ title, children }: HelpGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="使用说明"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.2s',
          color: 'var(--text-muted)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.color = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} className="max-w-lg w-full">
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {title}
            </h2>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {children}
          </div>
        </div>
      </Modal>
    </>
  );
}
