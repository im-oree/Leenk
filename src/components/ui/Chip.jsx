import { motion } from 'framer-motion'
import Icon from './Icon'
import { haptic } from '../../lib/haptics'

export default function Chip({ children, selected, onClick, icon, size = 'md', className = '', as = 'button' }) {
  const s = size === 'sm' ? 'text-[12.5px] px-3 h-8 gap-1.5' : 'text-[14px] px-4 h-10 gap-2'
  const Cmp = as === 'button' ? motion.button : motion.div
  return (
    <Cmp
      type={as === 'button' ? 'button' : undefined}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      onClick={onClick ? (e) => { haptic('light'); onClick(e) } : undefined}
      className={[
        'inline-flex items-center rounded-full font-medium border transition-all duration-200 whitespace-nowrap',
        selected
          ? 'border-transparent brand-fill text-white shadow-glow'
          : 'border-[color:var(--app-border)] bg-[color:var(--app-elev)] text-[color:var(--app-text)] hover:border-brand-500/40',
        s, className,
      ].join(' ')}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </Cmp>
  )
}
