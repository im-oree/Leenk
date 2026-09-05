import { db, FieldValue } from '../lib/firebase.js'
import { getConfig } from './appConfig.js'
import { config } from '../lib/config.js'

/**
 * Campus map — pin visibility, k-anonymity, and anti-stalking.
 *
 * Implements backend/docs/MAP_AND_ANTISTALKING.md. The safety rules are not
 * optional decoration; each one closes a specific attack:
 *
 *  - opt-in, default OFF                  nobody is on the map by accident
 *  - snapped cells (already done at       jitter would average out over many
 *    ingest, never re-randomised)         samples and leak the true point
 *  - k-anonymity >= 3 per cell            you are never the only dot in a cell
 *  - publish delay 10-30 min              defeats real-time interception
 *  - staleness buckets, not timestamps    "8 min ago" + a cell ~= realtime
 *  - no history, one current cell         no pattern-of-life dossier
 *  - unmatch/block removes presence       revocable, both directions
 *
 * Ghost mode is FREE (product decision): you see the map without appearing.
 * Charging for a safety control is indefensible.
 */

const DEFAULTS = {
  enabled: true,
  visibilityDefault: 'off',        // off | campus | matches
  kAnonymity: 3,
  minPublishDelayMs: 10 * 60 * 1000,
  maxPublishDelayMs: 30 * 60 * 1000,
  pinTtlMs: 8 * 60 * 60 * 1000,    // pins expire after 8h with no update
  tileStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
  tileStyleUrlDark: 'https://tiles.openfreemap.org/styles/dark',
}

export const mapConfig = () => ({ ...DEFAULTS, ...(getConfig('map') || {}) })

/* --------------------------- staleness buckets --------------------------- */

/**
 * Never expose a precise timestamp. A tight "last seen" plus a 250m cell is
 * close enough to realtime to enable interception.
 */
export function stalenessLabel(at, now = Date.now()) {
  const mins = (now - at) / 60000
  if (mins < 15) return 'Just now'
  if (mins < 60 * 12) return 'Today'
  if (mins < 60 * 36) return 'Yesterday'
  return 'This week'
}

/* ------------------------------ visibility ------------------------------- */

export function getVisibility(user) {
  const m = user?.mapSettings || {}
  return {
    visibility: m.visibility || DEFAULTS.visibilityDefault,
    ghost: Boolean(m.ghost),
    hiddenFrom: m.hiddenFrom || [],
  }
}

/**
 * Can `viewer` see `target` on the map? Fails CLOSED at every branch.
 */
export function canSee(viewer, target, ctx) {
  if (!viewer || !target) return false
  if (viewer.uid === target.uid) return true

  const t = getVisibility(target)
  if (t.visibility === 'off') return false
  // Ghost mode: sees others, is never seen.
  if (t.ghost) return false
  // Quiet per-person hiding — safer than blocking, which can escalate a
  // situation in the physical world.
  if (t.hiddenFrom.includes(viewer.uid)) return false
  // Blocks remove presence in BOTH directions, permanently.
  if (ctx.blocked) return false
  if (t.visibility === 'matches' && !ctx.matched) return false
  if (t.visibility === 'campus' && viewer.campusId !== target.campusId) return false
  return true
}

/* ----------------------------- publish delay ----------------------------- */

/**
 * A pin is only publishable once the delay has elapsed. The delay is
 * randomised per user per cell (deterministic from uid+cell, so it doesn't
 * re-roll on every read and leak timing information).
 */
export function publishDelayFor(uid, cellId) {
  const c = mapConfig()
  const span = c.maxPublishDelayMs - c.minPublishDelayMs
  let h = 0
  const s = `${uid}:${cellId}`
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return c.minPublishDelayMs + (h % Math.max(span, 1))
}

export const isPublishable = (loc, now = Date.now()) =>
  loc?.at != null && now - loc.at >= publishDelayFor(loc.uid, loc.cellId)

/* -------------------------------- the map -------------------------------- */

/**
 * Build the set of pins `viewer` may see.
 *
 * Order matters: filter by permission FIRST, then apply k-anonymity to the
 * surviving set. Doing it the other way round would let an attacker infer a
 * hidden user's presence from the cell counts.
 */
export async function buildMap(viewer) {
  const c = mapConfig()
  if (!c.enabled) return { pins: [], clusters: [], enabled: false }

  const now = Date.now()
  const cutoff = now - c.pinTtlMs

  const [locSnap, matchSnap, blockA, blockB] = await Promise.all([
    db().collection('userLocations').where('campusId', '==', viewer.campusId).get(),
    db().collection('matches').where('users', 'array-contains', viewer.uid).get(),
    db().collection('blocks').where('blockerUid', '==', viewer.uid).get(),
    db().collection('blocks').where('blockedUid', '==', viewer.uid).get(),
  ])

  const matched = new Set()
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (m.status !== 'active') continue      // unmatch revokes immediately
    for (const u of m.users || []) if (u !== viewer.uid) matched.add(u)
  }
  const blocked = new Set([
    ...blockA.docs.map((d) => d.data().blockedUid),
    ...blockB.docs.map((d) => d.data().blockerUid),
  ])

  const fresh = locSnap.docs
    .map((d) => d.data())
    .filter((l) => l.at >= cutoff && l.uid !== viewer.uid)

  // Load the profiles we might show.
  const users = await Promise.all(
    fresh.map(async (l) => {
      const u = await db().collection('users').doc(l.uid).get()
      return u.exists ? { loc: l, user: { uid: l.uid, ...u.data() } } : null
    }),
  )

  const permitted = users.filter(Boolean).filter(({ loc, user }) =>
    canSee(viewer, user, { matched: matched.has(user.uid), blocked: blocked.has(user.uid) }) &&
    isPublishable(loc, now),
  )

  // k-anonymity on the PERMITTED set.
  const byCell = new Map()
  for (const p of permitted) {
    if (!byCell.has(p.loc.cellId)) byCell.set(p.loc.cellId, [])
    byCell.get(p.loc.cellId).push(p)
  }

  const pins = []
  let suppressed = 0
  for (const [cellId, group] of byCell) {
    if (group.length < c.kAnonymity) {
      // Below k: nobody in this cell gets a position. They fall back to the
      // campus-level "on campus" state, which carries no location.
      suppressed += group.length
      continue
    }
    for (const { loc, user } of group) {
      pins.push({
        uid: user.uid,
        name: user.name,
        photo: user.photos?.[0] || null,
        verified: user.verified !== false,
        lat: loc.lat,                  // already snapped at ingest
        lng: loc.lng,
        cellId,
        lastSeen: stalenessLabel(loc.at, now),   // bucket, never a timestamp
      })
    }
  }

  return {
    enabled: true,
    pins,
    onCampusCount: permitted.length,   // ambient count, no positions
    suppressed,                        // for our own metrics, not a leak
    kAnonymity: c.kAnonymity,
  }
}

/* --------------------------- anti-stalking ------------------------------- */

/**
 * Log that `viewer` looked at `target`, and return whether this viewer should
 * have their precision silently degraded.
 *
 * Per the doc: viewing behaviour is the strongest signal because it needs no
 * location inference. Co-location "following" detection is NOT implemented —
 * on a single campus, repeatedly sharing a lecture hall is the normal case and
 * that detector would be mostly false positives.
 *
 * The response is deliberately silent. Telling the viewer teaches evasion;
 * banning on these signals has too high a false-positive cost.
 */
export async function recordMapView(viewerUid, targetUid, ctx = {}) {
  if (viewerUid === targetUid) return { degrade: false }
  const ref = db().collection('users').doc(viewerUid).collection('mapViews').doc(targetUid)
  const snap = await ref.get()
  const prev = snap.exists ? snap.data() : null
  const now = Date.now()

  const next = {
    targetUid,
    count: (prev?.count || 0) + 1,
    firstAt: prev?.firstAt || now,
    lastAt: now,
    // The highest-risk transition in the product: viewing resumes right after
    // being rejected or unmatched.
    postUnmatchViews: (prev?.postUnmatchViews || 0) + (ctx.unmatched ? 1 : 0),
    interacted: prev?.interacted || Boolean(ctx.interacted),
  }
  await ref.set(next, { merge: true })

  // Co-occurrence, not any single signal.
  const heavy = next.count >= 12
  const noInteraction = !next.interacted
  const afterRejection = next.postUnmatchViews >= 3
  const degrade = (heavy && noInteraction) || afterRejection

  if (degrade) {
    await db().collection('moderationEvents').add({
      kind: 'MAP_VIEW_PATTERN',
      viewerUid, targetUid,
      count: next.count,
      postUnmatchViews: next.postUnmatchViews,
      interacted: next.interacted,
      at: now,
      // Fraud Ops owns this queue (Phase 2 §G), separate from content mod.
      queue: 'fraud-ops',
    }).catch(() => {})
  }

  return { degrade, views: next.count }
}

/** Has this viewer been degraded for this target? */
export async function isDegraded(viewerUid, targetUid) {
  const snap = await db().collection('users').doc(viewerUid)
    .collection('mapViews').doc(targetUid).get()
  if (!snap.exists) return false
  const v = snap.data()
  return (v.count >= 12 && !v.interacted) || (v.postUnmatchViews || 0) >= 3
}

/* ----------------------------- settings ---------------------------------- */

export async function setMapSettings(uid, patch) {
  const allowed = {}
  if (patch.visibility && ['off', 'campus', 'matches'].includes(patch.visibility)) {
    allowed.visibility = patch.visibility
  }
  if (typeof patch.ghost === 'boolean') allowed.ghost = patch.ghost
  if (Array.isArray(patch.hiddenFrom)) allowed.hiddenFrom = patch.hiddenFrom.slice(0, 500)

  await db().collection('users').doc(uid).set({ mapSettings: allowed }, { merge: true })

  // Turning visibility off must remove any live presence immediately, not
  // wait for the 8h TTL.
  if (allowed.visibility === 'off') {
    await db().collection('userLocations').doc(uid)
      .set({ at: 0, expiresAt: 0 }, { merge: true }).catch(() => {})
  }
  return allowed
}
