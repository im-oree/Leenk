import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import Button from './Button'

export default function Modal({ open, onClose, title, description, children, actions, tone = 'default' }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 32 } }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16 } }}
            className="relative w-full max-w-[360px] surface rounded-[26px] p-6 shadow-card"
          >
            {title && <h3 className={`font-display text-[19px] font-semibold tracking-[-0.02em] ${tone === 'danger' ? 'text-red-500' : ''}`}>{title}</h3>}
            {description && <p className="text-[14px] muted mt-2 leading-relaxed">{description}</p>}
            {children && <div className="mt-4">{children}</div>}
            <div className="flex gap-2.5 mt-6">
              {actions || <Button full variant="secondary" onClick={onClose}>Close</Button>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
