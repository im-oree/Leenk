/**
 * Trust score engine (PRD §1.4.3, §1.8).
 *
 * Score is 0-100, private to the user, and drives shadow-throttling long
 * before a manual ban. Signals are additive and each is capped, so no single
 * signal can dominate — and new signals can be appended without re-architecting
 * (PRD §2.3.2).
 */

import { db, FieldValue } from '../lib/firebase.js'
import { config } from '../lib/config.js'

export const SIGNAL_WEIGHTS = {
  // Layer 1 — institutional
  institutional_registrar: 30,
  institutional_id_card: 20,
  institutional_email: 15,
  studenthub_verified: 25,

  // Layer 2 — face
  face_match_high: 25,
  face_match_medium: 14,
  liveness_passed: 10,

  // Layer 3 — behavioural / community
  peer_vouch: 4,           // per vouch, capped below
  account_age_30d: 5,
  account_age_180d: 10,
  profile_complete: 5,
  positive_engagement: 5,

  // Negatives
  report_upheld: -18,
  report_pending: -4,
  emulator_detected: -25,
  vpn_datacenter_ip: -8,
  multi_account_linked: -20,
  velocity_signup_burst: -12,
  liveness_failed: -20,
  reverify_overdue: -15,
}

const CAPS = { peer_vouch: 12, positive_engagement: 10 }

/** Compute a score from a list of { type, weight?, at } signals. */
export function computeTrustScore(signals = []) {
  const totals = {}
  let score = 50 // neutral baseline for a fresh, unverified account

  for (const s of signals) {
    const w = s.weight ?? SIGNAL_WEIGHTS[s.type] ?? 0
    totals[s.type] = (totals[s.type] || 0) + w
    if (CAPS[s.type] != null) totals[s.type] = Math.min(totals[s.type], CAPS[s.type])
  }
  for (const v of Object.values(totals)) score += v

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    breakdown: totals,
  }
}

/** Visibility multiplier applied at discovery time (shadow-throttling). */
export function visibilityMultiplier(score) {
  if (score >= 75) return 1
  if (score >= config.trust.shadowThrottleBelow) return 0.75
  if (score >= config.trust.minScoreToSwipe) return 0.35
  return 0.05 // effectively invisible, but not told they're banned
}

/** Append a signal (append-only audit trail — PRD §1.6 data integrity). */
export async function addTrustSignal(uid, { type, weight, meta = {}, actor = 'system' }) {
  const entry = {
    uid, type,
    weight: weight ?? SIGNAL_WEIGHTS[type] ?? 0,
    meta, actor,
    at: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  }
  await db().collection('trustSignals').add(entry)
  return recalcTrustScore(uid)
}

export async function recalcTrustScore(uid) {
  const snap = await db().collection('trustSignals').where('uid', '==', uid).get()
  const signals = snap.docs.map((d) => d.data())
  const { score, breakdown } = computeTrustScore(signals)

  await db().collection('users').doc(uid).set(
    {
      trustScore: score,
      trustBreakdown: breakdown,
      trustUpdatedAt: Date.now(),
      visibilityMultiplier: visibilityMultiplier(score),
    },
    { merge: true },
  )
  return { score, breakdown, visibility: visibilityMultiplier(score) }
}

export async function getTrust(uid) {
  const snap = await db().collection('users').doc(uid).get()
  const d = snap.data() || {}
  return {
    score: d.trustScore ?? 50,
    breakdown: d.trustBreakdown ?? {},
    visibility: d.visibilityMultiplier ?? 1,
    updatedAt: d.trustUpdatedAt ?? null,
  }
}
