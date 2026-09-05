import { motion } from 'framer-motion'

export default function ProgressBar({ value = 0, className = '', showDots = false, steps = 0, current = 0 }) {
  if (showDots && steps) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {Array.from({ length: steps }).map((_, i) => (
          <motion.span
            key={i}
            layout
            transition={{ type: 'spring', stiffness: 480, damping: 36 }}
            className={`h-1.5 rounded-full ${i <= current ? 'brand-fill' : 'bg-[color:var(--app-border)]'}`}
            style={{ width: i === current ? 26 : 8 }}
          />
        ))}
      </div>
    )
  }
  return (
    <div className={`h-1.5 w-full rounded-full bg-[color:var(--app-border)] overflow-hidden ${className}`}>
      <motion.div
        className="h-full rounded-full brand-fill"
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: 'spring', stiffness: 260, damping: 34 }}
      />
    </div>
  )
}
