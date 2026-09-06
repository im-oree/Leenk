import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import Icon from './Icon'
import { haptic } from '../../lib/haptics'
import Tooltip from './Tooltip'

const tones = {
  default: 'surface text-[color:var(--app-text)]',
  ghost: 'bg-transparent text-[color:var(--app-text)] hover:bg-[color:var(--app-elev)]',
  glass: 'glass text-[color:var(--app-text)] border border-[color:var(--app-border)]',
  brand: 'brand-fill text-white shadow-glow',
  danger: 'bg-red-500/12 text-red-500',
}

const sizes = { sm: 32, md: 40, lg: 46 }

const IconButton = forwardRef(function IconButton(
  { icon, tone = 'ghost', size = 'md', label, tooltip, className = '', onClick, badge, ...rest },
  ref,
) {
  const px = sizes[size]
  // Icon-only buttons are ambiguous by nature, so every one of them explains
  // itself on long-press (touch) / hover / focus. `tooltip={false}` opts out.
  const tip = tooltip === false ? null : (tooltip || label)

  const button = (
    <motion.button
      ref={ref}
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 620, damping: 30 }}
      onClick={(e) => { haptic('light'); onClick?.(e) }}
      style={{ width: px, height: px }}
      className={`hit-expand relative inline-flex items-center justify-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${tones[tone]} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 17 : size === 'lg' ? 22 : 20} />
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full brand-fill text-white text-[10px] font-semibold grid place-items-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </motion.button>
  )

  return tip ? <Tooltip label={tip}>{button}</Tooltip> : button
})

export default IconButton
