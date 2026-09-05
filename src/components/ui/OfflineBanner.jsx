import { AnimatePresence, motion } from 'framer-motion'
import { useNetwork } from '../../lib/network'
import Icon from './Icon'

/**
 * Connectivity banner.
 *
 * Slides in under the header when we genuinely can't reach the backend.
 * Deliberately quiet: no red alarm, no modal, no blocking the UI — cached
 * content stays usable and the banner just explains why things are stale.
 */
export default function OfflineBanner() {
  const { reachable, online, slow, retry } = useNetwork()
  const show = !reachable

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mx-4 my-2 px-3.5 py-2.5 rounded-2xl elev border hairline flex items-center gap-2.5">
            <Icon name="wifi" size={16} className="muted shrink-0" />
            <p className="text-[12.5px] flex-1 leading-tight">
              {online ? "Can't reach Leenk right now." : "You're offline."}
              <span className="muted"> Showing what we have.</span>
            </p>
            <button
              onClick={retry}
              className="text-[12.5px] font-medium text-brand-500 shrink-0 px-1"
            >
              Retry
            </button>
          </div>
        </motion.div>
      )}

      {!show && slow && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="mx-4 my-2 px-3.5 py-2 rounded-2xl elev border hairline">
            <p className="text-[12px] muted">Slow connection — images may take a moment.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
