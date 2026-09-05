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
  ['Explore',  '/src/screens/app/Explore.jsx',  '/app/explore'],
]

/**
 * StoryRing renders its own ring: `p-[2.5px] brand-fill` > app-bg gap > <img>.
 * If a caller wraps it in ANOTHER ring you get two ring spans with no <img>
 * between them — a visible double ring (shipped bug in Matches). Counting
 * nested rings structurally beats a regex, because arbitrary elements
 * (buttons, spans) can sit between the two wrappers.
 */
function noDoubleRing(html) {
  const RING = /p-\[2\.5px\] brand-fill/g   // ring only; excludes badge pills
  const rings = [...html.matchAll(RING)].map((m) => m.index)
  return rings.every((at, i) => {
    const next = rings[i + 1]
    if (next === undefined) return true
    // Legit sibling rings always have the first ring's <img> between them.
    return html.slice(at, next).includes('<img')
  })
}

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
    let checks = {
      Feed: [['story ring (brand)', /brand-fill/], ['rail avatars', /rounded-full/], ['segmented', /For you/]],
      Composer: [['source buttons', /Camera/], ['gallery', /Gallery/], ['video', /Video/], ['mode toggle', /post/i]],
      Discover: [['swipe card', /rounded-\[30px\]/], ['controls', /aria-label/]],
      // Regression guard: StoryRing draws its own ring. If a caller wraps it in
      // another brand-fill span you get a visible double ring (shipped bug).
      // A correct ring is exactly: brand-fill > app-bg gap > <img>. Two
      // brand-fill ancestors before an img means someone re-wrapped it.
      Matches: [['ring markup', /rounded-full/]],
      Profile: [['own ring', /rounded-full/]],
      Explore: [
        ['search field', /placeholder="Search people/],
        ['scope chips', /My campus/],
        // Explore must render from the data layer, not crash on empty state.
        ['grid or skeleton', /aspect-square/],
      ],
    }[name] || []
    // A check is a regex (must match) or a predicate (must return true).
    // Previously a '✗' only printed — it never failed the run. It does now.
    let bad = 0
    // Double rings can appear on any screen that uses StoryRing.
    checks = [...checks, ['no double ring', noDoubleRing]]
    const results = checks.map(([lbl, check]) => {
      const pass = typeof check === 'function' ? check(html) : check.test(html)
      if (!pass) bad++
      return `${pass ? '✓' : '✗'} ${lbl}`
    }).join('  ')
    if (bad) fail++
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name.padEnd(9)} ${String(html.length).padStart(6)} chars   ${results}`)
  } catch (e) {
    fail++
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n')[0]}`)
  }
}
await server.close()
console.log(fail ? `\n${fail} screen(s) failed to render` : '\nAll screens rendered')
process.exit(fail?1:0)
