import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Page from '../../components/layout/Page'
import Header from '../../components/layout/Header'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Icon from '../../components/ui/Icon'
import { LogoMark } from '../../components/brand/Logo'
import { auth } from '../../lib/data'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'

/**
 * Sign in to an EXISTING account.
 *
 * Previously "I already have an account" dropped you into the signup flow,
 * which asks a returning user to re-enter their name, birthdate, campus and
 * photos. This is the short path: number, code, done.
 *
 * Note the deliberate lack of feedback about whether a number is registered.
 * Telling someone "no account found" turns this screen into a way to check who
 * is on Leenk, which on a dating app is a genuine safety problem.
 */
export default function Login() {
  const navigate = useNavigate()
  const { dispatch, toast } = useStore()

  const [step, setStep] = useState('phone')   // phone | code
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => {
    if (step === 'code') setTimeout(() => codeRef.current?.focus(), 340)
  }, [step])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const valid = phone.replace(/\D/g, '').length >= 10

  const sendCode = async () => {
    if (!valid || busy) return
    setBusy(true); setError(null)
    haptic('light')
    try {
      await auth.login(phone)
      setStep('code')
      setResendIn(30)
      haptic('success')
    } catch (e) {
      setError(e.message || 'Could not send a code right now.')
      haptic('error')
    } finally { setBusy(false) }
  }

  const verify = async () => {
    if (code.length < 4 || busy) return
    setBusy(true); setError(null)
    try {
      const res = await auth.login(phone, code)
      haptic('success')
      dispatch({
        type: 'hydrate',
        data: {
          authed: true,
          onboarded: res.user?.onboardingComplete !== false,
          me: res.user || undefined,
          verificationStatus: res.user?.verificationStatus || 'pending',
        },
      })
      toast('Welcome back')
      navigate(res.user?.onboardingComplete === false ? '/onboarding/name' : '/app/feed', { replace: true })
    } catch (e) {
      setError(e.message || 'That code did not match.')
      setCode('')
      haptic('error')
    } finally { setBusy(false) }
  }

  return (
    <Page
      nav={false}
      swipeBack
      onSwipeBack={() => (step === 'code' ? setStep('phone') : navigate(-1))}
      header={
        <Header
          back
          onBack={() => (step === 'code' ? setStep('phone') : navigate(-1))}
          title=""
        />
      }
    >
      <div className="flex-1 flex flex-col px-6 max-w-[460px] w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="pt-2"
        >
          <LogoMark size={40} />
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.03em] mt-5">
            {step === 'phone' ? 'Welcome back' : 'Check your messages'}
          </h1>
          <p className="text-[14px] muted mt-1.5 leading-relaxed">
            {step === 'phone'
              ? 'Sign in with the number on your account.'
              : `We sent a 6-digit code to ${phone}.`}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === 'phone' ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.26 }}
              className="mt-7"
            >
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                icon="phone"
                placeholder="+234 800 000 0000"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
              />
            </motion.div>
          ) : (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.26 }}
              className="mt-7"
            >
              <Input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="text-center text-[22px] tracking-[0.42em] font-semibold"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && verify()}
              />

              <button
                disabled={resendIn > 0 || busy}
                onClick={sendCode}
                className="text-[13px] muted mt-3.5 mx-auto block disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-1.5 text-[12.5px] text-red-500 mt-3.5"
            >
              <Icon name="alert" size={14} className="shrink-0 mt-[1px]" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <span className="flex-1" />

        <div className="pb-8 space-y-3 safe-bottom">
          <Button
            full
            size="lg"
            loading={busy}
            disabled={step === 'phone' ? !valid : code.length < 4}
            onClick={step === 'phone' ? sendCode : verify}
          >
            {step === 'phone' ? 'Send code' : 'Sign in'}
          </Button>

          {step === 'phone' && (
            <Button full size="lg" variant="ghost" onClick={() => navigate('/onboarding/phone')}>
              Create an account instead
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}
