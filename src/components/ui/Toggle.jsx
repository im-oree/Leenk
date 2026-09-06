import { motion } from 'framer-motion'
import { haptic } from '../../lib/haptics'

export default function Toggle({ checked, onChange, label, description, disabled }) {
  const body = (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      onClick={() => { if (disabled) return; haptic('light'); onChange?.(!checked) }}
      className={`relative w-[52px] h-[31px] rounded-full shrink-0 transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
        checked ? 'brand-fill' : 'bg-[color:var(--app-border)]'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 40 }}
        className="absolute top-[3px] w-[25px] h-[25px] rounded-full bg-white shadow-sm"
        style={{ left: checked ? 24 : 3 }}
      />
    </motion.button>
  )

  if (!label) return body
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {description && <p className="text-[13px] muted mt-0.5 leading-snug">{description}</p>}
      </div>
      {body}
    </div>
  )
}
