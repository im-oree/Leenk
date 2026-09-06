import { motion } from 'framer-motion'

/**
 * Photo position indicator — dots, sitting in the LOWER section of the card
 * above the text block. Active dot widens into a pill.
 */
export default function PhotoDots({ count, index, onSelect, className = '' }) {
  if (count <= 1) return null
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => {
        const active = i === index
        return (
          <motion.button
            key={i}
            layout
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation()
                    onSelect(i)
                  }
                : undefined
            }
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            aria-label={`Photo ${i + 1} of ${count}`}
            aria-current={active}
            className={`h-[6px] rounded-full transition-colors duration-200 ${
              active ? 'bg-white' : 'bg-white/40'
            }`}
            style={{ width: active ? 20 : 6 }}
          />
        )
      })}
    </div>
  )
}
