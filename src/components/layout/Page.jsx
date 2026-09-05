import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNav } from './NavContext'
import { useNavDirection } from './NavDirection'
import { pageVariants } from '../../lib/motion'
import { usePerf } from '../../lib/PerfContext'

/**
 * Page shell.
 *
 * Layout contract: the shell is exactly one viewport tall and does NOT scroll.
 * `header` and `footer` are pinned outside the scroll container; only
 * `children` scrolls. This is what keeps a page header on screen and stops a
 * chat composer from being pushed below the fold by a long thread.
 *
 *  - `header`      : pinned at the top, never scrolls
 *  - `footer`      : pinned at the bottom, never scrolls (composers, CTAs)
 *  - `nav`         : show/hide the bottom nav bar for this page (slides in/out)
 *  - `swipeBack`   : edge-swipe right to go back (native feel)
 *  - `scroll`      : whether the body scrolls
 *  - handles directional enter/exit transitions automatically
 */
export default function Page({
  children,
  header = null,
  footer = null,
  nav = true,
  swipeBack = false,
  onSwipeBack,
  scroll = true,
  padBottom = true,
  className = '',
  contentClassName = '',
}) {
  const { setVisible } = useNav()
  const { direction } = useNavDirection()
  const { flags } = usePerf()
  const navigate = useNavigate()
  const startX = useRef(null)

  useEffect(() => {
    setVisible(nav)
  }, [nav, setVisible])

  const touchHandlers = swipeBack
    ? {
        onTouchStart: (e) => {
          const x = e.touches[0].clientX
          startX.current = x < 40 ? x : null
        },
        onTouchEnd: (e) => {
          if (startX.current == null) return
          const dx = e.changedTouches[0].clientX - startX.current
          startX.current = null
          if (dx > 70) (onSwipeBack ? onSwipeBack() : navigate(-1))
        },
      }
    : {}

  return (
    <motion.div
      custom={direction}
      variants={flags.springy ? pageVariants : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }}
      initial="initial"
      animate="animate"
      exit="exit"
      // h-[100dvh] + overflow-hidden, NOT min-h: with min-h the shell grows
      // with its content, the document itself scrolls, and any inner
      // overflow-y-auto never activates — which is what pushed the chat
      // composer off-screen and let headers scroll away.
      className={`h-[100dvh] overflow-hidden flex flex-col ${className}`}
      {...touchHandlers}
    >
      {/* Fixed chrome: rendered OUTSIDE the scroll container so it can never
          scroll away, regardless of how long the content gets. */}
      {header}

      <div
        className={[
          // min-h-0 is load-bearing: a flex child defaults to min-height:auto,
          // which refuses to shrink below its content and breaks the scroll
          // container. Without it `flex-1 overflow-y-auto` silently does
          // nothing.
          'flex-1 min-h-0 flex flex-col',
          scroll ? 'overflow-y-auto no-scrollbar' : 'overflow-hidden',
          padBottom && nav ? 'pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+14px)]' : '',
          contentClassName,
        ].join(' ')}
      >
        {children}
      </div>

      {footer}
    </motion.div>
  )
}
