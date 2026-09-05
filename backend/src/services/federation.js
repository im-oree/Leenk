/**
 * StudentHub -> Leenk post federation.
 *
 * Direction is ONE WAY and read-only, per product decision:
 *   StudentHub posts appear INLINE in the Leenk feed.
 *   Leenk posts NEVER flow back to StudentHub.
 *   Subscriptions are entirely separate — a StudentHub sub grants nothing here.
 *
 * Design constraints that shaped this file:
 *
 *  1. StudentHub being down must never break the Leenk feed. Every failure
 *     path returns [] and the feed renders as a normal Leenk-only feed.
 *  2. We never write federated posts into the `posts` collection. They are
 *     merged at read time. Copying them would mean a delete or edit on
 *     StudentHub leaves a stale ghost in Leenk that we have no way to reap.
 *  3. Federated posts are NOT interactive in Leenk. No likes, no comments,
 *     no follow. They are `readOnly: true` and the client renders them as
 *     such. Faking interactivity would imply writes we've decided not to do.
 *  4. Leenk's own blocks and campus scoping still apply. A student blocked
 *     on Leenk stays invisible even if StudentHub happily serves their post.
 */

import { db } from '../lib/firebase.js'
import { config } from '../lib/config.js'
import { getConfig } from './appConfig.js'

const SH = config.studentHub

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ *
 * The feed is the hottest path in the app and StudentHub is a network
 * hop away. We cache per campus for a short TTL: long enough that a
 * feed refresh doesn't hammer StudentHub, short enough that campus
 * announcements still feel timely.
 */

const cache = new Map()   // campusId -> { at, items }

function cached(campusId, ttlMs) {
  const hit = cache.get(campusId)
  if (hit && Date.now() - hit.at < ttlMs) return hit.items
  return null
}

/**
 * Circuit breaker. If StudentHub is failing we stop calling it for a
 * while rather than making every single feed request pay the timeout.
 */
let failures = 0
let openUntil = 0

function breakerOpen() { return Date.now() < openUntil }

function recordFailure(cooldownMs) {
  failures += 1
  if (failures >= 3) {
    openUntil = Date.now() + cooldownMs
    failures = 0
  }
}

function recordSuccess() { failures = 0; openUntil = 0 }

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/**
 * Map a StudentHub post onto Leenk's post shape.
 *
 * StudentHub is a different product with a different schema, so we are
 * strict about what we accept: anything missing an id, author or body is
 * dropped rather than rendered as a broken card. We also prefix the id so
 * a federated post can never collide with a Leenk post id.
 */
export function normalizePost(raw, { campusId } = {}) {
  if (!raw || typeof raw !== 'object') return null

  const id = raw.id || raw._id || raw.postId
  if (!id) return null

  const author = raw.author || raw.user || {}
  const authorName = author.fullName || author.name || raw.authorName
  if (!authorName) return null

  const caption = String(raw.body ?? raw.caption ?? raw.content ?? '').slice(0, 2000)
  const media = raw.mediaUrl || raw.image || raw.imageUrl || (Array.isArray(raw.media) ? raw.media[0]?.url : null)

  // A post with neither text nor media is not worth a slot in the feed.
  if (!caption && !media) return null

  const createdAtMs = Number(
    raw.createdAtMs ?? (raw.createdAt ? Date.parse(raw.createdAt) : NaN),
  )

  return {
    id: `sh_${id}`,
    source: 'studenthub',
    readOnly: true,              // no likes/comments/follow in Leenk
    sourceUrl: raw.url || raw.permalink || null,
    mediaUrl: media || null,
    mediaType: raw.mediaType === 'video' ? 'video' : media ? 'image' : 'none',
    caption,
    kind: raw.kind || raw.type || 'post',   // e.g. announcement, event
    visibility: 'campus',
    campusId: raw.campusId || campusId || null,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
    // Counts are display-only; they come from StudentHub and we never mutate them.
    likeCount: Number(raw.likeCount) || 0,
    commentCount: Number(raw.commentCount) || 0,
    liked: false,
    author: {
      uid: author.uid || author.id ? `sh_${author.uid || author.id}` : null,
      studentHubUid: author.uid || author.id || null,
      name: authorName,
      photo: author.avatarUrl || author.photo || author.profilePicture || null,
      campusId: raw.campusId || campusId || null,
      verified: Boolean(author.institutionalVerified || author.verified),
      official: Boolean(raw.official || author.isOfficial || author.role === 'admin'),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

/**
 * Pull recent StudentHub posts for a campus.
 * Always resolves — never throws into the feed handler.
 */
export async function fetchCampusPosts(campusId, { limit = 20 } = {}) {
  const cfg = (await getConfig()).federation || {}
  if (!cfg.enabled || !SH.enabled || !campusId) return []
  if (breakerOpen()) return []

  const hit = cached(campusId, cfg.cacheTtlMs ?? 120000)
  if (hit) return hit

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 2500)

  try {
    const url = `${SH.baseUrl}/api/shared-data/posts`
      + `?campusId=${encodeURIComponent(campusId)}&limit=${limit}`

    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(SH.writeKey ? { 'X-LEENK-KEY': SH.writeKey } : {}),
      },
    })
    if (!res.ok) throw new Error(`StudentHub ${res.status}`)

    const json = await res.json()
    const list = Array.isArray(json) ? json : json.posts || json.items || []

    const items = list
      .map((r) => normalizePost(r, { campusId }))
      .filter(Boolean)

    cache.set(campusId, { at: Date.now(), items })
    recordSuccess()
    return items
  } catch (err) {
    // Degrade silently. A campus announcement missing is a far smaller
    // failure than an empty or erroring feed.
    recordFailure(cfg.breakerCooldownMs ?? 60000)
    console.warn('[federation] StudentHub posts unavailable:', err.message)
    // Serve stale cache if we have any — better than nothing.
    return cache.get(campusId)?.items || []
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * Merge
 * ------------------------------------------------------------------ */

/**
 * Blend federated posts into an already-ranked Leenk feed.
 *
 * We do NOT re-rank the whole list together. StudentHub posts have no
 * Leenk engagement signal, so scoring them against Leenk posts would be
 * comparing two different scales. Instead we interleave at a fixed
 * spacing, which also bounds how much of the feed StudentHub can occupy.
 *
 * @param leenkPosts ranked Leenk posts
 * @param shPosts    normalized StudentHub posts
 */
export function mergeIntoFeed(leenkPosts, shPosts, { everyN = 5, maxShare = 0.25 } = {}) {
  if (!shPosts?.length) return leenkPosts
  if (!leenkPosts?.length) return shPosts.slice(0, 3)

  // Newest first, and never let federation dominate the feed.
  const budget = Math.max(1, Math.floor(leenkPosts.length * maxShare))
  const queue = [...shPosts]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, budget)

  const out = []
  let qi = 0
  for (let i = 0; i < leenkPosts.length; i += 1) {
    out.push(leenkPosts[i])
    // Never lead with a federated post — the first thing a user sees
    // should be their own campus's people, not an institutional feed.
    if ((i + 1) % everyN === 0 && qi < queue.length) {
      out.push(queue[qi])
      qi += 1
    }
  }
  return out
}

/**
 * Apply Leenk's own safety rules to federated content.
 * StudentHub doesn't know about Leenk blocks, so we enforce them here.
 */
export async function filterForViewer(items, viewerUid) {
  if (!items?.length) return []

  const snap = await db().collection('blocks').where('blockerUid', '==', viewerUid).get()
  const blocked = new Set(snap.docs.map((d) => d.data().blockedUid))
  if (!blocked.size) return items

  return items.filter((p) => {
    const uid = p.author?.uid
    const shUid = p.author?.studentHubUid
    // Block by either identity — the same human may be linked both ways.
    return !(uid && blocked.has(uid)) && !(shUid && blocked.has(`lk_${shUid}`))
  })
}

/** Test/ops hook: drop cached federation state. */
export function resetFederationCache() {
  cache.clear()
  failures = 0
  openUntil = 0
}
