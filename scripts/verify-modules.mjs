// Headless render check without a browser: import every screen module through
// vite's SSR transform and confirm it evaluates + exports a component.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const targets = [
  '/src/lib/data.js', '/src/lib/useAsync.js', '/src/lib/ffmpeg.js', '/src/lib/gallery.js',
  '/src/lib/network.jsx', '/src/lib/store.jsx',
  '/src/components/feed/StoryRing.jsx', '/src/components/feed/StoryRail.jsx',
  '/src/components/composer/CaptionOverlay.jsx', '/src/components/composer/VideoEditor.jsx',
  '/src/components/ui/SmartImage.jsx', '/src/components/ui/Tooltip.jsx',
  '/src/components/ui/ErrorBoundary.jsx', '/src/components/ui/OfflineBanner.jsx',
  '/src/screens/app/Composer.jsx', '/src/screens/app/Feed.jsx',
  '/src/screens/app/Discover.jsx', '/src/screens/app/Chat.jsx',
  '/src/screens/app/Matches.jsx', '/src/screens/app/Profile.jsx',
  '/src/screens/app/Explore.jsx',
  '/src/components/media/GifPicker.jsx', '/src/components/media/SoundPicker.jsx',
  '/src/components/layout/SideRail.jsx', '/src/lib/breakpoint.js',
  '/src/App.jsx',
]
let fail = 0
for (const t of targets) {
  try {
    const mod = await server.ssrLoadModule(t)
    const keys = Object.keys(mod)
    console.log(`  ok   ${t}  →  ${keys.slice(0,3).join(', ')}`)
  } catch (e) {
    fail++
    console.log(`  FAIL ${t}\n       ${String(e.message).split('\n')[0]}`)
  }
}
await server.close()
console.log(fail ? `\n${fail} module(s) failed` : '\nAll modules evaluated cleanly')
process.exit(fail ? 1 : 0)
