import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Button from '../../components/ui/Button'
import { LogoMark } from '../../components/brand/Logo'
import Icon from '../../components/ui/Icon'
import { usePerf } from '../../lib/PerfContext'

const points = [
  { icon: 'shield', text: 'Every profile is a verified, enrolled student' },
  { icon: 'cap', text: 'Your campus first, nearby campuses next' },
  { icon: 'grid', text: 'Swipe, or just hang out on the feed' },
]

export default function Welcome() {
  const navigate = useNavigate()
  const { flags } = usePerf()

  return (
    <Page nav={false} padBottom={false} className="bg-[color:var(--app-bg)]">
      <div className="relative flex-1 flex flex-col px-7 safe-top noise">
        {flags.parallax && (
          <>
            <motion.div
              aria-hidden
              className="absolute -top-24 -right-20 w-[300px] h-[300px] rounded-full blur-[90px] pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(251,63,109,0.34), transparent 70%)' }}
              animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0.95, 0.7] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              aria-hidden
              className="absolute top-1/3 -left-24 w-[260px] h-[260px] rounded-full blur-[90px] pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,143,171,0.26), transparent 70%)' }}
              animate={{ scale: [1.08, 1, 1.08] }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}

        <div className="flex-1 flex flex-col justify-center relative z-10 max-w-[460px] w-full mx-auto">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
          >
            <LogoMark size={78} animated />
          </motion.div>

          <motion.h1
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[46px] leading-[0.95] font-semibold tracking-[-0.045em] mt-7"
          >
            Meet people
            <br />
            who <span className="font-curvy italic font-normal brand-text">actually</span>
            <br />
            go here.
          </motion.h1>

          <motion.p
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.62, duration: 0.5 }}
            className="text-[15.5px] muted mt-4 leading-relaxed max-w-[330px]"
          >
            Leenk is for verified university students only. No bots, no strangers, no one pretending.
          </motion.p>

          <div className="mt-9 space-y-3.5">
            {points.map((p, i) => (
              <motion.div
                key={p.text}
                initial={{ x: -14, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.72 + i * 0.09, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3.5"
              >
                <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 grid place-items-center shrink-0">
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="text-[14.5px] leading-snug">{p.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ y: 26, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.02, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 pb-8 pt-6 space-y-3 max-w-[460px] w-full mx-auto safe-bottom"
        >
          <Button full size="lg" onClick={() => navigate('/onboarding/phone')}>
            Get started
          </Button>
          <Button full size="lg" variant="ghost" onClick={() => navigate('/login')}>
            I already have an account
          </Button>
          <p className="text-[11.5px] muted text-center leading-relaxed pt-1">
            By continuing you agree to our Terms and Community Guidelines.
          </p>
        </motion.div>
      </div>
    </Page>
  )
}
