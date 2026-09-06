/**
 * Behavioural event log — the training substrate for ranking (ALGORITHM.md §2).
 *
 * Two hard privacy rules, both enforced here rather than by convention:
 *   1. Write-only from the client. There is no read API for a user's own event
 *      log, so a stolen token cannot exfiltrate behavioural history.
 *   2. Never leaves Leenk. None of this is ever pushed to StudentHub.
 *
 * Writes are fire-and-forget and batched — analytics must never add latency to
 * a swipe or slow a feed request, and must never fail a user-facing call.
 */

import { db, FieldValue } from '../lib/firebase.js'

const EVENTS = new Set([
  'profile_view', 'photo_expand', 'swipe', 'match', 'unmatch',
  'message_sent', 'conversation_depth', 'report',
  'feed_dwell', 'post_like', 'post_comment', 'post_share',
  'profile_from_feed', 'story_view', 'story_complete',
  'session_start', 'session_end', 'stack_served', 'search',
])

const RETENTION_DAYS = 90

let queue = []
let timer = null

function flush() {
  if (!queue.length) return
  const batch = queue
  queue = []
  const chunk = batch.slice(0, 400)

  ;(async () => {
    try {
      const col = db().collection('events')
      await Promise.all(chunk.map((e) => col.add(e)))
    } catch {
      /* analytics loss is acceptable; user-facing paths must not care */
    }
  })()
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => { timer = null; flush() }, 2000)
  timer.unref?.()
}

/**
 * Record a behavioural event. Never throws, never awaited by request handlers.
 */
export function logEvent(uid, type, payload = {}) {
  if (!uid || !EVENTS.has(type)) return
  queue.push({
    uid,
    type,
    payload,
    at: Date.now(),
    expiresAt: Date.now() + RETENTION_DAYS * 86_400_000,
  })
  if (queue.length >= 50) flush()
  else schedule()
}

/**
 * Roll counters that ranking reads on the hot path. Kept on the user doc so
 * scoring needs one read, not an aggregation query.
 */
export async function bumpStats(uid, patch) {
  try {
    const inc = {}
    for (const [k, v] of Object.entries(patch)) inc[`stats.${k}`] = FieldValue.increment(v)
    await db().collection('users').doc(uid).set(inc, { merge: true })
  } catch { /* non-critical */ }
}

/** Dwell time is the most honest signal we collect — see ALGORITHM.md §2. */
export function logProfileView(uid, targetUid, { dwellMs, source, photosViewed } = {}) {
  logEvent(uid, 'profile_view', { targetUid, dwellMs, source, photosViewed })
}

export function logSwipe(uid, targetUid, direction, { dwellMs, position } = {}) {
  logEvent(uid, 'swipe', { targetUid, direction, dwellMs, position })
  bumpStats(uid, {
    swipesTotal: 1,
    ...(direction === 'right' || direction === 'super' ? { likesGiven: 1 } : {}),
  })
  bumpStats(targetUid, {
    impressions: 1,
    ...(direction === 'right' || direction === 'super' ? { likesReceived7d: 1 } : {}),
  })
}

export function flushEvents() { flush() }

export default { logEvent, logSwipe, logProfileView, bumpStats, flushEvents }
