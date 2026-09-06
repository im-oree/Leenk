import { useEffect, useState } from 'react'

/**
 * Layout breakpoints.
 *
 * Mobile-first: `compact` is the design target and everything else is an
 * enhancement. We deliberately switch the whole navigation model at `medium`
 * (a bottom pill on a 1024px iPad looks like a stretched phone app), and add a
 * second column only at `expanded`.
 *
 *   compact   < 768   phone            → bottom nav, single column
 *   medium    768+    tablet portrait  → left rail, single centred column
 *   expanded  1180+   tablet landscape → left rail + sidebar
 *
 * Also reports coarse vs fine pointer, so touch targets can grow on a
 * touchscreen laptop without keying off width alone.
 */

export const BREAKPOINTS = { medium: 768, expanded: 1180 }

const read = () => {
  if (typeof window === 'undefined') {
    return { width: 390, size: 'compact', isCompact: true, isMedium: false, isExpanded: false, touch: true, landscape: false }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  const size = width >= BREAKPOINTS.expanded ? 'expanded' : width >= BREAKPOINTS.medium ? 'medium' : 'compact'
  return {
    width,
    height,
    size,
    isCompact: size === 'compact',
    isMedium: size === 'medium',
    isExpanded: size === 'expanded',
    // `pointer: coarse` is the honest test for "finger", not screen width.
    touch: window.matchMedia?.('(pointer: coarse)').matches ?? true,
    landscape: width > height,
  }
}

export function useBreakpoint() {
  const [state, setState] = useState(read)

  useEffect(() => {
    let frame = null
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setState(read()))
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return state
}

export default useBreakpoint
