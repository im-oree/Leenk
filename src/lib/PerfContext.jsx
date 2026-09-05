import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectTier, watchFrameRate, tierFlags } from './perf'

const PerfCtx = createContext({ tier: 'high', flags: tierFlags('high') })

export function PerfProvider({ children }) {
  const [tier, setTier] = useState(() => detectTier())

  useEffect(() => {
    const stop = watchFrameRate(() => {
      setTier((t) => (t === 'high' ? 'mid' : 'low'))
    })
    return stop
  }, [])

  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('perf-low', tier === 'low')
    el.classList.toggle('perf-mid', tier === 'mid')
    el.dataset.perf = tier
  }, [tier])

  const value = useMemo(() => ({ tier, flags: tierFlags(tier) }), [tier])
  return <PerfCtx.Provider value={value}>{children}</PerfCtx.Provider>
}

export const usePerf = () => useContext(PerfCtx)
