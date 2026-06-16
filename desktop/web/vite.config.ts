import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const pyproject = readFileSync(resolve(__dirname, '../../pyproject.toml'), 'utf-8');
const version = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || '0.0.0';
const buildTime = new Date().toISOString();

// 仅当 SENTRY_AUTH_TOKEN 存在时启用 Sentry source map 上传
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_TIME__: JSON.stringify(buildTime) },
  plugins: [
    react(),
    sentryAuthToken
      ? sentryVitePlugin({
          org: 'abnerming',
          project: 'mediaforge',
          authToken: sentryAuthToken,
          telemetry: false,
          sourcemaps: {
            assets: 'static/**',
          },
        })
      : undefined,
  ].filter(Boolean) as any,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../static', import.meta.url)),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true,
    minify: 'esbuild',
    rolldownOptions: {
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames(chunkInfo) {
          const name = chunkInfo.name;
          if (name.startsWith('vendor-') || name.startsWith('cm-')) {
            return 'vendor/[name]-[hash].js';
          }
          return 'js/[name]-[hash].js';
        },
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('/node_modules/react-router')) return 'vendor-router';
            if (id.includes('/node_modules/zustand/')) return 'vendor-state';
            if (id.includes('/node_modules/marked/')) return 'vendor-marked';
            if (id.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf';
            if (id.includes('/node_modules/highlight.js/')) return 'vendor-highlight';
            const cmMatch = id.match(/\/node_modules\/@codemirror\/([^/]+)/);
            if (cmMatch) return `cm-${cmMatch[1]}`;
            if (id.includes('/node_modules/@tiptap/') || id.includes('/node_modules/prosemirror-')) return 'vendor-editor';
            return 'vendor-misc';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8765',
      '/images': 'http://127.0.0.1:8765',
      '/proxy': 'http://127.0.0.1:8765',
      '/static': 'http://127.0.0.1:8765',
    },
  },
})
