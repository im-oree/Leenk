import { motion } from 'framer-motion'
import Icon from './Icon'
import { haptic } from '../../lib/haptics'

/** Settings-style row: icon, label, optional value, chevron or custom right slot. */
export default function ListRow({
  icon, label, description, value, right, onClick, danger = false, chevron = true, className = '',
}) {
  const interactive = !!onClick
  const Cmp = interactive ? motion.button : 'div'
  return (
    <Cmp
      type={interactive ? 'button' : undefined}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      onClick={interactive ? () => { haptic('light'); onClick() } : undefined}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 ${interactive ? 'active:bg-[color:var(--app-elev)]' : ''} ${className}`}
    >
      {icon && (
        <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${danger ? 'bg-red-500/10 text-red-500' : 'elev text-brand-500'}`}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={`block text-[15px] font-medium truncate ${danger ? 'text-red-500' : ''}`}>{label}</span>
        {description && <span className="block text-[12.5px] muted mt-0.5 leading-snug">{description}</span>}
      </span>
      {value && <span className="text-[13.5px] muted shrink-0 max-w-[40%] truncate">{value}</span>}
      {right}
      {interactive && chevron && !right && <Icon name="chevronRight" size={17} className="muted shrink-0" />}
    </Cmp>
  )
}
