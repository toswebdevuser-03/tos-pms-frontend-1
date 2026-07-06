import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
    outDir: resolve('dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  }
})
