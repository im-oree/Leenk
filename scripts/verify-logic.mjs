/**
 * Pure-logic assertions against the data layer's mock branch.
 *
 * Exists because a shipped bug — every swipe direction reporting a match —
 * was invisible to the render harness: it only shows up when you actually
 * call swipe() many times and look at the distribution.
 */
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let fail = 0
const check = (label, cond) => {
  if (!cond) fail++
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`)
}

const { discovery } = await server.ssrLoadModule('/src/lib/data.js')

// A pass must NEVER produce a match, no matter how many times we roll.
const N = 400
let leftMatches = 0
for (let i = 0; i < N; i++) {
  const r = await discovery.swipe('u1', 'left', {})
  if (r.matched) leftMatches++
}
check(`left swipe never matches (${leftMatches}/${N} matched)`, leftMatches === 0)

// Super like always matches (mock contract).
let superMatches = 0
for (let i = 0; i < 50; i++) {
  const r = await discovery.swipe('u1', 'super', {})
  if (r.matched) superMatches++
}
check(`super like always matches (${superMatches}/50)`, superMatches === 50)

// Right swipe matches sometimes, but not always and not never.
let rightMatches = 0
for (let i = 0; i < N; i++) {
  const r = await discovery.swipe('u1', 'right', {})
  if (r.matched) rightMatches++
}
check(`right swipe matches sometimes (${rightMatches}/${N})`, rightMatches > 0 && rightMatches < N)

await server.close()
console.log(fail ? `\n${fail} logic check(s) failed` : '\nAll logic checks passed')
process.exit(fail ? 1 : 0)
