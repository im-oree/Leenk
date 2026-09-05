import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { haptic } from '../../lib/haptics'

/** Dual-thumb range slider — pointer + keyboard accessible. */
export default function RangeSlider({ min = 18, max = 40, value = [18, 26], onChange, suffix = '' }) {
  const trackRef = useRef(null)
  const [lo, hi] = value
  const pct = (v) => ((v - min) / (max - min)) * 100

  const posToValue = useCallback(
    (clientX) => {
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return Math.round(min + ratio * (max - min))
    },
    [min, max],
  )

  const startDrag = (which) => (e) => {
    e.preventDefault()
    const move = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX
      const v = posToValue(clientX)
      if (which === 'lo') onChange([Math.min(v, hi - 1), hi])
      else onChange([lo, Math.max(v, lo + 1)])
    }
    const up = () => {
      haptic('light')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', up)
  }

  const Thumb = ({ which, v }) => (
    <motion.div
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      whileTap={{ scale: 1.22 }}
      onPointerDown={startDrag(which)}
      onTouchStart={startDrag(which)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!d) return
        e.preventDefault()
        if (which === 'lo') onChange([Math.max(min, Math.min(lo + d, hi - 1)), hi])
        else onChange([lo, Math.min(max, Math.max(hi + d, lo + 1))])
      }}
      className="absolute top-1/2 w-6 h-6 -mt-3 -ml-3 rounded-full bg-white border-2 border-brand-500 shadow-md cursor-grab active:cursor-grabbing touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      style={{ left: `${pct(v)}%` }}
    />
  )

  return (
    <div>
      <div className="flex justify-between mb-3">
        <span className="text-[15px] font-semibold tabular-nums">{lo}{suffix}</span>
        <span className="text-[15px] font-semibold tabular-nums">{hi}{suffix}{hi === max ? '+' : ''}</span>
      </div>
      <div ref={trackRef} className="relative h-1.5 rounded-full bg-[color:var(--app-border)] mx-3">
        <div className="absolute h-full rounded-full brand-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <Thumb which="lo" v={lo} />
        <Thumb which="hi" v={hi} />
      </div>
    </div>
  )
}
