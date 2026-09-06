import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import StepShell from './StepShell'
import { useOnboarding } from './OnboardingContext'
import Input from '../../components/ui/Input'
import Textarea from '../../components/ui/Textarea'
import Chip from '../../components/ui/Chip'
import Icon from '../../components/ui/Icon'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import { CAMPUSES, DEPARTMENTS, LEVELS, INTENTS, PROMPTS } from '../../lib/mock'
import { ageFromDate } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'
import { useStore } from '../../lib/store'
import { haptic } from '../../lib/haptics'

/* ------------------------------- 1. Phone ------------------------------- */
export function PhoneStep() {
  const { draft, patch } = useOnboarding()
  const valid = draft.phone.replace(/\D/g, '').length >= 10

  return (
    <StepShell
      title="What's your number?"
      subtitle="We text you a code to confirm it's really you. Your number is never shown on your profile."
      canContinue={valid}
      footerNote="Standard message rates may apply."
    >
      <div className="flex gap-2.5">
        <button className="flex items-center gap-1.5 px-4 h-[52px] rounded-2xl bg-[color:var(--app-elev)] border hairline shrink-0 font-medium text-[15px]">
          🇳🇬 {draft.dialCode}
          <Icon name="chevronDown" size={15} className="muted" />
        </button>
        <Input
          type="tel"
          inputMode="numeric"
          autoFocus
          placeholder="801 234 5678"
          value={draft.phone}
          onChange={(e) => patch({ phone: e.target.value.replace(/[^\d\s]/g, '') })}
          containerClassName="flex-1"
        />
      </div>
      <div className="flex items-start gap-2.5 mt-6 p-4 rounded-2xl bg-brand-500/[0.07]">
        <Icon name="lock" size={17} className="text-brand-500 shrink-0 mt-0.5" />
        <p className="text-[13px] leading-relaxed muted">
          Phone verification is the first of several checks. It stops throwaway accounts before they start.
        </p>
      </div>
    </StepShell>
  )
}

/* ------------------------------ 2. OTP code ----------------------------- */
export function CodeStep() {
  const { draft, next } = useOnboarding()
  const { pathname } = useLocation()
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [seconds, setSeconds] = useState(38)
  const refs = useRef([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const nextCode = [...code]
    nextCode[i] = d
    setCode(nextCode)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (nextCode.every(Boolean)) haptic('success')
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const onPaste = (e) => {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    const arr = ['', '', '', '', '', '']
    text.split('').forEach((c, i) => (arr[i] = c))
    setCode(arr)
    refs.current[Math.min(text.length, 5)]?.focus()
  }

  const complete = code.every(Boolean)

  return (
    <StepShell
      title="Enter your code"
      subtitle={`Sent to ${draft.dialCode} ${draft.phone || '••• ••• ••••'}`}
      canContinue={complete}
      onContinue={() => next(pathname)}
    >
      <div className="flex gap-2.5 justify-between" onPaste={onPaste}>
        {code.map((d, i) => (
          <motion.input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            maxLength={1}
            animate={d ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 0.22 }}
            className={`w-full aspect-[3/4] max-w-[54px] rounded-2xl text-center font-display text-[26px] font-semibold bg-[color:var(--app-elev)] border outline-none transition-all duration-200 ${
              d ? 'border-brand-500/70 ring-brand-soft' : 'border-[color:var(--app-border)]'
            }`}
          />
        ))}
      </div>

      <div className="mt-7 text-center">
        {seconds > 0 ? (
          <p className="text-[13.5px] muted tabular-nums">Resend code in 0:{String(seconds).padStart(2, '0')}</p>
        ) : (
          <Button variant="ghost" size="sm" icon="refresh" onClick={() => setSeconds(38)}>
            Resend code
          </Button>
        )}
      </div>
    </StepShell>
  )
}

/* ---------------------------- 3. Appearance ----------------------------- */
export function AppearanceStep() {
  const { theme, setTheme } = useTheme()
  const options = [
    { id: 'light', label: 'Light', desc: 'Clean and bright', icon: 'sun' },
    { id: 'dark', label: 'Dark', desc: 'Easy on the eyes', icon: 'moon' },
  ]

  return (
    <StepShell
      title="Pick your look"
      subtitle="You can change this any time in Settings."
    >
      <div className="grid grid-cols-2 gap-3.5">
        {options.map((o) => {
          const active = theme === o.id
          return (
            <motion.button
              key={o.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => { haptic('light'); setTheme(o.id) }}
              className={`relative rounded-3xl border-2 p-4 text-left transition-colors duration-300 overflow-hidden ${
                active ? 'border-brand-500' : 'border-[color:var(--app-border)]'
              }`}
            >
              <div
                className="rounded-2xl h-[132px] mb-3.5 p-3 flex flex-col gap-2 border"
                style={{
                  background: o.id === 'dark' ? '#050506' : '#ffffff',
                  borderColor: o.id === 'dark' ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)',
                }}
              >
                <div className="h-3 w-2/3 rounded-full" style={{ background: o.id === 'dark' ? '#2b2b32' : '#ededf0' }} />
                <div className="h-3 w-1/2 rounded-full" style={{ background: o.id === 'dark' ? '#2b2b32' : '#ededf0' }} />
                <div className="mt-auto flex gap-1.5">
                  <div className="h-7 flex-1 rounded-lg brand-fill" />
                  <div className="h-7 w-7 rounded-lg" style={{ background: o.id === 'dark' ? '#18181c' : '#f7f7f8' }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Icon name={o.icon} size={17} className={active ? 'text-brand-500' : 'muted'} />
                <span className="font-semibold text-[15px]">{o.label}</span>
                {active && (
                  <motion.span layoutId="theme-check" className="ml-auto w-5 h-5 rounded-full brand-fill grid place-items-center">
                    <Icon name="check" size={11} strokeWidth={3.4} className="text-white" />
                  </motion.span>
                )}
              </div>
              <p className="text-[12.5px] muted mt-0.5">{o.desc}</p>
            </motion.button>
          )
        })}
      </div>
    </StepShell>
  )
}

/* ------------------------------- 4. Name -------------------------------- */
export function NameStep() {
  const { draft, patch } = useOnboarding()
  return (
    <StepShell
      title="What should we call you?"
      subtitle="This is the name people see. Use the one your friends actually use."
      canContinue={draft.name.trim().length >= 2}
    >
      <Input
        autoFocus
        placeholder="First name"
        value={draft.name}
        onChange={(e) => patch({ name: e.target.value })}
        maxLength={24}
        hint="You can't change this often, so pick well."
      />
    </StepShell>
  )
}

/* ----------------------------- 5. Birthdate ----------------------------- */
export function BirthdateStep() {
  const { draft, patch } = useOnboarding()
  const age = ageFromDate(draft.birthdate)
  const tooYoung = age != null && age < 18
  const valid = age != null && age >= 18 && age < 100

  return (
    <StepShell
      title="When's your birthday?"
      subtitle="Leenk is 18+. We cross-check this against your student ID during verification."
      canContinue={valid}
      footerNote="Your age is shown on your profile — your birthday isn't."
    >
      <Input
        type="date"
        value={draft.birthdate}
        onChange={(e) => patch({ birthdate: e.target.value })}
        error={tooYoung ? 'You must be 18 or older to use Leenk.' : undefined}
      />
      <AnimatePresence>
        {valid && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 flex items-center gap-2.5 p-4 rounded-2xl bg-brand-500/[0.07]"
          >
            <Icon name="check" size={17} className="text-brand-500" strokeWidth={2.4} />
            <p className="text-[14px]">You'll appear as <strong>{age}</strong> on your profile.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </StepShell>
  )
}

/* ------------------------------ 6. Gender ------------------------------- */
export function GenderStep() {
  const { draft, patch } = useOnboarding()
  const opts = [
    { id: 'female', label: 'Woman' },
    { id: 'male', label: 'Man' },
    { id: 'nonbinary', label: 'Non-binary' },
    { id: 'other', label: 'Prefer to self-describe' },
  ]
  return (
    <StepShell title="How do you identify?" canContinue={!!draft.gender}>
      <div className="space-y-2.5">
        {opts.map((o) => {
          const active = draft.gender === o.id
          return (
            <motion.button
              key={o.id}
              whileTap={{ scale: 0.985 }}
              onClick={() => { haptic('light'); patch({ gender: o.id }) }}
              className={`w-full flex items-center gap-3 px-4 h-[58px] rounded-2xl border-2 text-left font-medium text-[15px] transition-colors duration-200 ${
                active ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'
              }`}
            >
              <span className="flex-1">{o.label}</span>
              <span className={`w-[22px] h-[22px] rounded-full border-2 grid place-items-center transition-colors ${active ? 'border-brand-500 brand-fill' : 'border-[color:var(--app-border)]'}`}>
                {active && <Icon name="check" size={11} strokeWidth={3.4} className="text-white" />}
              </span>
            </motion.button>
          )
        })}
      </div>
    </StepShell>
  )
}

/* ------------------------------ 7. Campus ------------------------------- */
export function CampusStep() {
  const { draft, patch } = useOnboarding()
  const [q, setQ] = useState('')
  const list = useMemo(
    () => CAMPUSES.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [q],
  )

  return (
    <StepShell
      title="Where do you study?"
      subtitle="Your home campus decides who you see first. You'll verify this next."
      canContinue={!!draft.campusId}
    >
      <Input icon="search" placeholder="Search your university" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-4 space-y-2">
        {list.map((c) => {
          const active = draft.campusId === c.id
          return (
            <motion.button
              key={c.id}
              layout
              whileTap={{ scale: 0.985 }}
              onClick={() => { haptic('light'); patch({ campusId: c.id }) }}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 text-left transition-colors duration-200 ${
                active ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'
              }`}
            >
              <span className="w-11 h-11 rounded-xl elev grid place-items-center shrink-0 font-display font-semibold text-[13px] text-brand-500">
                {c.short.slice(0, 3).toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-[15px] truncate">{c.name}</span>
                <span className="block text-[12.5px] muted mt-0.5">
                  {c.city} · {c.userCount.toLocaleString()} students
                </span>
              </span>
              {active && (
                <span className="w-5 h-5 rounded-full brand-fill grid place-items-center shrink-0">
                  <Icon name="check" size={11} strokeWidth={3.4} className="text-white" />
                </span>
              )}
            </motion.button>
          )
        })}
        {list.length === 0 && (
          <p className="text-[13.5px] muted text-center py-8">
            Not listed yet? We're adding campuses every week — tell us yours after signup.
          </p>
        )}
      </div>
    </StepShell>
  )
}

/* ------------------------------- 8. Study ------------------------------- */
export function StudyStep() {
  const { draft, patch } = useOnboarding()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const depts = DEPARTMENTS.filter((d) => d.toLowerCase().includes(q.toLowerCase()))

  return (
    <StepShell title="What do you study?" canContinue={!!draft.department && !!draft.level}>
      <button
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-3 px-4 h-[56px] rounded-2xl border-2 text-left transition-colors ${
          draft.department ? 'border-brand-500/60' : 'border-[color:var(--app-border)]'
        }`}
      >
        <Icon name="cap" size={19} className="muted" />
        <span className={`flex-1 text-[15px] ${draft.department ? 'font-medium' : 'muted'}`}>
          {draft.department || 'Choose your department'}
        </span>
        <Icon name="chevronRight" size={17} className="muted" />
      </button>

      <p className="text-[13px] font-medium muted mt-7 mb-3 ml-1">Your level</p>
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <Chip key={l} selected={draft.level === l} onClick={() => patch({ level: l })}>
            {l === 'Postgrad' ? l : `${l} level`}
          </Chip>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Department" subtitle="Search or scroll">
        <Input icon="search" placeholder="Search departments" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="mt-3 space-y-1 pb-2">
          {depts.map((d) => (
            <button
              key={d}
              onClick={() => { haptic('light'); patch({ department: d }); setOpen(false); setQ('') }}
              className={`w-full text-left px-4 py-3.5 rounded-xl text-[15px] transition-colors ${
                draft.department === d ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300 font-medium' : 'active:bg-[color:var(--app-elev)]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </Sheet>
    </StepShell>
  )
}

/* ------------------------------- 9. Intent ------------------------------ */
export function IntentStep() {
  const { draft, patch } = useOnboarding()
  return (
    <StepShell
      title="What are you here for?"
      subtitle="This shows on your profile so people know the vibe. Change it whenever."
      canContinue={!!draft.intent}
    >
      <div className="grid gap-3">
        {INTENTS.map((it, i) => {
          const active = draft.intent === it.id
          return (
            <motion.button
              key={it.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.34 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { haptic('light'); patch({ intent: it.id }) }}
              className={`relative overflow-hidden p-4 rounded-3xl border-2 text-left transition-colors duration-200 ${
                active ? 'border-brand-500 bg-brand-500/[0.06]' : 'border-[color:var(--app-border)]'
              }`}
            >
              <p className="font-display text-[17px] font-semibold tracking-[-0.02em]">{it.label}</p>
              <p className="text-[13.5px] muted mt-0.5">{it.blurb}</p>
              {active && (
                <motion.span
                  layoutId="intent-dot"
                  className="absolute top-4 right-4 w-5 h-5 rounded-full brand-fill grid place-items-center"
                >
                  <Icon name="check" size={11} strokeWidth={3.4} className="text-white" />
                </motion.span>
              )}
            </motion.button>
          )
        })}
      </div>
    </StepShell>
  )
}

/* ------------------------------ 10. Photos ------------------------------ */
export function PhotosStep() {
  const { draft, patch } = useOnboarding()
  const slots = 6
  const filled = draft.photos.filter(Boolean).length

  const addPhoto = (i) => {
    haptic('light')
    const photos = [...draft.photos]
    photos[i] = `https://picsum.photos/seed/up${i}${Date.now() % 999}/800/1100`
    patch({ photos })
  }
  const removePhoto = (i) => {
    haptic('light')
    const photos = [...draft.photos]
    photos.splice(i, 1)
    patch({ photos })
  }

  return (
    <StepShell
      title="Add your photos"
      subtitle="At least 2. Clear face in the first one — it also helps verification match you."
      canContinue={filled >= 2}
      footerNote={filled < 2 ? `${2 - filled} more to go` : 'Drag to reorder later in your profile.'}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: slots }).map((_, i) => {
          const src = draft.photos[i]
          return (
            <motion.button
              key={i}
              layout
              whileTap={{ scale: 0.96 }}
              onClick={() => (src ? removePhoto(i) : addPhoto(i))}
              className={`relative aspect-[3/4] rounded-2xl overflow-hidden border-2 border-dashed transition-colors ${
                src ? 'border-transparent' : 'border-[color:var(--app-border)] elev'
              }`}
            >
              {src ? (
                <>
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm grid place-items-center">
                    <Icon name="close" size={12} strokeWidth={2.6} className="text-white" />
                  </span>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/55 text-white backdrop-blur-sm">
                      Main
                    </span>
                  )}
                </>
              ) : (
                <span className="w-full h-full grid place-items-center muted">
                  <Icon name="plus" size={22} />
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      <div className="flex items-start gap-2.5 mt-6 p-4 rounded-2xl elev">
        <Icon name="info" size={17} className="muted shrink-0 mt-0.5" />
        <p className="text-[12.5px] leading-relaxed muted">
          No group shots as your main photo, no photos of other people without them knowing.
        </p>
      </div>
    </StepShell>
  )
}

/* ------------------------------ 11. Prompts ----------------------------- */
export function PromptsStep() {
  const { draft, patch, next } = useOnboarding()
  const { pathname } = useLocation()
  const [picking, setPicking] = useState(null)
  const prompts = draft.prompts

  const setAnswer = (i, a) => {
    const p = [...prompts]
    p[i] = { ...p[i], a }
    patch({ prompts: p })
  }
  const choose = (q) => {
    const p = [...prompts]
    p[picking] = { q, a: '' }
    patch({ prompts: p })
    setPicking(null)
  }

  const done = prompts.filter((p) => p?.q && p?.a?.trim()).length >= 1

  return (
    <StepShell
      title="Say something real"
      subtitle="Prompts get 3× more replies than a blank bio. Answer at least one."
      canContinue={done}
      onSkip={() => next(pathname)}
    >
      <div className="space-y-3">
        {[0, 1, 2].map((i) => {
          const p = prompts[i]
          return (
            <motion.div layout key={i} className="rounded-3xl border-2 border-[color:var(--app-border)] overflow-hidden">
              <button
                onClick={() => setPicking(i)}
                className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left active:bg-[color:var(--app-elev)]"
              >
                <span className={`flex-1 text-[14.5px] ${p?.q ? 'font-curvy italic text-brand-500 text-[16px]' : 'muted'}`}>
                  {p?.q || `Choose prompt ${i + 1}`}
                </span>
                <Icon name="chevronDown" size={16} className="muted" />
              </button>
              <AnimatePresence>
                {p?.q && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <div className="px-3 pb-3">
                      <Textarea
                        rows={3}
                        maxLength={160}
                        placeholder="Your answer…"
                        value={p.a || ''}
                        onChange={(e) => setAnswer(i, e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title="Pick a prompt">
        <div className="space-y-1 pb-2">
          {PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => { haptic('light'); choose(q) }}
              className="w-full text-left px-4 py-3.5 rounded-xl font-curvy italic text-[16.5px] active:bg-[color:var(--app-elev)]"
            >
              {q}
            </button>
          ))}
        </div>
      </Sheet>
    </StepShell>
  )
}

/* --------------------------- 12. Verify intro --------------------------- */
export function VerifyIntroStep() {
  const navigate = useNavigate()
  const { draft } = useOnboarding()
  const { dispatch } = useStore()

  const layers = [
    { icon: 'mail', title: 'Institutional check', body: 'School email, registrar match, or your student ID card.' },
    { icon: 'face', title: 'Live selfie', body: 'A quick liveness check, matched against your ID photo.' },
    { icon: 'users', title: 'Community signals', body: 'Peer vouching and reports keep the network honest over time.' },
  ]

  return (
    <StepShell
      title="One last thing"
      subtitle="Verification is what makes Leenk worth being on. It takes about two minutes."
      continueLabel="Start verification"
      onContinue={() => {
        dispatch({
          type: 'onboard/complete',
          profile: {
            name: draft.name || 'You',
            campusId: draft.campusId || 'babcock',
            department: draft.department || 'Computer Science',
            level: draft.level || '200',
            intent: draft.intent || 'open',
            photos: draft.photos.filter(Boolean).length ? draft.photos.filter(Boolean) : undefined,
            prompts: draft.prompts.filter((p) => p?.q && p?.a),
          },
        })
        dispatch({ type: 'verify/set', status: 'pending' })
        navigate('/verify')
      }}
      footerNote="Your ID and selfie are encrypted and only used for verification."
    >
      <div className="space-y-3">
        {layers.map((l, i) => (
          <motion.div
            key={l.title}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.09, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex gap-3.5 p-4 rounded-3xl surface"
          >
            <span className="w-10 h-10 rounded-2xl bg-brand-500/10 text-brand-500 grid place-items-center shrink-0">
              <Icon name={l.icon} size={19} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-[15px]">{l.title}</span>
              <span className="block text-[13px] muted mt-1 leading-relaxed">{l.body}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </StepShell>
  )
}
