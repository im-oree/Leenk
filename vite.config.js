import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // maplibre-gl is only reached via a dynamic import() in CampusMap, so Vite
    // would not discover it at startup -- it would re-optimize the moment a
    // user first opens the map, issue a new browserHash, and invalidate every
    // module the open tab is already running. That surfaces as
    // "Cannot read properties of null (reading 'useState')".
    // Pre-bundling it here means the hash is stable for the whole session.
    include: ['maplibre-gl'],
  },
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
