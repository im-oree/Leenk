import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { haptic } from '../../lib/haptics'

const STYLES = [
  { id: 'plain', label: 'Plain', className: 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]' },
  { id: 'chip', label: 'Chip', className: 'text-white bg-black/55 backdrop-blur-md px-2.5 py-1 rounded-xl' },
  { id: 'brand', label: 'Brand', className: 'text-white brand-fill px-2.5 py-1 rounded-xl' },
  { id: 'serif', label: 'Serif', className: 'font-curvy italic text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]' },
]

/**
 * Draggable text overlays for stories.
 *
 * Positions are stored normalised (0..1) rather than in pixels, so an overlay
 * placed on a phone lands in the same spot when the story is rendered at any
 * other size.
 */
export default function CaptionOverlay({ overlays = [], onChange, editable = false }) {
  const containerRef = useRef(null)
  const [active, setActive] = useState(null)

  const update = (id, patch) =>
    onChange?.(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const remove = (id) => {
    haptic('medium')
    onChange?.(overlays.filter((o) => o.id !== id))
    setActive(null)
  }

  const startDrag = (o) => (e) => {
    if (!editable) return
    e.stopPropagation()
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    setActive(o.id)

    const move = (ev) => {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY
      update(o.id, {
        x: Math.max(0.06, Math.min(0.94, (cx - box.left) / box.width)),
        y: Math.max(0.06, Math.min(0.94, (cy - box.top) / box.height)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      haptic('light')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={containerRef} className="absolute inset-0" onPointerDown={() => setActive(null)}>
      {overlays.map((o) => {
        const style = STYLES.find((s) => s.id === (o.style || 'chip')) || STYLES[1]
        const isActive = active === o.id
        return (
          <motion.div
            key={o.id}
            onPointerDown={startDrag(o)}
            className="absolute touch-none"
            style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            animate={{ scale: isActive ? 1.04 : 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 30 }}
          >
            <div className="relative">
              {editable ? (
                <input
                  value={o.text}
                  onChange={(e) => update(o.id, { text: e.target.value.slice(0, 80) })}
                  onFocus={() => setActive(o.id)}
                  className={`bg-transparent outline-none text-center font-semibold ${style.className}`}
                  style={{ fontSize: o.size || 22, width: `${Math.max(6, (o.text?.length || 6) + 1)}ch` }}
                />
              ) : (
                <span className={`font-semibold ${style.className}`} style={{ fontSize: o.size || 22 }}>
                  {o.text}
                </span>
              )}

              {editable && isActive && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-1 rounded-2xl bg-black/70 backdrop-blur-md"
                >
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onPointerDown={(e) => { e.stopPropagation(); haptic('light'); update(o.id, { style: s.id }) }}
                      className={`px-2 py-1 rounded-xl text-[11px] font-medium ${
                        (o.style || 'chip') === s.id ? 'bg-white text-black' : 'text-white/80'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <span className="w-px h-4 bg-white/25 mx-0.5" />
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); remove(o.id) }}
                    aria-label="Remove text"
                    className="w-6 h-6 rounded-lg grid place-items-center text-white/85"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
