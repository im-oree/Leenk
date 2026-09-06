import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { useStore } from '../../lib/store'

/** The gate. Nothing in the app opens until verification clears. */
export default function VerifyPending() {
  const navigate = useNavigate()
  const { verificationStatus } = useStore()
  const inReview = verificationStatus === 'in_review'

  return (
    <Page
      nav={false}
      padBottom={false}
      header={
        <Header close onClose={() => navigate('/onboarding')} border={false} />
      }
    >
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center max-w-[420px] mx-auto w-full">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-20 h-20 rounded-[28px] bg-brand-500/10 grid place-items-center"
        >
          <Icon name={inReview ? 'clock' : 'lock'} size={34} className="text-brand-500" />
        </motion.div>

        <Badge tone="warn" className="mt-5">{inReview ? 'In review' : 'Not verified yet'}</Badge>

        <h1 className="font-display text-[27px] font-semibold tracking-[-0.035em] mt-4 leading-tight">
          {inReview ? "We're reviewing your account" : 'Verification unlocks everything'}
        </h1>
        <p className="text-[14.5px] muted mt-3 leading-relaxed">
          {inReview
            ? "A moderator is taking a quick look. You'll get a notification the moment it clears — usually within a few hours."
            : 'Swiping, the feed, messages and posting all stay locked until we confirm you\u2019re a current student. It protects everyone here, including you.'}
        </p>

        <div className="w-full mt-9 space-y-2.5">
          <Button full size="lg" onClick={() => navigate('/verify')}>
            {inReview ? 'Check status' : 'Verify now'}
          </Button>
          <Button full size="lg" variant="ghost" onClick={() => navigate('/onboarding')}>
            Back to start
          </Button>
        </div>
      </div>
    </Page>
  )
}
