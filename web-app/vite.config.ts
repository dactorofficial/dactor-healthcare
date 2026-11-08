import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    emptyOutDir: false,
  },
  cacheDir: path.join(os.tmpdir(), 'dactor-vite-cache'),
  server: {
    port: 3000,
    host: true,
    fs: {
      strict: true,
      allow: ['.']
    },
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.vite/**']
    }
  }
})
