import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Config for the client-mount verify harness ONLY.
 *
 * It uses a separate cacheDir so running `npm run verify` cannot re-optimize
 * deps underneath a live `npm run dev` server. Sharing node_modules/.vite
 * between the two rotates the browserHash mid-session and breaks the open tab
 * with a null React namespace.
 */
export default defineConfig({
  plugins: [react()],
  cacheDir: 'node_modules/.vite-verify',
})
