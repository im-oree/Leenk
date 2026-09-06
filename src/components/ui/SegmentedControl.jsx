import { motion } from 'framer-motion'
import { useId } from 'react'
import { haptic } from '../../lib/haptics'

export default function SegmentedControl({ options, value, onChange, size = 'md', className = '' }) {
  const layoutId = useId()
  const h = size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-[14px]'
  return (
    <div className={`relative flex elev rounded-2xl p-1 border hairline ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { haptic('light'); onChange(opt.value) }}
            className={`relative flex-1 ${h} rounded-xl font-medium transition-colors duration-200 ${active ? 'text-white' : 'muted'}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 rounded-xl brand-fill"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
