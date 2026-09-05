/**
 * Layout invariants.
 *
 * A shipped bug: page headers scrolled away and the chat composer got pushed
 * below the fold, because Page used `min-h-[100dvh]` (grows with content, so
 * the document scrolls) and inner scroll regions lacked `min-h-0` (a flex
 * child won't shrink below its content, so `overflow-y-auto` never engages).
 *
 * These are static source checks — cheap, and they catch the exact mistakes.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const check = (label, cond, detail = '') => {
  if (!cond) fail++
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : `  ${detail}`}`)
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.jsx') ? [join(dir, e.name)] : [])

const files = [...walk('src/screens'), ...walk('src/components')]

// 1. The Page shell must be exactly one viewport tall and must not scroll.
const page = readFileSync('src/components/layout/Page.jsx', 'utf8')
check('Page is h-[100dvh], not min-h', page.includes('h-[100dvh]') && !page.includes('min-h-[100dvh]'))
check('Page root clips overflow', /h-\[100dvh\][^`]*overflow-hidden/.test(page))
check('Page scroll container has min-h-0', page.includes("'flex-1 min-h-0 flex flex-col'"))
check('Page exposes header slot outside the scroll area', /\{header\}[\s\S]*<div/.test(page))
check('Page exposes footer slot outside the scroll area', /<\/div>\s*\n\s*\{footer\}/.test(page))

// 2. Every `flex-1 overflow-y-auto` needs min-h-0 or it silently won't scroll.
const missing = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/className="([^"]*flex-1[^"]*overflow-y-auto[^"]*)"/g)) {
    if (!m[1].includes('min-h-0')) missing.push(`${f}: ${m[1].slice(0, 60)}`)
  }
}
check(`all flex-1 scroll regions have min-h-0`, missing.length === 0, missing.join(' | '))

// 3. A Header must not sit inside a scrolling container: in a screen that uses
//    the header slot, <Header should appear in `header={`, not loose in body.
const looseHeaders = []
for (const f of walk('src/screens')) {
  const src = readFileSync(f, 'utf8')
  if (!src.includes('<Header')) continue
  // Every <Header occurrence should be preceded by `header={` within a few lines.
  const lines = src.split('\n')
  lines.forEach((l, i) => {
    if (!l.trim().startsWith('<Header')) return
    const before = lines.slice(Math.max(0, i - 3), i).join('\n')
    // UserProfile's header is an intentional absolute overlay on the photo.
    if (l.includes('!absolute')) return
    if (!before.includes('header={')) looseHeaders.push(`${f}:${i + 1}`)
  })
}
check('no Header rendered inside a scroll container', looseHeaders.length === 0, looseHeaders.join(' '))

console.log(fail ? `\n${fail} layout check(s) failed` : '\nAll layout checks passed')
process.exit(fail ? 1 : 0)
