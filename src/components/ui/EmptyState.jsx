import { motion } from 'framer-motion'
import Icon from './Icon'
import Button from './Button'

export default function EmptyState({ icon = 'compass', title, description, action, onAction, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col items-center justify-center text-center px-8 py-14 ${className}`}
    >
      <div className="w-16 h-16 rounded-3xl elev border hairline grid place-items-center mb-4">
        <Icon name={icon} size={26} className="text-brand-500" />
      </div>
      <h3 className="font-display text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
      {description && <p className="text-[14px] muted mt-1.5 max-w-[280px] leading-relaxed">{description}</p>}
      {action && <Button className="mt-5" onClick={onAction}>{action}</Button>}
    </motion.div>
  )
}
