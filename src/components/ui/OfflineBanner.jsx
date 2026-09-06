import { AnimatePresence, motion } from 'framer-motion'
import { useNetwork } from '../../lib/network'
import Icon from './Icon'

/**
 * Connectivity banner.
 *
 * Mounted ONCE in App.jsx with `floating`, so every screen gets it. It used to
 * be pasted into four screens by hand, which meant twenty-three others said
 * nothing at all when the network died.
 *
 * Deliberately quiet: no red alarm, no modal, nothing blocked. Cached content
 * stays usable and the banner only explains why things may be stale. An app
 * that shouts about a dropped connection is more annoying than the dropped
 * connection.
 *
 * @param floating  fixed above the nav bar (app-wide usage)
 *                  vs inline in the document flow (legacy/manual usage)
 */
export default function OfflineBanner({ floating = false }) {
  const { reachable, online, slow, retry } = useNetwork()
  const offline = !reachable

  // Never show both. Offline is strictly more important than slow.
  const mode = offline ? 'offline' : slow ? 'slow' : null

  const wrapper = floating
    ? 'fixed left-0 right-0 z-40 pointer-events-none px-4 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+10px)]'
    : 'overflow-hidden'

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key={mode}
          initial={floating ? { opacity: 0, y: 14, scale: 0.97 } : { height: 0, opacity: 0 }}
          animate={floating ? { opacity: 1, y: 0, scale: 1 } : { height: 'auto', opacity: 1 }}
          exit={floating ? { opacity: 0, y: 14, scale: 0.97 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={wrapper}
        >
          <div
            className={`pointer-events-auto max-w-[var(--content-max)] mx-auto flex items-center gap-2.5
              px-3.5 py-2.5 rounded-2xl border hairline
              ${floating ? 'glass shadow-lg' : 'elev my-2'}`}
            role="status"
            aria-live="polite"
          >
            <Icon
              name={mode === 'offline' ? 'wifiOff' : 'wifi'}
              size={16}
              className="muted shrink-0"
            />

            {mode === 'offline' ? (
              <>
                <p className="text-[12.5px] flex-1 leading-tight">
                  {online ? "Can't reach Leenk." : "You're offline."}
                  <span className="muted"> Showing saved content.</span>
                </p>
                <button
                  onClick={retry}
                  className="text-[12.5px] font-semibold text-brand-500 shrink-0 px-1.5 py-0.5 -mr-1 rounded-lg active:opacity-60"
                >
                  Retry
                </button>
              </>
            ) : (
              <p className="text-[12px] muted flex-1 leading-tight">
                Slow connection — this may take a moment.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
