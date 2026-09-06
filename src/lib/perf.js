/**
 * Device capability detection.
 * Degrades effects on low-end phones without changing layout, so nothing
 * ever "looks broken" — it just gets cheaper to render.
 *
 * tier: 'high' | 'mid' | 'low'
 */

let cached = null

export function detectTier() {
  if (cached) return cached
  if (typeof window === 'undefined') return (cached = 'high')

  const nav = navigator
  const mem = nav.deviceMemory || 4
  const cores = nav.hardwareConcurrency || 4
  const conn = nav.connection || {}
  const saveData = !!conn.saveData
  const slowNet = ['slow-2g', '2g', '3g'].includes(conn.effectiveType)
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let score = 0
  if (mem <= 2) score += 3
  else if (mem <= 4) score += 1
  if (cores <= 4) score += 2
  else if (cores <= 6) score += 1
  if (saveData) score += 3
  if (slowNet) score += 2
  if (reduced) score += 4

  cached = score >= 5 ? 'low' : score >= 2 ? 'mid' : 'high'
  return cached
}

/** Live FPS sampling — demotes tier if the device can't keep up. */
export function watchFrameRate(onDemote) {
  if (typeof window === 'undefined') return () => {}
  let frames = 0
  let start = performance.now()
  let raf
  let samples = 0
  const loop = (t) => {
    frames++
    if (t - start >= 1000) {
      const fps = frames
      frames = 0
      start = t
      samples++
      if (fps < 38 && samples <= 6) onDemote?.(fps)
      if (samples > 6) return
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}

export const tierFlags = (tier) => ({
  blur: tier === 'high',
  shadows: tier !== 'low',
  parallax: tier === 'high',
  springy: tier !== 'low',
  stagger: tier !== 'low',
  noise: tier === 'high',
})
