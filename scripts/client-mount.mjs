/**
 * Client-side mount harness.
 *
 * SSR (verify-render) catches import and top-level errors, but it never runs
 * effects or hook state transitions — the class of bug that produces
 * "Cannot read properties of null" and hook-order crashes in a real browser.
 * This mounts the real app through the real provider tree from main.jsx.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:5173/app/feed', pretendToBeVisual: true })

globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement','Element','Node','SVGElement','HTMLCanvasElement','Image',
  'MutationObserver','DOMRect','CustomEvent','Event','KeyboardEvent','MouseEvent',
  'PointerEvent','TouchEvent','performance','location','history','screen',
  'devicePixelRatio','getComputedStyle','CSS','Blob','FileReader','File','URL'])
  if (dom.window[k] !== undefined && globalThis[k] === undefined)
    Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true })

globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
globalThis.cancelAnimationFrame = clearTimeout
dom.window.matchMedia = globalThis.matchMedia =
  () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} })
dom.window.ResizeObserver = globalThis.ResizeObserver =
  class { observe(){} unobserve(){} disconnect(){} }
dom.window.IntersectionObserver = globalThis.IntersectionObserver =
  class { observe(){} unobserve(){} disconnect(){} }

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { ThemeProvider } = await import('../src/lib/ThemeContext.jsx')
const { PerfProvider } = await import('../src/lib/PerfContext.jsx')
const { StoreProvider } = await import('../src/lib/store.jsx')
const App = (await import('../src/App.jsx')).default
const h = React.createElement

const errors = []
const origError = console.error
console.error = (...a) => {
  const s = a.map(String).join(' ')
  if (!/not wrapped in act|useLayoutEffect does nothing on the server/i.test(s)) errors.push(s)
}

let html = ''
let threw = null
try {
  createRoot(document.getElementById('root')).render(
    h(React.StrictMode, null,
      h(ThemeProvider, null, h(PerfProvider, null, h(StoreProvider, null,
        h(BrowserRouter, null, h(App)))))))
  await new Promise((r) => setTimeout(r, 4000))
  html = document.getElementById('root').innerHTML
} catch (e) { threw = e }
console.error = origError

let fail = 0
const ck = (label, cond) => { if (!cond) fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`) }

ck('app mounts without throwing', !threw)
if (threw) console.log('    ' + threw.stack?.split('\n').slice(0, 6).join('\n    '))
ck('renders real DOM', html.length > 500)
ck('no React errors during mount', errors.length === 0)
if (errors.length) errors.slice(0, 3).forEach((e) => console.log('    ' + e.slice(0, 400)))

console.log(fail ? `\n${fail} client-mount check(s) failed` : '\nClient mount clean')
process.exit(fail ? 1 : 0)
