import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/** Ordered onboarding route steps — progressive, one decision per screen. */
export const STEPS = [
  { path: '/onboarding/phone', label: 'Phone' },
  { path: '/onboarding/verify-code', label: 'Code' },
  { path: '/onboarding/appearance', label: 'Look' },
  { path: '/onboarding/name', label: 'Name' },
  { path: '/onboarding/birthdate', label: 'Age' },
  { path: '/onboarding/gender', label: 'Gender' },
  { path: '/onboarding/campus', label: 'Campus' },
  { path: '/onboarding/study', label: 'Study' },
  { path: '/onboarding/intent', label: 'Intent' },
  { path: '/onboarding/photos', label: 'Photos' },
  { path: '/onboarding/prompts', label: 'Prompts' },
  { path: '/onboarding/verify-intro', label: 'Verify' },
]

const Ctx = createContext(null)

const emptyDraft = {
  phone: '',
  dialCode: '+234',
  name: '',
  birthdate: '',
  gender: '',
  campusId: '',
  department: '',
  level: '',
  intent: '',
  photos: [],
  prompts: [],
  bio: '',
}

export function OnboardingProvider({ children }) {
  const [draft, setDraft] = useState(emptyDraft)
  const navigate = useNavigate()

  const patch = useCallback((p) => setDraft((d) => ({ ...d, ...p })), [])

  const indexOf = useCallback((pathname) => STEPS.findIndex((s) => s.path === pathname), [])

  const next = useCallback(
    (pathname) => {
      const i = indexOf(pathname)
      const to = STEPS[i + 1]
      if (to) navigate(to.path)
    },
    [indexOf, navigate],
  )

  const back = useCallback(
    (pathname) => {
      const i = indexOf(pathname)
      if (i <= 0) navigate('/onboarding')
      else navigate(STEPS[i - 1].path)
    },
    [indexOf, navigate],
  )

  const value = useMemo(() => ({ draft, patch, next, back, indexOf, total: STEPS.length }), [draft, patch, next, back, indexOf])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useOnboarding = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOnboarding outside provider')
  return ctx
}
