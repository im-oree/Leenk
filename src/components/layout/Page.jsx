import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNav } from './NavContext'
import { useNavDirection } from './NavDirection'
import { pageVariants } from '../../lib/motion'
import { usePerf } from '../../lib/PerfContext'

/**
 * Page shell.
 *  - `nav`         : show/hide the bottom nav bar for this page (slides in/out)
 *  - `swipeBack`   : edge-swipe right to go back (native feel)
 *  - `scroll`      : whether the body scrolls
 *  - handles directional enter/exit transitions automatically
 */
export default function Page({
  children,
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
      className={`min-h-[100dvh] flex flex-col ${className}`}
      {...touchHandlers}
    >
      <div
        className={[
          'flex-1 flex flex-col',
          scroll ? 'overflow-y-auto no-scrollbar' : 'overflow-hidden',
          padBottom && nav ? 'pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+14px)]' : '',
          contentClassName,
        ].join(' ')}
      >
        {children}
      </div>
    </motion.div>
  )
}
