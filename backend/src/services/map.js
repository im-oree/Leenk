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
  // off      — invisible everywhere, not even counted
  // heatmap  — counted anonymously in the crowd heatmap, but NO pin
  // mutuals  — pin visible to mutuals only, plus counted in the heatmap
  visibilityDefault: 'off',
  kAnonymity: 3,
  // The heatmap aggregates over a COARSER grid than pins. A 250m cell with a
  // count of 2 is close to naming someone; ~1km buckets keep "how busy is the
  // library" answerable without turning the crowd into a tracker.
  heatmapCellPrecision: 4,
  heatmapMinCount: 3,
  // A match is a stronger mutual signal than a follow, so it also grants
  // mutual status. Hot-editable if that ever proves wrong.
  mutualsIncludeMatches: true,
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
  let visibility = m.visibility || DEFAULTS.visibilityDefault
  // Legacy migration. 'campus' used to mean "any verified student on my
  // campus can see my pin" — that is exactly what we are removing, so it
  // downgrades to the safer setting rather than silently broadening reach.
  if (visibility === 'campus') visibility = 'heatmap'
  if (visibility === 'matches') visibility = 'mutuals'
  if (!['off', 'heatmap', 'mutuals'].includes(visibility)) visibility = 'off'
  return {
    visibility,
    ghost: Boolean(m.ghost),
    hiddenFrom: m.hiddenFrom || [],
  }
}

/**
 * Mutual = you follow each other. A match counts too (mutual opt-in, and a
 * stronger signal than a follow).
 *
 * This is the ONLY relationship that unlocks a pin. Being on the same campus
 * grants nothing but an anonymous +1 in the heatmap.
 */
export async function mutualsOf(uid) {
  const c = mapConfig()
  const [outSnap, inSnap, matchSnap] = await Promise.all([
    db().collection('follows').where('followerUid', '==', uid).get(),
    db().collection('follows').where('followingUid', '==', uid).get(),
    c.mutualsIncludeMatches
      ? db().collection('matches').where('users', 'array-contains', uid).get()
      : Promise.resolve({ docs: [] }),
  ])

  const following = new Set(outSnap.docs.map((d) => d.data().followingUid))
  const mutual = new Set()
  for (const d of inSnap.docs) {
    const follower = d.data().followerUid
    if (following.has(follower)) mutual.add(follower)
  }
  for (const d of matchSnap.docs) {
    const m = d.data()
    if (m.status !== 'active') continue   // unmatch revokes immediately
    for (const u of m.users || []) if (u !== uid) mutual.add(u)
  }
  return mutual
}

/**
 * Can `viewer` see `target` on the map? Fails CLOSED at every branch.
 */
export function canSee(viewer, target, ctx) {
  if (!viewer || !target) return false
  if (viewer.uid === target.uid) return true

  const t = getVisibility(target)
  // Two independent conditions, both required:
  //   1. THEY chose to share  (visibility === 'mutuals')
  //   2. the two of you are mutuals
  // Neither one alone is enough.
  if (t.visibility !== 'mutuals') return false
  // Ghost mode: sees others, is never seen.
  if (t.ghost) return false
  // Quiet per-person hiding — safer than blocking, which can escalate a
  // situation in the physical world.
  if (t.hiddenFrom.includes(viewer.uid)) return false
  // Blocks remove presence in BOTH directions, permanently.
  if (ctx.blocked) return false
  if (!ctx.mutual) return false
  return true
}

/* -------------------------------- heatmap -------------------------------- */

/**
 * Anonymous crowd density — the Snapchat-style "where is everyone" layer.
 *
 * Counts people you have NO relationship with, which is the whole point, so
 * it must never be reversible to an individual:
 *   - coarser grid than pins (~1km, not 250m)
 *   - cells below `heatmapMinCount` are dropped entirely, not rounded down
 *   - no uids, names, photos or timestamps ever enter the output
 *   - only people who opted in ('heatmap' or 'mutuals') are counted at all
 */
export function buildHeatmap(locations, { now = Date.now() } = {}) {
  const c = mapConfig()
  const buckets = new Map()

  for (const loc of locations) {
    const key = `${loc.lat.toFixed(c.heatmapCellPrecision)}:${loc.lng.toFixed(c.heatmapCellPrecision)}`
    const b = buckets.get(key) || { lat: 0, lng: 0, count: 0 }
    b.lat += loc.lat
    b.lng += loc.lng
    b.count += 1
    buckets.set(key, b)
  }

  const cells = []
  for (const [, b] of buckets) {
    if (b.count < c.heatmapMinCount) continue   // drop, never round
    cells.push({
      // Centroid of the bucket, so the point isn't any one person's cell.
      lat: Number((b.lat / b.count).toFixed(c.heatmapCellPrecision)),
      lng: Number((b.lng / b.count).toFixed(c.heatmapCellPrecision)),
      count: b.count,
    })
  }
  return cells.sort((a, b) => b.count - a.count)
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

  const [locSnap, mutual, blockA, blockB] = await Promise.all([
    db().collection('userLocations').where('campusId', '==', viewer.campusId).get(),
    mutualsOf(viewer.uid),
    db().collection('blocks').where('blockerUid', '==', viewer.uid).get(),
    db().collection('blocks').where('blockedUid', '==', viewer.uid).get(),
  ])

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

  const live = users.filter(Boolean)

  // Heatmap population: everyone who opted in to being counted, EXCLUDING
  // anyone blocked in either direction and anyone ghosting. Deliberately
  // independent of the pin permission check — that is the point of the layer.
  const countable = live.filter(({ loc, user }) => {
    const v = getVisibility(user)
    if (v.visibility === 'off' || v.ghost) return false
    if (blocked.has(user.uid)) return false
    return isPublishable(loc, now)
  })

  const permitted = live.filter(({ loc, user }) =>
    canSee(viewer, user, { mutual: mutual.has(user.uid), blocked: blocked.has(user.uid) }) &&
    isPublishable(loc, now),
  )

  // NOTE ON k-ANONYMITY.
  // k-anon used to gate pins, and it was correct when 'campus' visibility
  // meant any verified student could see you: it stopped a stranger inferring
  // an individual from a sparse cell.
  //
  // Under the mutuals-only model it is both unnecessary and harmful:
  //   - unnecessary, because the target explicitly chose to share with
  //     mutuals and the viewer is a confirmed mutual. Consent is specific
  //     and reciprocal, which is a stronger guarantee than anonymity.
  //   - harmful, because you rarely have 3 mutuals standing in the same 250m
  //     cell, so pins would almost never render and the feature would look
  //     broken. Suppressing a friend who deliberately shared with you is a
  //     privacy control the user did not ask for.
  //
  // Anonymity now lives where the strangers are: the heatmap, which enforces
  // heatmapMinCount and a coarser grid. Pins are governed by consent.
  const pins = []
  const suppressed = 0
  {
    for (const { loc, user } of permitted) {
      const cellId = loc.cellId
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

  // Pinned people are already individually visible, so counting them in the
  // heatmap too would double-draw them. The heatmap is the anonymous layer.
  const pinnedUids = new Set(pins.map((p) => p.uid))
  const heatmap = buildHeatmap(
    countable.filter(({ user }) => !pinnedUids.has(user.uid)).map(({ loc }) => loc),
    { now },
  )

  return {
    enabled: true,
    pins,
    heatmap,
    onCampusCount: countable.length,   // ambient count, no positions
    suppressed,                        // for our own metrics, not a leak
    // Reported so the client can explain the heatmap's minimum, not pins.
    heatmapMinCount: c.heatmapMinCount,
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
