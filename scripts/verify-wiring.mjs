/**
 * Wiring audit.
 *
 * Guards the promise that flipping VITE_USE_API=true switches the whole app
 * onto the backend. Two failure modes it catches:
 *
 *  1. A screen importing LIVE fixtures (CANDIDATES, POSTS, MATCHES...) from
 *     lib/mock instead of going through lib/data. Those render mock people
 *     forever, in both modes.
 *  2. A lib/data namespace missing its `if (!USE_API)` branch, which means it
 *     either never calls the API or never works offline.
 *
 * Reference data (campusById, INTENTS, DEPARTMENTS...) is allowed: those are
 * static labels, not user content.
 */
import fs from 'fs'
import path from 'path'

const LIVE_FIXTURES = ['CANDIDATES', 'POSTS', 'MATCHES', 'THREADS', 'NOTIFICATIONS', 'ME', 'STORIES']
const REFERENCE_OK = ['campusById', 'intentLabel', 'CAMPUSES', 'DEPARTMENTS', 'LEVELS', 'INTENTS', 'PROMPTS', 'MOCK_SH_POSTS', 'MOCK_GIFS', 'MOCK_SOUNDS', 'MOCK_MAP']

let failures = 0
const warn = []

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.jsx?$/.test(f)) out.push(p)
  }
  return out
}

console.log('=== screens/components importing LIVE fixtures ===')
const files = [...walk('src/screens'), ...walk('src/components')]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*'[^']*lib\/mock'/)
  if (!m) continue
  const names = m[1].split(',').map((x) => x.trim()).filter(Boolean)
  const live = names.filter((n) => LIVE_FIXTURES.includes(n))
  const unknown = names.filter((n) => !LIVE_FIXTURES.includes(n) && !REFERENCE_OK.includes(n))
  if (live.length) {
    console.log(`  FAIL ${f.replace('src/', '')}  ->  ${live.join(', ')}`)
    failures++
  }
  if (unknown.length) warn.push(`${f.replace('src/', '')}: ${unknown.join(', ')}`)
}
if (!failures) console.log('  ok   no screen renders live fixtures directly')

console.log('\n=== lib/data namespaces honour USE_API ===')
const data = fs.readFileSync('src/lib/data.js', 'utf8')
// Split on top-level namespace declarations.
const parts = data.split(/\nexport const (\w+) = \{/).slice(1)
for (let i = 0; i < parts.length; i += 2) {
  const name = parts[i]
  const body = parts[i + 1]
  if (name === 'reference') continue          // static tables, no API call
  const methods = [...body.matchAll(/\n  (?:async )?(\w+)\s*\(/g)].map((x) => x[1])
  const gated = (body.match(/!USE_API/g) || []).length
  if (methods.length && gated === 0) {
    console.log(`  FAIL ${name}: ${methods.length} method(s), no USE_API branch`)
    failures++
  } else {
    console.log(`  ok   ${name.padEnd(12)} ${methods.length} method(s), ${gated} mock branch(es)`)
  }
}

console.log('\n=== store hydrates from the API ===')
const store = fs.readFileSync('src/lib/store.jsx', 'utf8')
const checks = [
  ['imports USE_API', /USE_API/.test(store)],
  ['has a hydrate action', /case 'hydrate'/.test(store)],
  ['dispatches hydrate on mount', /dispatch\(\{\s*type:\s*'hydrate'/.test(store)],
  ['tolerates partial failure', /allSettled/.test(store)],
]
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

if (warn.length) {
  console.log('\n=== reference-data imports (allowed) ===')
  warn.forEach((w) => console.log(`  note ${w}`))
}

console.log(failures ? `\n${failures} wiring problem(s)` : '\nWiring clean')
process.exit(failures ? 1 : 0)
