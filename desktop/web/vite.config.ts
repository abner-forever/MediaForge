import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pyproject = readFileSync(resolve(__dirname, '../../pyproject.toml'), 'utf-8');
const version = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || '0.0.0';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../static', import.meta.url)),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/react-router')) {
            return 'vendor-router';
          }
          if (id.includes('/node_modules/zustand/')) {
            return 'vendor-state';
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
    },
  },
})
