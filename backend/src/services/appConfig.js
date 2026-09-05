/**
 * Runtime configuration.
 *
 * Env vars hold ONLY what's needed to reach the database. Everything else —
 * algorithm weights, API key pools, moderation thresholds, feature flags,
 * notification templates — lives in Firestore under `appConfig/*` and is
 * editable live from the admin panel with no redeploy.
 *
 * Rationale (user requirement): adding a second ImgBB key or swapping an email
 * provider must take seconds and apply immediately, not a deploy cycle.
 *
 * Reads are served from an in-process cache refreshed every 60s, so hot paths
 * (every swipe, every feed build) pay nothing.
 */

import { db } from '../lib/firebase.js'

const TTL_MS = 60_000

let cache = {}
let lastLoad = 0
let loading = null

/* ------------------------------------------------------------------ *
 * Defaults — seeded into Firestore on first boot, and used as the
 * fallback whenever a key is absent so the app can never hard-fail on
 * missing config.
 * ------------------------------------------------------------------ */
export const DEFAULTS = {
  discovery: {
    trustFloor: 40,
    explorationRate: 0.15,
    dailySwipeCapFree: 25,
    dailySuperLikeFree: 1,
    dailyUndoFree: 3,
    maxPerDepartmentShare: 0.4,
    maxConsecutiveSameDept: 3,
    newUserBoostHours: 72,
    weights: {
      sameCampus: 0.22, proximity: 0.14, sameCity: 0.04, sameCountry: 0.01,
      intentMatch: 0.16, ageAffinity: 0.07, academicOverlap: 0.06,
      socialGraph: 0.11, interestOverlap: 0.08, activityRecency: 0.06,
      reciprocity: 0.13, theyLikedYou: 0.18, profileQuality: 0.05,
      noveltyDecay: -0.09,
    },
  },

  feed: {
    pools: { following: 0.4, campus: 0.3, affinity: 0.2, fresh: 0.1 },
    weights: {
      recency: 0.30, authorAffinity: 0.24, engagementRate: 0.18,
      campusRelevance: 0.12, mediaQuality: 0.08, dwellPrediction: 0.08,
    },
    recencyHalfLifeHours: 14,
    seenPenalty: 0.6,
    maxPostsPerAuthor: 3,
    storyTtlHours: 24,
  },

  media: {
    provider: 'imgbb',
    // Round-robin pool. Add keys here from the admin panel; picked up in <60s.
    imgbbKeys: [],
    imgbbEndpoint: 'https://api.imgbb.com/1/upload',
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 60 * 1024 * 1024,
    maxVideoSeconds: 90,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    allowedVideoTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    // Progressive loading: we generate/store these variants per upload.
    variants: { thumb: 32, small: 320, medium: 720, full: 1440 },
    blurhashEnabled: true,
  },

  moderation: {
    enabled: true,
    nsfwProvider: 'nsfwjs',        // nsfwjs | cloudflare | groq | none
    nsfwThresholdBlock: 0.85,
    nsfwThresholdReview: 0.6,
    textProvider: 'groq',
    textModel: 'llama-3.1-8b-instant',
    autoActionOnBlock: 'reject_upload',
    reviewQueueOnUncertain: true,
    scanProfilePhotos: true,
    scanPosts: true,
    scanStories: true,
    scanChatImages: true,
  },

  messaging: {
    editWindowSeconds: 900,        // 15 min — edits allowed only inside this
    deleteForEveryoneSeconds: 3600,
    maxMessageLength: 2000,
    imagesEnabled: true,
    gifProvider: 'tenor',          // tenor | giphy | none
    stickersEnabled: true,
    voiceNotesEnabled: true,
    maxVoiceNoteSeconds: 120,
    typingIndicator: true,
    readReceipts: true,
    rateLimitPerMinute: 40,
  },

  calls: {
    enabled: true,
    audioEnabled: true,
    videoEnabled: true,
    // Free STUN. TURN is only needed for symmetric-NAT fallback.
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
    turnServers: [],               // fill from admin panel when needed
    maxCallMinutes: 120,
    requireMatch: true,
  },

  notifications: {
    enabled: true,
    quietHours: { start: 23, end: 7, timezone: 'Africa/Lagos' },
    maxPerDay: 6,
    // Deliberately non-baity copy (PRD §1.7).
    templates: {
      newMatch: { title: 'You matched with {{name}}', body: 'Say hello when you\'re ready.' },
      firstMessage: { title: '{{name}} sent a message', body: '{{preview}}' },
      message: { title: '{{name}}', body: '{{preview}}' },
      verificationApproved: { title: 'You\'re verified', body: 'Your profile is live on {{campus}}.' },
      verificationRejected: { title: 'Verification needs another look', body: 'Tap to see what to fix.' },
      meetupCheckIn: { title: 'Checking in', body: 'You shared a meetup. All good?' },
      storyMention: { title: '{{name}} mentioned you', body: 'In their story.' },
    },
    disabledByDefault: ['promotional', 'digest'],
  },

  features: {
    feed: true, stories: true, notes: true, explore: true,
    calls: true, voiceNotes: true, gifs: true,
    studentHubSync: false,
  },

  safety: {
    reportsBeforeReview: 3,
    autoBanEnabled: false,         // reports never auto-ban
    appealWindowDays: 30,
  },
}

/* ------------------------------------------------------------------ */

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const [k, v] of Object.entries(override)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base?.[k] ?? {}, v) : v
  }
  return out
}

/** Load every appConfig doc into the cache. Safe to call concurrently. */
export async function loadConfig(force = false) {
  if (!force && Date.now() - lastLoad < TTL_MS) return cache
  if (loading) return loading

  loading = (async () => {
    try {
      const snap = await db().collection('appConfig').get()
      const remote = {}
      snap.docs.forEach((d) => { remote[d.id] = d.data() })
      cache = deepMerge(DEFAULTS, remote)
      lastLoad = Date.now()
    } catch (err) {
      // Never let a config read take the API down — fall back to defaults.
      if (!Object.keys(cache).length) cache = { ...DEFAULTS }
      console.warn('[appConfig] load failed, using cached/defaults:', err.message)
    } finally {
      loading = null
    }
    return cache
  })()

  return loading
}

/**
 * Synchronous dotted-path read against the cache.
 * `getConfig('discovery.weights.sameCampus')`
 */
export function getConfig(path, fallback) {
  const source = Object.keys(cache).length ? cache : DEFAULTS
  if (!path) return source
  const val = path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), source)
  return val === undefined ? fallback : val
}

/** Write a config section (admin panel). Applies within one TTL window. */
export async function setConfig(section, patch) {
  await db().collection('appConfig').doc(section).set(patch, { merge: true })
  await loadConfig(true)
  return getConfig(section)
}

/** Seed missing sections on boot so the admin panel has something to edit. */
export async function seedConfig() {
  try {
    const col = db().collection('appConfig')
    const snap = await col.get()
    const existing = new Set(snap.docs.map((d) => d.id))
    await Promise.all(
      Object.entries(DEFAULTS)
        .filter(([id]) => !existing.has(id))
        .map(([id, value]) => col.doc(id).set(value)),
    )
    await loadConfig(true)
  } catch (err) {
    console.warn('[appConfig] seed skipped:', err.message)
  }
}

/* ---- Round-robin key pools (ImgBB and friends) ---- */
const cursors = new Map()

/**
 * Rotate through a pool of API keys so one key's rate limit doesn't take the
 * feature down. Add keys in the admin panel, no redeploy.
 */
export function nextKey(poolPath) {
  const pool = getConfig(poolPath) || []
  if (!Array.isArray(pool) || pool.length === 0) return null
  const i = (cursors.get(poolPath) ?? -1) + 1
  cursors.set(poolPath, i)
  return pool[i % pool.length]
}

export default { loadConfig, getConfig, setConfig, seedConfig, nextKey, DEFAULTS }
