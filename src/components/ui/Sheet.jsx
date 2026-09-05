import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import IconButton from './IconButton'
import { sheetVariants } from '../../lib/motion'

/** Bottom sheet with drag-to-dismiss, scroll lock and a close affordance. */
export default function Sheet({ open, onClose, title, subtitle, children, footer, maxHeight = '88vh' }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            variants={sheetVariants}
            initial="initial" animate="animate" exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 700) onClose?.() }}
            style={{ maxHeight }}
            className="relative w-full sm:max-w-[440px] surface rounded-t-[28px] sm:rounded-[28px] shadow-sheet flex flex-col overflow-hidden safe-bottom"
          >
            <div className="pt-3 pb-1 grid place-items-center shrink-0 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 rounded-full bg-[color:var(--app-border)]" />
            </div>
            {(title || onClose) && (
              <div className="flex items-start gap-3 px-5 pt-2 pb-3 shrink-0">
                <div className="flex-1 min-w-0">
                  {title && <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em] truncate">{title}</h2>}
                  {subtitle && <p className="text-[13px] muted mt-0.5">{subtitle}</p>}
                </div>
                <IconButton icon="close" size="sm" label="Close" onClick={onClose} />
              </div>
            )}
            <div className="overflow-y-auto no-scrollbar px-5 pb-5 flex-1">{children}</div>
            {footer && <div className="px-5 pb-5 pt-3 border-t hairline shrink-0">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
