import { AnimatePresence, motion } from 'framer-motion'
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '../../lib/haptics'

/**
 * Long-press tooltip.
 *
 * Touch  → press and hold ~380ms to reveal, release to dismiss.
 * Mouse  → hover after a short delay (desktop affordance).
 * Keyboard → focus reveals it, so it isn't a touch-only feature.
 *
 * Rendered in a portal so it is never clipped by a parent's overflow-hidden
 * (the nav bar and card stack both clip).
 */
export default function Tooltip({
  label,
  children,
  placement = 'top',
  delay = 380,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const ref = useRef(null)
  const suppressClick = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({
      x: r.left + r.width / 2,
      y: placement === 'top' ? r.top - 10 : r.bottom + 10,
    })
    setOpen(true)
    haptic('light')
  }, [placement])

  const start = useCallback(
    (isTouch) => {
      if (disabled || !label) return
      clear()
      timer.current = setTimeout(() => {
        // A long-press that reveals a tooltip should not also fire the button.
        if (isTouch) suppressClick.current = true
        show()
      }, isTouch ? delay : 520)
    },
    [clear, delay, disabled, label, show],
  )

  const stop = useCallback(() => {
    clear()
    setOpen(false)
  }, [clear])

  useEffect(() => clear, [clear])

  // Dismiss on scroll — a pinned tooltip over moved content looks broken.
  useEffect(() => {
    if (!open) return
    const onScroll = () => stop()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, stop])

  const child = cloneElement(children, {
    ref: (node) => {
      ref.current = node
      const r = children.ref
      if (typeof r === 'function') r(node)
      else if (r) r.current = node
    },
    onPointerDown: (e) => {
      start(e.pointerType === 'touch')
      children.props.onPointerDown?.(e)
    },
    onPointerUp: (e) => {
      stop()
      children.props.onPointerUp?.(e)
    },
    onPointerLeave: (e) => {
      stop()
      children.props.onPointerLeave?.(e)
    },
    onPointerCancel: stop,
    onContextMenu: (e) => {
      // long-press on mobile otherwise pops the OS menu
      if (open) e.preventDefault()
      children.props.onContextMenu?.(e)
    },
    onClick: (e) => {
      if (suppressClick.current) {
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      children.props.onClick?.(e)
    },
    onFocus: (e) => {
      if (e.target.matches?.(':focus-visible')) show()
      children.props.onFocus?.(e)
    },
    onBlur: (e) => {
      stop()
      children.props.onBlur?.(e)
    },
  })

  return (
    <>
      {child}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && label && (
              <motion.div
                initial={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 620, damping: 32 }}
                style={{
                  left: coords.x,
                  top: coords.y,
                  transform: `translate(-50%, ${placement === 'top' ? '-100%' : '0'})`,
                }}
                className="fixed z-[999] pointer-events-none px-2.5 py-1.5 rounded-xl
                           bg-[color:var(--app-text)] text-[color:var(--app-bg)]
                           text-[12px] font-medium whitespace-nowrap shadow-card"
                role="tooltip"
              >
                {label}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
