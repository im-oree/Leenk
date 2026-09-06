/**
 * Leenk matching engine.
 *
 * Design spec: backend/docs/ALGORITHM.md
 *
 * Two distinct stages, and the separation is load-bearing:
 *
 *   1. HARD GATES  — boolean eligibility. A candidate that fails ANY gate is
 *                    removed. No score can rescue them. Orientation lives here.
 *   2. SCORING     — ranks whatever survived.
 *
 * The orientation rule is a correctness requirement, not a preference knob:
 * same-gender candidates are never surfaced unless BOTH users explicitly
 * opted into that gender during onboarding. It is enforced twice (pool build
 * + final pass) so a scoring regression can never leak an incompatible profile.
 */

import { getConfig } from './appConfig.js'

/* ------------------------------------------------------------------ *
 * Orientation
 * ------------------------------------------------------------------ */

const GENDER_TO_PREF = { man: 'men', woman: 'women', nonbinary: 'nonbinary' }

/** Does `gender` satisfy the preference list `prefs`? */
export function genderMatchesPreference(gender, prefs) {
  if (!gender || !Array.isArray(prefs) || prefs.length === 0) return false
  const token = GENDER_TO_PREF[gender]
  if (!token) return false
  return prefs.includes(token) || prefs.includes('everyone')
}

/**
 * Mutual orientation compatibility. Symmetric by construction.
 * Both directions must hold — this is what prevents same-gender pairing
 * unless both parties opted in.
 */
export function orientationCompatible(a, b) {
  if (!a || !b) return false
  return (
    genderMatchesPreference(b.gender, a.interestedIn) &&
    genderMatchesPreference(a.gender, b.interestedIn)
  )
}

/* ------------------------------------------------------------------ *
 * Hard gates
 * ------------------------------------------------------------------ */

/**
 * @returns {null} if eligible, or a string reason code if excluded.
 * Reason codes are for internal telemetry only — never returned to clients.
 */
export function gateReason(me, c, ctx = {}) {
  const { seen = new Set(), blocked = new Set(), blockedBy = new Set(), filters = {} } = ctx

  if (!c || c.uid === me.uid) return 'SELF'
  if (seen.has(c.uid)) return 'ALREADY_SWIPED'
  if (blocked.has(c.uid) || blockedBy.has(c.uid)) return 'BLOCKED'

  if (c.verificationStatus !== 'verified') return 'NOT_VERIFIED'
  if (c.status !== 'active') return 'INACTIVE'
  if (c.banned) return 'BANNED'
  if (c.privacy?.visible === false) return 'HIDDEN'

  // ---- Orientation: the non-negotiable one ----
  if (!orientationCompatible(me, c)) return 'ORIENTATION'

  // ---- Age, both directions ----
  const [myMin, myMax] = filters.ageRange || [18, 99]
  if (c.age == null || c.age < 18) return 'UNDERAGE'
  if (c.age < myMin || c.age > myMax) return 'AGE_OUT_OF_MY_RANGE'
  const [theirMin, theirMax] = c.filters?.ageRange || [18, 99]
  if (me.age != null && (me.age < theirMin || me.age > theirMax)) return 'AGE_OUT_OF_THEIR_RANGE'

  // ---- Trust floor ----
  if ((c.trustScore ?? 50) < (getConfig('discovery.trustFloor') ?? 40)) return 'LOW_TRUST'

  // ---- Scope / explicit filters ----
  if (filters.scope === 'home' && c.campusId !== me.campusId) return 'OUT_OF_SCOPE'
  if (c.privacy?.discoverability === 'home' && c.campusId !== me.campusId) return 'THEIR_SCOPE'
  if (filters.intent && filters.intent !== 'any' && c.intent !== filters.intent) return 'INTENT_FILTER'
  if (filters.department && filters.department !== 'any' && c.department !== filters.department) return 'DEPT_FILTER'

  return null
}

export const passesGates = (me, c, ctx) => gateReason(me, c, ctx) === null

/* ------------------------------------------------------------------ *
 * Signals — each returns 0..1
 * ------------------------------------------------------------------ */

const INTENT_MATRIX = {
  relationship: { relationship: 1.0, dating: 0.7, friends: 0.2, study: 0.15, unsure: 0.5 },
  dating: { relationship: 0.7, dating: 1.0, friends: 0.35, study: 0.2, unsure: 0.6 },
  friends: { relationship: 0.2, dating: 0.35, friends: 1.0, study: 0.7, unsure: 0.5 },
  study: { relationship: 0.15, dating: 0.2, friends: 0.7, study: 1.0, unsure: 0.4 },
  unsure: { relationship: 0.5, dating: 0.6, friends: 0.5, study: 0.4, unsure: 0.7 },
}

export const intentAffinity = (a, b) => INTENT_MATRIX[a]?.[b] ?? 0.4

const clamp01 = (n) => Math.max(0, Math.min(1, n))

export function proximityScore(km) {
  if (km == null) return 0.3
  return clamp01(Math.exp(-km / 12))
}

export function ageAffinity(a, b) {
  if (a == null || b == null) return 0.5
  return clamp01(1 - Math.abs(a - b) / 12)
}

export function academicOverlap(me, c) {
  if (me.department && me.department === c.department) return 1.0
  if (me.faculty && me.faculty === c.faculty) return 0.6
  if (me.level && me.level === c.level) return 0.4
  return 0
}

export function interestOverlap(a = [], b = []) {
  if (!a.length || !b.length) return 0
  const A = new Set(a.map((s) => String(s).toLowerCase()))
  const B = new Set(b.map((s) => String(s).toLowerCase()))
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return clamp01(inter / (A.size + B.size - inter))
}

export function activityRecency(lastActiveMs) {
  if (!lastActiveMs) return 0.2
  const hours = (Date.now() - lastActiveMs) / 3_600_000
  return clamp01(Math.exp(-hours / 72))
}

export function profileQuality(u) {
  const photos = Math.min((u.photos || []).length, 4) / 4
  const prompts = Math.min((u.prompts || []).length, 3) / 3
  const bio = clamp01((u.bio || '').length / 140)
  return clamp01(photos * 0.5 + prompts * 0.35 + bio * 0.15)
}

/** Log-saturating friends-of-friends count. */
export function socialGraphScore(mutuals) {
  if (!mutuals) return 0
  return clamp01(Math.log2(1 + mutuals) / Math.log2(9))
}

/**
 * Predicted P(candidate likes viewer back) — heuristic phase.
 * See ALGORITHM.md §1.4. Deliberately suppresses already over-liked profiles
 * so attention is redistributed rather than concentrated.
 */
export function reciprocityLikelihood(me, c, stats = {}) {
  const swipes = c.stats?.swipesTotal || 0
  const likes = c.stats?.likesGiven || 0
  const selectivity = swipes > 10 ? 1 - likes / swipes : 0.5 // high = picky

  const myDesirability = clamp01((me.stats?.likeRate ?? 0.5))
  const selectivityFit = clamp01(1 - Math.abs(selectivity - myDesirability))

  const received = c.stats?.likesReceived7d || 0
  const demandBalance = clamp01(1 - received / (stats.p90LikesReceived || 40))

  const attributeAffinity = clamp01(
    0.5 * intentAffinity(me.intent, c.intent) +
    0.3 * ageAffinity(me.age, c.age) +
    0.2 * (me.campusId === c.campusId ? 1 : 0),
  )

  const activityFit = activityRecency(c.lastActiveMs)

  return clamp01(
    0.35 * selectivityFit +
    0.30 * demandBalance +
    0.20 * attributeAffinity +
    0.15 * activityFit,
  )
}

/* ------------------------------------------------------------------ *
 * Composite score
 * ------------------------------------------------------------------ */

export const DEFAULT_WEIGHTS = {
  sameCampus: 0.22,
  proximity: 0.14,
  sameCity: 0.04,
  sameCountry: 0.01,
  intentMatch: 0.16,
  ageAffinity: 0.07,
  academicOverlap: 0.06,
  socialGraph: 0.11,
  interestOverlap: 0.08,
  activityRecency: 0.06,
  reciprocity: 0.13,
  theyLikedYou: 0.18,
  profileQuality: 0.05,
  noveltyDecay: -0.09,
}

export function trustMultiplier(score = 50) {
  if (score >= 75) return 1
  if (score >= 55) return 0.75
  if (score >= 40) return 0.35
  return 0
}

/**
 * Score one candidate. Returns { score, breakdown } — breakdown is for
 * internal debugging/telemetry and must never reach a client response.
 */
export function scoreCandidate(me, c, ctx = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...(getConfig('discovery.weights') || {}) }
  const {
    distanceKm, mutuals = 0, likedMe = false,
    timesShown = 0, poolStats = {},
  } = ctx

  const s = {
    sameCampus: me.campusId && me.campusId === c.campusId ? 1 : 0,
    proximity: proximityScore(distanceKm),
    sameCity: me.city && me.city === c.city ? 1 : 0,
    sameCountry: me.country && me.country === c.country ? 1 : 0,
    intentMatch: intentAffinity(me.intent, c.intent),
    ageAffinity: ageAffinity(me.age, c.age),
    academicOverlap: academicOverlap(me, c),
    socialGraph: socialGraphScore(mutuals),
    interestOverlap: interestOverlap(me.interests, c.interests),
    activityRecency: activityRecency(c.lastActiveMs),
    reciprocity: reciprocityLikelihood(me, c, poolStats),
    theyLikedYou: likedMe ? 1 : 0,
    profileQuality: profileQuality(c),
    noveltyDecay: clamp01(timesShown / 6),
  }

  let base = 0
  const breakdown = {}
  for (const k of Object.keys(s)) {
    const contrib = (w[k] ?? 0) * s[k]
    breakdown[k] = Number(contrib.toFixed(4))
    base += contrib
  }

  // Cold-start protection: brand-new profiles get a temporary lift so they
  // aren't buried before the system has any signal about them.
  const impressions = c.stats?.impressions || 0
  const ageHours = (Date.now() - (c.createdAtMs || 0)) / 3_600_000
  const newBoost = impressions < 20 && ageHours < 72 ? 1.4 : 1

  const fatigue = Math.pow(0.85, timesShown)
  const trust = trustMultiplier(c.trustScore ?? 50)

  const score = Math.max(0, base) * trust * fatigue * newBoost

  return { score, breakdown, multipliers: { trust, fatigue, newBoost } }
}

/* ------------------------------------------------------------------ *
 * Stack assembly
 * ------------------------------------------------------------------ */

/**
 * Enforce department diversity: no more than `maxRun` in a row and no more
 * than `maxShare` of the stack from one department. Prevents a student seeing
 * nothing but their own coursemates.
 */
export function diversify(ranked, { maxRun = 3, maxShare = 0.4 } = {}) {
  const limit = Math.max(1, Math.ceil(ranked.length * maxShare))
  const counts = new Map()
  const out = []
  const deferred = []

  for (const item of ranked) {
    const dept = item.u.department || '—'
    const used = counts.get(dept) || 0
    const run = out.slice(-maxRun).filter((x) => (x.u.department || '—') === dept).length

    if (used >= limit || run >= maxRun) deferred.push(item)
    else {
      out.push(item)
      counts.set(dept, used + 1)
    }
  }
  return [...out, ...deferred]
}

/**
 * Build a ranked, diversified, partially-explored stack.
 *
 * @param me         viewer profile
 * @param candidates already gate-filtered array of profiles
 * @param ctxFor     (candidate) => scoring context
 */
export function buildStack(me, candidates, ctxFor, { limit = 15, explorationRate } = {}) {
  const eps = explorationRate ?? getConfig('discovery.explorationRate') ?? 0.15

  const ranked = candidates
    .map((u) => {
      const { score, breakdown } = scoreCandidate(me, u, ctxFor(u))
      return { u, score, breakdown }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const exploreCount = Math.max(0, Math.round(limit * eps))
  const exploitCount = Math.max(0, limit - exploreCount)

  const exploit = ranked.slice(0, exploitCount)
  const rest = ranked.slice(exploitCount)

  // ε-greedy: random draw from the tail so we keep discovering preferences
  // the model hasn't learned yet, and new users still get impressions.
  const explore = []
  for (let i = 0; i < exploreCount && rest.length; i++) {
    explore.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0])
  }

  return diversify([...exploit, ...explore].sort((a, b) => b.score - a.score)).slice(0, limit)
}

/**
 * Final safety net. Runs immediately before the response is serialised.
 * If this ever removes anything, a gate upstream has a bug — so it logs loudly.
 */
export function assertOrientation(me, list, logger = console) {
  return list.filter((item) => {
    const c = item.u || item
    if (orientationCompatible(me, c)) return true
    logger.error?.(
      `[matching] ORIENTATION LEAK: ${c.uid} reached the stack for ${me.uid} — a hard gate was bypassed.`,
    )
    return false
  })
}
