import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import { useOnboarding, STEPS } from './OnboardingContext'

/**
 * Shared frame for every onboarding step.
 * Progress, back, optional skip, and a pinned continue button —
 * so no step ever feels like a dead end.
 */
export default function StepShell({
  title,
  subtitle,
  children,
  canContinue = true,
  onContinue,
  continueLabel = 'Continue',
  onSkip,
  skipLabel = 'Skip for now',
  footerNote,
  loading = false,
}) {
  const { pathname } = useLocation()
  const { back, next, indexOf } = useOnboarding()
  const index = Math.max(0, indexOf(pathname))

  const handleContinue = () => (onContinue ? onContinue() : next(pathname))

  return (
    <Page nav={false} padBottom={false} swipeBack onSwipeBack={() => back(pathname)}>
      <Header
        back
        onBack={() => back(pathname)}
        border={false}
        right={
          onSkip ? (
            <Button variant="ghost" size="sm" onClick={onSkip} className="muted">
              {skipLabel}
            </Button>
          ) : (
            <span className="text-[12.5px] muted tabular-nums pr-3">
              {index + 1} / {STEPS.length}
            </span>
          )
        }
      />

      <div className="px-5 pt-1">
        <ProgressBar value={((index + 1) / STEPS.length) * 100} />
      </div>

      <div className="flex-1 flex flex-col px-6 pt-7 max-w-[480px] w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-[29px] font-semibold tracking-[-0.035em] leading-[1.1]">{title}</h1>
          {subtitle && <p className="text-[14.5px] muted mt-2.5 leading-relaxed">{subtitle}</p>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 mt-7 pb-6"
        >
          {children}
        </motion.div>
      </div>

      <div className="sticky bottom-0 glass border-t hairline px-6 pt-3.5 pb-[max(env(safe-area-inset-bottom),18px)]">
        <div className="max-w-[480px] mx-auto">
          <Button full size="lg" disabled={!canContinue} loading={loading} onClick={handleContinue}>
            {continueLabel}
          </Button>
          {footerNote && <p className="text-[11.5px] muted text-center mt-2.5 leading-relaxed">{footerNote}</p>}
        </div>
      </div>
    </Page>
  )
}
