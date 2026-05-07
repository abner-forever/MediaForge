import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../static_dist', import.meta.url)),
    emptyOutDir: true,
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
