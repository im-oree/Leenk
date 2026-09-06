import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

/**
 * Connectivity awareness.
 *
 * `navigator.onLine` only tells you the radio is up, not that anything is
 * reachable — captive portals and dead backends both report "online". So we
 * pair it with a lightweight reachability probe against our own health
 * endpoint, and expose the honest answer.
 */

const NetworkContext = createContext({
  online: true,
  reachable: true,
  slow: false,
  since: null,
  retry: () => {},
})

import { USE_API } from './api'

const PROBE_URL = '/api'
const PROBE_TIMEOUT = 6000

export function NetworkProvider({ children }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [reachable, setReachable] = useState(true)
  const [slow, setSlow] = useState(false)
  const [since, setSince] = useState(null)
  const timer = useRef(null)

  const probe = useCallback(async () => {
    // In mock mode there is no backend to reach, so probing would report the
    // app as offline on a perfectly healthy machine. Only the radio matters.
    if (!USE_API) {
      const up = typeof navigator === 'undefined' ? true : navigator.onLine
      setReachable(up)
      return up
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setReachable(false)
      return false
    }
    const started = performance.now()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT)
    try {
      const res = await fetch(PROBE_URL, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
      const ms = performance.now() - started
      setSlow(ms > 2000)
      setReachable(res.ok)
      if (res.ok) setSince(null)
      return res.ok
    } catch {
      setReachable(false)
      return false
    } finally {
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const goOnline = () => { setOnline(true); probe() }
    const goOffline = () => { setOnline(false); setReachable(false); setSince(Date.now()) }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    // Also react to the Network Information API where it exists (Android).
    const conn = navigator.connection
    const onChange = () => {
      if (conn) setSlow(['slow-2g', '2g'].includes(conn.effectiveType) || conn.saveData === true)
    }
    onChange()
    conn?.addEventListener?.('change', onChange)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      conn?.removeEventListener?.('change', onChange)
    }
  }, [probe])

  // Back off while offline rather than hammering: 5s, then 15s.
  useEffect(() => {
    if (reachable) {
      if (timer.current) clearInterval(timer.current)
      return
    }
    if (!since) setSince(Date.now())
    const delay = since && Date.now() - since > 30_000 ? 15_000 : 5000
    timer.current = setInterval(probe, delay)
    return () => clearInterval(timer.current)
  }, [reachable, since, probe])

  return (
    <NetworkContext.Provider value={{ online, reachable, slow, since, retry: probe }}>
      {children}
    </NetworkContext.Provider>
  )
}

export const useNetwork = () => useContext(NetworkContext)
export default NetworkContext
