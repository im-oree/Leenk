import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Button from '../../components/ui/Button'
import Icon from '../../components/ui/Icon'
import ProgressBar from '../../components/ui/ProgressBar'
import Badge from '../../components/ui/Badge'
import { LogoMark } from '../../components/brand/Logo'
import { useStore } from '../../lib/store'
import { campusById } from '../../lib/mock'
import { haptic } from '../../lib/haptics'

const STAGES = ['method', 'document', 'selfie', 'review']

export default function Verify() {
  const navigate = useNavigate()
  const { me, dispatch, toast } = useStore()
  const [stage, setStage] = useState(0)
  const [method, setMethod] = useState(null)
  const [docUploaded, setDocUploaded] = useState(false)
  const [selfieDone, setSelfieDone] = useState(false)

  const campus = campusById(me.campusId)

  const goNext = () => {
    haptic('light')
    setStage((s) => Math.min(s + 1, STAGES.length - 1))
  }
  const goBack = () => {
    if (stage === 0) return navigate(-1)
    haptic('light')
    setStage((s) => s - 1)
  }

  return (
    <Page nav={false} padBottom={false} swipeBack onSwipeBack={goBack}>
      <Header
        back
        onBack={goBack}
        title="Verification"
        subtitle={`Step ${stage + 1} of ${STAGES.length}`}
        border={false}
        right={
          stage < 3 ? (
            <Button variant="ghost" size="sm" className="muted" onClick={() => navigate('/verify/pending')}>
              Later
            </Button>
          ) : null
        }
      />
      <div className="px-5">
        <ProgressBar value={((stage + 1) / STAGES.length) * 100} />
      </div>

      <div className="flex-1 flex flex-col px-6 pt-7 max-w-[480px] w-full mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          {stage === 0 && (
            <StageWrap key="method">
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.035em] leading-tight">
                How should we verify you?
              </h1>
              <p className="text-[14.5px] muted mt-2.5 leading-relaxed">
                {campus.name} supports the options below. You'll still do a live selfie after this.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  { id: 'email', icon: 'mail', title: 'School email', body: 'Fastest. We send a code to your @student address.', tag: 'Recommended' },
                  { id: 'id', icon: 'id', title: 'Student ID card', body: 'Photograph the front of your card.', tag: null },
                  { id: 'portal', icon: 'globe', title: 'Student portal', body: 'Sign in once so we can confirm enrolment.', tag: 'Strongest' },
                ].map((m) => {
                  const active = method === m.id
                  return (
                    <motion.button
                      key={m.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { haptic('light'); setMethod(m.id) }}
                      className={`w-full flex gap-3.5 p-4 rounded-3xl border-2 text-left transition-colors duration-200 ${
                        active ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'
                      }`}
                    >
                      <span className="w-10 h-10 rounded-2xl elev text-brand-500 grid place-items-center shrink-0">
                        <Icon name={m.icon} size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-[15px]">{m.title}</span>
                          {m.tag && <Badge tone="brand" size="sm">{m.tag}</Badge>}
                        </span>
                        <span className="block text-[13px] muted mt-1 leading-relaxed">{m.body}</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </StageWrap>
          )}

          {stage === 1 && (
            <StageWrap key="document">
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.035em] leading-tight">
                {method === 'email' ? 'Confirm your school email' : 'Show us your student ID'}
              </h1>
              <p className="text-[14.5px] muted mt-2.5 leading-relaxed">
                Make sure everything is readable. Blurry photos slow your review down.
              </p>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => { haptic('success'); setDocUploaded(true) }}
                className={`mt-7 w-full aspect-[16/10] rounded-3xl border-2 border-dashed grid place-items-center relative overflow-hidden transition-colors ${
                  docUploaded ? 'border-brand-500 bg-brand-500/[0.05]' : 'border-[color:var(--app-border)] elev'
                }`}
              >
                <AnimatePresence mode="wait">
                  {docUploaded ? (
                    <motion.div
                      key="ok"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-2.5"
                    >
                      <span className="w-14 h-14 rounded-full brand-fill grid place-items-center">
                        <Icon name="check" size={26} strokeWidth={2.8} className="text-white" />
                      </span>
                      <span className="text-[14px] font-medium">ID captured</span>
                      <span className="text-[12.5px] muted">Tap to retake</span>
                    </motion.div>
                  ) : (
                    <motion.div key="empty" exit={{ opacity: 0, scale: 0.9 }} className="flex flex-col items-center gap-2.5 muted">
                      <Icon name="camera" size={30} />
                      <span className="text-[14px] font-medium">Tap to capture</span>
                      <span className="text-[12.5px]">Front of card, all four corners visible</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <div className="flex items-start gap-2.5 mt-5 p-4 rounded-2xl elev">
                <Icon name="lock" size={17} className="muted shrink-0 mt-0.5" />
                <p className="text-[12.5px] leading-relaxed muted">
                  Encrypted at rest, used only to confirm enrolment, and never shown to other users.
                </p>
              </div>
            </StageWrap>
          )}

          {stage === 2 && (
            <StageWrap key="selfie">
              <h1 className="font-display text-[28px] font-semibold tracking-[-0.035em] leading-tight">Now a live selfie</h1>
              <p className="text-[14.5px] muted mt-2.5 leading-relaxed">
                Follow the prompts on screen. This confirms you're a real person, right now.
              </p>

              <div className="mt-8 grid place-items-center">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { haptic('success'); setSelfieDone(true) }}
                  className="relative w-[230px] h-[230px] rounded-full elev border-2 border-[color:var(--app-border)] grid place-items-center overflow-hidden"
                >
                  <motion.span
                    className="absolute inset-0 rounded-full border-[3px] border-brand-500"
                    initial={{ pathLength: 0 }}
                    animate={selfieDone ? { opacity: 1 } : { opacity: [0.25, 1, 0.25] }}
                    transition={selfieDone ? {} : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {selfieDone ? (
                    <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-2">
                      <span className="w-14 h-14 rounded-full brand-fill grid place-items-center">
                        <Icon name="check" size={26} strokeWidth={2.8} className="text-white" />
                      </span>
                      <span className="text-[13.5px] font-medium">Liveness confirmed</span>
                    </motion.span>
                  ) : (
                    <span className="flex flex-col items-center gap-2 muted">
                      <Icon name="face" size={44} />
                      <span className="text-[13.5px] font-medium">Tap to start</span>
                    </span>
                  )}
                </motion.button>
              </div>

              <div className="mt-8 space-y-2.5">
                {['Look straight at the camera', 'Blink when prompted', 'Turn your head slowly'].map((t, i) => (
                  <div key={t} className="flex items-center gap-3 text-[13.5px]">
                    <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold ${selfieDone ? 'brand-fill text-white' : 'elev muted'}`}>
                      {selfieDone ? <Icon name="check" size={11} strokeWidth={3.2} /> : i + 1}
                    </span>
                    <span className={selfieDone ? 'muted line-through' : ''}>{t}</span>
                  </div>
                ))}
              </div>
            </StageWrap>
          )}

          {stage === 3 && <ReviewStage key="review" onDone={() => { dispatch({ type: 'verify/set', status: 'verified' }); toast('You are verified', 'success'); navigate('/app/discover', { replace: true }) }} />}
        </AnimatePresence>
      </div>

      {stage < 3 && (
        <div className="sticky bottom-0 glass border-t hairline px-6 pt-3.5 pb-[max(env(safe-area-inset-bottom),18px)]">
          <div className="max-w-[480px] mx-auto">
            <Button
              full size="lg"
              disabled={(stage === 0 && !method) || (stage === 1 && !docUploaded) || (stage === 2 && !selfieDone)}
              onClick={goNext}
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </Page>
  )
}

function StageWrap({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -22 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 pb-8"
    >
      {children}
    </motion.div>
  )
}

function ReviewStage({ onDone }) {
  const [progress, setProgress] = useState(0)
  const steps = ['Reading your document', 'Matching your face', 'Checking device signals', 'Confirming enrolment']
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        const nextP = Math.min(100, p + 3)
        setStepIdx(Math.min(steps.length - 1, Math.floor(nextP / 26)))
        return nextP
      })
    }, 55)
    return () => clearInterval(t)
  }, []) // eslint-disable-line

  const done = progress >= 100

  useEffect(() => {
    if (done) haptic('success')
  }, [done])

  return (
    <motion.div
      initial={{ opacity: 0, x: 22 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center text-center pb-16"
    >
      <motion.div animate={done ? { scale: [1, 1.14, 1] } : { rotate: [0, 4, -4, 0] }} transition={{ duration: done ? 0.5 : 4, repeat: done ? 0 : Infinity }}>
        <LogoMark size={72} animated={done} />
      </motion.div>

      <h1 className="font-display text-[27px] font-semibold tracking-[-0.035em] mt-7 leading-tight">
        {done ? "You're verified" : 'Checking a few things'}
      </h1>
      <p className="text-[14.5px] muted mt-2.5 max-w-[300px] leading-relaxed">
        {done
          ? 'Welcome in. Your badge is live and everything is unlocked.'
          : 'This usually takes seconds. Some accounts get a quick human review.'}
      </p>

      <div className="w-full max-w-[300px] mt-8">
        <ProgressBar value={progress} />
      </div>

      <div className="mt-7 space-y-3 w-full max-w-[300px]">
        {steps.map((s, i) => {
          const active = i === stepIdx && !done
          const complete = done || i < stepIdx
          return (
            <div key={s} className="flex items-center gap-3 text-left">
              <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 transition-colors ${complete ? 'brand-fill text-white' : active ? 'bg-brand-500/15 text-brand-500' : 'elev muted'}`}>
                {complete ? <Icon name="check" size={11} strokeWidth={3.2} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
              </span>
              <span className={`text-[13.5px] ${complete ? 'muted' : active ? 'font-medium' : 'muted opacity-60'}`}>{s}</span>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[300px] mt-9">
            <Button full size="lg" onClick={onDone}>Enter Leenk</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
