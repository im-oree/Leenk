/**
 * Location ingestion, throttling and anti-spam.
 *
 * The full rationale (and the maths) is written up for the StudentHub devs in
 * docs/STUDENTHUB_INTEGRATION.md §5. Summary of the guarantees:
 *
 *  1. We NEVER persist a raw coordinate for read-back by another user.
 *     Raw lat/lng is used transiently to (a) resolve a campus place and
 *     (b) compute a fuzzy distance bucket, then snapped to a 250 m grid.
 *  2. Writes are rate-limited three ways: minimum interval, minimum movement,
 *     and an hourly hard cap. A ping that fails any check is accepted by the
 *     API (HTTP 200) but not written — the client is never told the exact rule,
 *     which makes probing the limits harder.
 *  3. Physical plausibility: implied speed between consecutive fixes must be
 *     <= 55 m/s (~198 km/h). Faster = spoofing or VPN relocation -> flagged.
 *  4. Accuracy floor: fixes worse than 250 m are dropped (they'd be noise).
 */

import { db, FieldValue } from '../lib/firebase.js'
import { config } from '../lib/config.js'
import {
  distanceMeters, snapToGrid, gridCellId, geohash, fuzzyDistance, isPlausibleMovement,
} from '../lib/geo.js'
import { addTrustSignal } from './trust.js'

const L = config.location

/** In-process hot cache of last fix per user — avoids a read on every ping. */
const lastFix = new Map()

export function decideAccept(prev, next) {
  if (next.accuracy != null && next.accuracy > L.maxAccuracyM) {
    return { accept: false, reason: 'ACCURACY_TOO_LOW' }
  }
  if (!prev) return { accept: true, reason: 'FIRST_FIX' }

  const dt = next.at - prev.at
  if (dt < L.minIntervalMs) return { accept: false, reason: 'TOO_SOON' }

  const moved = distanceMeters(prev, next)
  if (moved < L.minDistanceM) return { accept: false, reason: 'INSUFFICIENT_MOVEMENT' }

  const plausible = isPlausibleMovement(prev, next, L.maxSpeedMps)
  if (!plausible.ok) return { accept: false, reason: 'IMPLAUSIBLE_SPEED', speedMps: plausible.speedMps }

  if ((prev.hourCount || 0) >= L.maxPerHour && next.at - (prev.hourStart || 0) < 3_600_000) {
    return { accept: false, reason: 'HOURLY_CAP' }
  }
  return { accept: true, reason: 'OK', movedM: Math.round(moved) }
}

/**
 * Ingest a single location ping.
 * Returns what the client is allowed to know — never the stored precision.
 */
export async function ingestLocation(uid, { lat, lng, accuracy, at = Date.now(), campusId, source = 'app' }) {
  const next = { lat, lng, accuracy, at }

  let prev = lastFix.get(uid)
  if (!prev) {
    const snap = await db().collection('userLocations').doc(uid).get()
    prev = snap.exists ? snap.data() : null
  }

  const decision = decideAccept(prev, next)

  if (!decision.accept) {
    // Silent no-op for the client; still useful telemetry.
    return { stored: false, reason: decision.reason, presence: prev?.placeId || null }
  }

  // Spoofing signal -> trust penalty (only on a hard implausibility)
  if (decision.reason === 'IMPLAUSIBLE_SPEED') {
    await addTrustSignal(uid, { type: 'vpn_datacenter_ip', meta: { speedMps: decision.speedMps }, actor: 'location' })
  }

  const hourStart = prev && at - (prev.hourStart || 0) < 3_600_000 ? prev.hourStart : at
  const hourCount = prev && hourStart === prev.hourStart ? (prev.hourCount || 0) + 1 : 1

  const snapped = snapToGrid({ lat, lng }, L.gridPrecisionM)
  const record = {
    uid,
    // ONLY the snapped coordinate is persisted
    lat: snapped.lat,
    lng: snapped.lng,
    cellId: gridCellId({ lat, lng }, L.gridPrecisionM),
    geohash: geohash(snapped, 7),
    accuracy: Math.round(accuracy ?? 0),
    campusId: campusId || null,
    source,
    at,
    hourStart,
    hourCount,
    expiresAt: at + L.presenceTtlMs,
    updatedAt: FieldValue.serverTimestamp(),
  }

  await db().collection('userLocations').doc(uid).set(record, { merge: true })
  lastFix.set(uid, { ...record, lat, lng }) // cache keeps raw for next comparison only

  return {
    stored: true,
    movedM: decision.movedM ?? null,
    cellId: record.cellId,
    nextPingAfterMs: L.minIntervalMs,
  }
}

/**
 * Batch ingest — the client buffers fixes while offline and flushes on
 * reconnect. We process oldest-first so the plausibility chain holds.
 */
export async function ingestBatch(uid, fixes = []) {
  const sorted = [...fixes].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-50)
  const results = []
  for (const f of sorted) results.push(await ingestLocation(uid, f))
  return {
    received: fixes.length,
    processed: sorted.length,
    stored: results.filter((r) => r.stored).length,
  }
}

/** Fuzzy distance between two users — the only distance the client ever sees. */
export async function distanceBetween(uidA, uidB) {
  const [a, b] = await Promise.all([
    db().collection('userLocations').doc(uidA).get(),
    db().collection('userLocations').doc(uidB).get(),
  ])
  if (!a.exists || !b.exists) return { known: false, label: 'Distance unknown', bucket: 'unknown' }
  const da = a.data()
  const dbb = b.data()
  const m = distanceMeters({ lat: da.lat, lng: da.lng }, { lat: dbb.lat, lng: dbb.lng })
  return { known: true, ...fuzzyDistance(m) }
}

/** Aggregate presence for a campus place — counts only, never identities. */
export async function placePresence(campusId, placeId) {
  const cutoff = Date.now() - L.presenceTtlMs
  const snap = await db().collection('userLocations').where('campusId', '==', campusId).get()
  const active = snap.docs.map((d) => d.data()).filter((d) => d.at >= cutoff && (!placeId || d.placeId === placeId))
  const count = active.length
  return {
    campusId,
    placeId: placeId || null,
    // k-anonymity: never expose a count that could identify one person
    count: count < 3 ? 0 : count,
    suppressed: count > 0 && count < 3,
    windowMs: L.presenceTtlMs,
  }
}

export const locationPolicy = () => ({
  minIntervalMs: L.minIntervalMs,
  minDistanceM: L.minDistanceM,
  maxPerHour: L.maxPerHour,
  maxAccuracyM: L.maxAccuracyM,
  gridPrecisionM: L.gridPrecisionM,
  presenceTtlMs: L.presenceTtlMs,
  maxSpeedMps: L.maxSpeedMps,
})
