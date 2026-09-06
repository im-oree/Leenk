/**
 * SmartImage regression guard.
 *
 * Two bugs pinned images on their placeholder gradient forever, with no error:
 *
 *  1. `mounted` was cleared by a cleanup-only effect. React StrictMode runs
 *     mount -> unmount -> remount in dev, so the ref stuck at false after the
 *     first teardown and every later setState bailed.
 *  2. load/error handlers were attached only inside decode()'s catch. For a
 *     cached image, `load` had already fired by then and never fired again.
 *
 * Both fail silently and look like "the images are broken", so they are worth
 * a standing test. The fake Image below mimics a real browser: async load and
 * a decode() that rejects (the SVG/CORS case).
 */
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost:5173/', pretendToBeVisual: true })
globalThis.window = dom.window; globalThis.document = dom.window.document
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
for (const k of ['HTMLElement','Element','Node','SVGElement','performance','location','CSS','getComputedStyle'])
  if (dom.window[k]!==undefined && globalThis[k]===undefined)
    Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true})
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16)
globalThis.cancelAnimationFrame=clearTimeout

// Fake Image that behaves like a REAL browser: fires load asynchronously,
// and exposes decode() that rejects (the SVG/CORS case that broke us).
let created = 0
globalThis.Image = dom.window.Image = class {
  constructor(){ created++; this._src=''; this.complete=false; this.naturalWidth=0
    this.onload=null; this.onerror=null; this.decoding='' }
  set src(v){ this._src=v
    setTimeout(()=>{ this.complete=true; this.naturalWidth=800; this.onload && this.onload() }, 20) }
  get src(){ return this._src }
  decode(){ return Promise.reject(new Error('decode unsupported for svg')) }
}

const React=(await import('react')).default
const {createRoot}=await import('react-dom/client')
const SmartImage=(await import('/home/user/Leenk/src/components/ui/SmartImage.jsx')).default
const h=React.createElement
console.error=()=>{}

createRoot(document.getElementById('root')).render(
  h(React.StrictMode,null,
    h(SmartImage,{src:'https://picsum.photos/seed/x/800/800',alt:'test',className:'w-full h-full'})))

await new Promise(r=>setTimeout(r,900))
const html = document.getElementById('root').innerHTML
const imgs = [...document.querySelectorAll('img')]
const real = imgs.find(i=>i.getAttribute('src')?.includes('picsum'))

let fail=0
const ck=(l,c)=>{ if(!c) fail++; console.log(`  ${c?'ok  ':'FAIL'} ${l}`) }
ck('real <img> is rendered', !!real)
ck('image is OPAQUE (state=ready, not stuck loading)', real && !/opacity:\s*0(;|$)/.test(real.getAttribute('style')||''))
ck('gradient placeholder removed', !/linear-gradient/.test(html))
ck('no error state', !/Couldn/.test(html))
console.log(fail ? `\n${fail} image check(s) failed` : '\nImages render')
process.exit(fail ? 1 : 0)
