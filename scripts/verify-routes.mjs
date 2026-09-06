/**
 * Route crash guard.
 *
 * Renders every app route, including with parameters that do not resolve to
 * anything. That is the bug class that kept reaching the user:
 *
 *   const story = rail.find(...) || null
 *   ...
 *   <img src={story.photos[1]} />     // TypeError, whole screen dies
 *
 * A screen reached by a stale link, a deleted post, an expired story or a
 * blocked user MUST render a real state, not throw into the ErrorBoundary.
 * Every route here is rendered twice where it takes a param: once with a
 * plausible id, once with an id that matches nothing.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:5173/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'SVGElement', 'Image', 'performance',
  'location', 'CSS', 'getComputedStyle', 'Blob', 'File', 'FileReader', 'URL'])
  if (dom.window[k] !== undefined && globalThis[k] === undefined)
    Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.sessionStorage = dom.window.sessionStorage
// jsdom does not implement scrollIntoView; without this stub Chat fails for a
// reason that has nothing to do with the app.
dom.window.HTMLElement.prototype.scrollIntoView = function () {}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
globalThis.cancelAnimationFrame = clearTimeout
dom.window.matchMedia = globalThis.matchMedia =
  () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
dom.window.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
dom.window.IntersectionObserver = globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const { ThemeProvider } = await import('../src/lib/ThemeContext.jsx')
const { PerfProvider } = await import('../src/lib/PerfContext.jsx')
const { StoreProvider } = await import('../src/lib/store.jsx')
const h = React.createElement

const S = await import('../src/screens/app/misc.jsx')
const Discover = (await import('../src/screens/app/Discover.jsx')).default
const Feed = (await import('../src/screens/app/Feed.jsx')).default
const Explore = (await import('../src/screens/app/Explore.jsx')).default
const Matches = (await import('../src/screens/app/Matches.jsx')).default
const Profile = (await import('../src/screens/app/Profile.jsx')).default
const Chat = (await import('../src/screens/app/Chat.jsx')).default
const UserProfile = (await import('../src/screens/app/UserProfile.jsx')).default
const Composer = (await import('../src/screens/app/Composer.jsx')).default
const CampusMap = (await import('../src/screens/app/CampusMap.jsx')).default
const Login = (await import('../src/screens/onboarding/Login.jsx')).default

// [component, routePattern, [pathsToTry]]
// Each param route gets a real-looking id AND one that resolves to nothing.
const ROUTES = [
  [Feed, '/app/feed', ['/app/feed']],
  [Discover, '/app/discover', ['/app/discover']],
  [Explore, '/app/explore', ['/app/explore']],
  [Matches, '/app/matches', ['/app/matches']],
  [Profile, '/app/profile', ['/app/profile']],
  [Composer, '/app/compose', ['/app/compose']],
  [CampusMap, '/app/map', ['/app/map']],
  [Login, '/login', ['/login']],
  [Chat, '/app/chat/:matchId', ['/app/chat/m1', '/app/chat/does-not-exist']],
  [UserProfile, '/app/user/:userId', ['/app/user/u1', '/app/user/does-not-exist']],
  [S.PostDetail, '/app/post/:postId', ['/app/post/p1', '/app/post/does-not-exist']],
  [S.StoryViewer, '/app/story/:storyId', ['/app/story/u1', '/app/story/does-not-exist']],
  [S.CampusPage, '/app/campus/:campusId', ['/app/campus/babcock', '/app/campus/nowhere']],
  [S.Notifications, '/app/notifications', ['/app/notifications']],
  [S.Likes, '/app/likes', ['/app/likes']],
  [S.TrustCenter, '/app/trust', ['/app/trust']],
  [S.SafetyCenter, '/app/safety', ['/app/safety']],
  [S.ReportFlow, '/app/report', ['/app/report']],
  [S.Premium, '/app/premium', ['/app/premium']],
  [S.EditProfile, '/app/edit-profile', ['/app/edit-profile']],
  [S.SharePage, '/app/share', ['/app/share']],
]

let fail = 0
const origError = console.error
console.error = () => {}

for (const [Comp, pattern, paths] of ROUTES) {
  if (!Comp) { console.log(`  SKIP ${pattern} (not exported)`); continue }
  for (const path of paths) {
    let out = ''
    // Client render, not SSR: these screens use portals (Sheet, Toast) which
    // the server renderer refuses outright, and only a client render runs the
    // effects where this bug class actually lives.
    const host = document.createElement('div')
    document.body.appendChild(host)
    let thrown = null
    try {
      const root = createRoot(host, { onUncaughtError: (e) => { thrown = e } })
      await act(async () => {
        root.render(
          h(MemoryRouter, { initialEntries: [path] },
            h(ThemeProvider, null, h(PerfProvider, null, h(StoreProvider, null,
              h(Routes, null, h(Route, { path: pattern, element: h(Comp) })))))))
      })
      // Mock latency runs to ~450ms; wait past it so screens are checked in their
      // RESOLVED state, not their loading state (where the bug cannot appear).
      await act(async () => { await new Promise((r) => setTimeout(r, 700)) })
      out = host.innerHTML
      root.unmount()
      host.remove()
      if (thrown) throw thrown
    } catch (e) {
      fail++
      console.error = origError
      console.log(`  FAIL ${path}`)
      console.log(`       ${e.message}`)
      console.error = () => {}
      continue
    }
    if (out.length < 40) { fail++; console.log(`  FAIL ${path} rendered almost nothing`) }
    else console.log(`  ok   ${path}`)
  }
}
console.error = origError

console.log(fail ? `\n${fail} route(s) crash or render empty` : '\nEvery route renders, including with unresolvable ids')
process.exit(fail ? 1 : 0)
