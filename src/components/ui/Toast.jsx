import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import Icon from './Icon'
import { useStore } from '../../lib/store'

const tones = {
  default: { icon: 'info', cls: 'text-[color:var(--app-text)]' },
  success: { icon: 'check', cls: 'text-emerald-500' },
  error: { icon: 'info', cls: 'text-red-500' },
  brand: { icon: 'heart', cls: 'text-brand-500' },
}

export default function ToastHost() {
  const { toast, dispatch } = useStore()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => dispatch({ type: 'toast/hide' }), 2600)
    return () => clearTimeout(t)
  }, [toast, dispatch])

  return (
    <div className="fixed left-0 right-0 top-0 z-[100] pointer-events-none flex justify-center safe-top">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -22, scale: 0.96 }}
            animate={{ opacity: 1, y: 10, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="glass border hairline rounded-full shadow-card px-4 py-2.5 flex items-center gap-2.5 max-w-[92vw] pointer-events-auto"
          >
            <Icon name={(tones[toast.tone] || tones.default).icon} size={17} className={(tones[toast.tone] || tones.default).cls} />
            <span className="text-[13.5px] font-medium truncate">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
