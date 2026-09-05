import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Async data hook with the four states every screen actually needs:
 * loading, error, empty, ready — plus retry.
 *
 * Avoids the two classic bugs:
 *   - setState after unmount (guarded by `alive`)
 *   - a slow first request overwriting a fast second one (guarded by `seq`)
 */
export function useAsync(fn, deps = [], { immediate = true, initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const alive = useRef(true)
  const seq = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const run = useCallback(async (...args) => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const result = await fn(...args)
      if (!alive.current || id !== seq.current) return result
      setData(result)
      return result
    } catch (err) {
      if (alive.current && id === seq.current) setError(err)
      throw err
    } finally {
      if (alive.current && id === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) run().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, run, retry: run, setData }
}

/**
 * Optimistic mutation: apply locally now, roll back if the server disagrees.
 * Used for likes, follows, story views — anything that must feel instant.
 */
export function useOptimistic(commit) {
  const [pending, setPending] = useState(false)

  const mutate = useCallback(
    async (applyLocal, rollback, ...args) => {
      applyLocal()
      setPending(true)
      try {
        return await commit(...args)
      } catch (err) {
        rollback?.()
        throw err
      } finally {
        setPending(false)
      }
    },
    [commit],
  )

  return { mutate, pending }
}

export default useAsync
