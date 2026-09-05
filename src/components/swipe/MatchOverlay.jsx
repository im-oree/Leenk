import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import { LogoMark } from '../brand/Logo'
import { usePerf } from '../../lib/PerfContext'

export default function MatchOverlay({ match, me, onClose }) {
  const navigate = useNavigate()
  const { flags } = usePerf()
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {match && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0 z-[95] grid place-items-center px-8 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-brand-700 via-brand-600 to-ink-900" />
          {flags.parallax && (
            <motion.div
              aria-hidden
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.9 }}
              style={{
                background:
                  'radial-gradient(60% 40% at 50% 22%, rgba(255,255,255,0.28), transparent 70%)',
              }}
            />
          )}

          <div className="relative z-10 w-full max-w-[360px] flex flex-col items-center text-white text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.05 }}
            >
              <LogoMark size={64} animated />
            </motion.div>

            <motion.h1
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[38px] font-semibold tracking-[-0.035em] mt-4 leading-none"
            >
              It's a <span className="font-curvy italic font-normal">Leenk</span>
            </motion.h1>
            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.34, duration: 0.4 }}
              className="text-[14.5px] text-white/75 mt-2"
            >
              You and {match.user.name} liked each other
            </motion.p>

            <div className="flex items-center justify-center mt-9 mb-10">
              <motion.div
                initial={{ x: -60, rotate: -14, opacity: 0 }}
                animate={{ x: 12, rotate: -7, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
              >
                <Avatar src={me.photos[0]} name={me.name} size={116} className="ring-4 ring-white/85 rounded-full" />
              </motion.div>
              <motion.div
                initial={{ x: 60, rotate: 14, opacity: 0 }}
                animate={{ x: -12, rotate: 7, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.22 }}
              >
                <Avatar src={match.user.photos[0]} name={match.user.name} size={116} className="ring-4 ring-white/85 rounded-full" />
              </motion.div>
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.42, duration: 0.4 }}
              className="w-full space-y-2.5"
            >
              <Button
                full size="lg"
                className="!bg-white !text-brand-600 !shadow-none"
                onClick={() => { onClose(); navigate(`/app/chat/${match.id}`) }}
              >
                Send a message
              </Button>
              <Button full size="lg" variant="ghost" className="!text-white/85" onClick={onClose}>
                Keep swiping
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
