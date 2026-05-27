import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      borderRadius: {
        xl: '16px',
        lg: '12px',
        '2xl': '20px',
      },
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          softer: 'var(--accent-softer)',
          glow: 'var(--accent-glow)',
          gradient: 'var(--accent-gradient)',
        },
        bg: {
          DEFAULT: 'var(--bg)',
          card: 'var(--bg-card)',
          secondary: 'var(--bg-secondary)',
          sidebar: 'var(--bg-sidebar)',
          elevated: 'var(--bg-elevated)',
          inset: 'var(--bg-inset)',
        },
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },
        border: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
        },
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'card': 'var(--card-shadow)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
