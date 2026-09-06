/**
 * Offline cache (IndexedDB).
 *
 * Two jobs:
 *   1. Show something instantly on open instead of a spinner, then refresh.
 *   2. Keep the app readable with no connection.
 *
 * Deliberately NOT cached:
 *   - the swipe stack. Cards are ranked live, respect a daily quota, and can
 *     be withdrawn by a block or unmatch. Serving a stale card risks showing
 *     someone who blocked you, and a swipe made offline could be acted on
 *     against data that has since changed. Discovery must be online.
 *   - anything from /api/map. Location has an 8h TTL server-side; a cached
 *     pin would outlive the consent that produced it.
 *
 * Messages ARE cached, keyed per match, and we only ever fetch the delta
 * after the newest cached message — refetching an entire thread on every open
 * is the main reason chat feels slow on a campus network.
 *
 * localStorage is not used: it is synchronous (jank on the main thread) and
 * caps around 5MB. IndexedDB is async and holds far more.
 */

const DB_NAME = 'leenk-cache'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise = null

const available = () => typeof indexedDB !== 'undefined'

function open() {
  if (!available()) return Promise.reject(new Error('IndexedDB unavailable'))
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((err) => {
    // Private browsing and some webviews block IndexedDB outright. Cache
    // becomes a no-op rather than breaking the app.
    dbPromise = null
    throw err
  })

  return dbPromise
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const req = fn(store)
    t.onabort = () => reject(t.error)
    t.onerror = () => reject(t.error)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

/** Read a cached value, or null when missing/expired. */
export async function cacheGet(key, { maxAgeMs } = {}) {
  try {
    const hit = await tx('readonly', (s) => s.get(key))
    if (!hit) return null
    if (maxAgeMs && Date.now() - hit.at > maxAgeMs) return null
    return hit
  } catch {
    return null
  }
}

export async function cacheSet(key, value) {
  try {
    await tx('readwrite', (s) => s.put({ value, at: Date.now() }, key))
    return true
  } catch {
    return false
  }
}

export async function cacheDelete(key) {
  try { await tx('readwrite', (s) => s.delete(key)); return true } catch { return false }
}

/** Wipe everything. Called on sign-out — cached data must not outlive a session. */
export async function cacheClear() {
  try { await tx('readwrite', (s) => s.clear()); return true } catch { return false }
}

/**
 * Stale-while-revalidate.
 *
 * Calls `onData` up to twice: once immediately with cached data (if any), then
 * again with fresh data once the network returns. That is what makes a screen
 * feel instant while still being correct.
 *
 * @returns {Promise<{data, stale, fromCache}>}
 */
export async function swr(key, fetcher, { maxAgeMs = 5 * 60_000, onData } = {}) {
  const cached = await cacheGet(key)
  let served = false

  if (cached) {
    served = true
    onData?.(cached.value, { stale: true, at: cached.at })
  }

  try {
    const fresh = await fetcher()
    await cacheSet(key, fresh)
    onData?.(fresh, { stale: false, at: Date.now() })
    return { data: fresh, stale: false, fromCache: false }
  } catch (err) {
    // Offline or the request failed. Stale data beats an error screen, but the
    // caller is told it is stale so it can say so.
    if (served) return { data: cached.value, stale: true, fromCache: true, error: err }
    throw err
  }
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

const msgKey = (matchId) => `messages:${matchId}`

/** Cap per thread: enough to scroll back meaningfully, bounded on disk. */
const MAX_CACHED_MESSAGES = 200

export async function getCachedMessages(matchId) {
  const hit = await cacheGet(msgKey(matchId))
  return hit?.value || []
}

/**
 * Merge new messages into the cached thread.
 *
 * Deduplicates by id, because an optimistic local echo and the server copy of
 * the same message would otherwise both appear.
 */
export async function mergeMessages(matchId, incoming = []) {
  const existing = await getCachedMessages(matchId)
  const byId = new Map()
  for (const m of existing) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m })

  const merged = [...byId.values()]
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-MAX_CACHED_MESSAGES)

  await cacheSet(msgKey(matchId), merged)
  return merged
}

/**
 * Timestamp of the newest cached message, for delta fetching.
 * Returns null when nothing is cached, meaning "fetch the recent page".
 */
export async function newestMessageAt(matchId) {
  const msgs = await getCachedMessages(matchId)
  if (!msgs.length) return null
  return msgs[msgs.length - 1].at || null
}

/** Unmatch or delete-chat must remove the local copy too. */
export const dropThread = (matchId) => cacheDelete(msgKey(matchId))

/* ------------------------------------------------------------------ *
 * Keys
 * ------------------------------------------------------------------ */

export const KEYS = {
  feed: (mode) => `feed:${mode}`,
  matches: 'matches',
  profile: (uid) => `profile:${uid}`,
  me: 'me',
  stories: 'stories',
  notifications: 'notifications',
}

/** TTLs by kind. Chat and matches go stale fastest. */
export const TTL = {
  feed: 5 * 60_000,
  matches: 60_000,
  profile: 10 * 60_000,
  me: 10 * 60_000,
  stories: 2 * 60_000,
  notifications: 60_000,
}
