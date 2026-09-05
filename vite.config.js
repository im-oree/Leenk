import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    // Browser-facing code uses relative /api and the dev server proxies it,
    // so the preview never tries to reach localhost from the user's browser.
    proxy: {
      '/api': { target: 'http://127.0.0.1:5100', changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
})
