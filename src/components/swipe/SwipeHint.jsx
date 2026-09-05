import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { shouldShowHint, markHintShown } from '../../lib/hints'

/**
 * A quiet, few-second hint that photos can be swiped.
 * No arrows — just a soft cue that fades itself out.
 * Shows a maximum of 3 times per device, each on a different profile.
 */
export default function SwipeHint({ hintId = 'photoSwipe', subjectId, enabled = true, duration = 2600 }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!enabled || subjectId == null) return
    if (!shouldShowHint(hintId, subjectId, 3)) return

    const show = setTimeout(() => {
      setVisible(true)
      markHintShown(hintId, subjectId, 3)
    }, 700)
    const hide = setTimeout(() => setVisible(false), 700 + duration)

    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [hintId, subjectId, enabled, duration])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md"
        >
          <motion.span
            className="flex items-center gap-[3px]"
            animate={{ x: [0, 7, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/55" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
          </motion.span>
          <span className="text-[11.5px] font-medium text-white/95 whitespace-nowrap">
            Swipe photos
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
