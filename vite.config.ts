import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000'

// Standalone web build (Vercel). The Electron build still uses
// electron.vite.config.ts; this config builds the renderer as a plain SPA.
export default defineConfig({
  root: resolve('src/renderer'),
  base: '/',
  plugins: [react()],
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src') }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  },
  server: {
    proxy: {
      '/auth': {
        target: apiProxyTarget,
        changeOrigin: true
      },
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      },
      '/ws': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
