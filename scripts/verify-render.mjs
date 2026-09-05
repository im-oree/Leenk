// Real render pass: mount screens with renderToString to catch hook misuse,
// bad destructuring and undefined-access that a compile check can't see.
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })

// jsdom-ish shims so browser-only code paths don't explode during SSR
globalThis.window = globalThis.window || { addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}) }
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} }
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine:true, userAgent:'node', connection:null }, configurable:true, writable:true }) } catch {}

const React = (await import('react')).default
const { renderToString } = await import('react-dom/server')
const { MemoryRouter } = await import('react-router-dom')
const { StoreProvider } = await server.ssrLoadModule('/src/lib/store.jsx')
const { NetworkProvider } = await server.ssrLoadModule('/src/lib/network.jsx')
const { ThemeProvider } = await server.ssrLoadModule('/src/lib/ThemeContext.jsx')
const { PerfProvider } = await server.ssrLoadModule('/src/lib/PerfContext.jsx')
const { NavProvider } = await server.ssrLoadModule('/src/components/layout/NavContext.jsx')
const { NavDirectionProvider } = await server.ssrLoadModule('/src/components/layout/NavDirection.jsx')

const screens = [
  ['Composer', '/src/screens/app/Composer.jsx', '/app/compose'],
  ['Feed',     '/src/screens/app/Feed.jsx',     '/app/feed'],
  ['Discover', '/src/screens/app/Discover.jsx', '/app/discover'],
  ['Matches',  '/src/screens/app/Matches.jsx',  '/app/matches'],
  ['Profile',  '/src/screens/app/Profile.jsx',  '/app/profile'],
]

let fail = 0
for (const [name, path, route] of screens) {
  try {
    const Comp = (await server.ssrLoadModule(path)).default
    const tree = React.createElement(MemoryRouter, { initialEntries:[route] },
      React.createElement(ThemeProvider, null,
        React.createElement(PerfProvider, null,
          React.createElement(NetworkProvider, null,
            React.createElement(StoreProvider, null,
              React.createElement(NavDirectionProvider, null,
                React.createElement(NavProvider, null, React.createElement(Comp))))))))
    const html = renderToString(tree)
    const checks = {
      Feed: [['story ring (brand)', /brand-fill/], ['rail avatars', /rounded-full/], ['segmented', /For you/]],
      Composer: [['source buttons', /Camera/], ['gallery', /Gallery/], ['video', /Video/], ['mode toggle', /post/i]],
      Discover: [['swipe card', /rounded-\[30px\]/], ['controls', /aria-label/]],
      Matches: [['ring markup', /rounded-full/]],
      Profile: [['own ring', /rounded-full/]],
    }[name] || []
    const results = checks.map(([lbl, re]) => `${re.test(html) ? '✓' : '✗'} ${lbl}`).join('  ')
    console.log(`  ok   ${name.padEnd(9)} ${String(html.length).padStart(6)} chars   ${results}`)
  } catch (e) {
    fail++
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`)
  }
}
await server.close()
console.log(fail ? `\n${fail} screen(s) failed to render` : '\nAll screens rendered')
process.exit(fail?1:0)
