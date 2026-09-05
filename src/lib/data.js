/**
 * Data adapter.
 *
 * ONE interface, TWO backends:
 *   VITE_USE_API=false → mock data, instant, no network (default today)
 *   VITE_USE_API=true  → the real Leenk API in /backend
 *
 * Screens import from here and never touch `mock.js` or `api.js` directly, so
 * flipping the env var switches the whole app over with no component changes.
 *
 * Every function returns the SAME shape in both modes — the mock branch is
 * written to match the API's response contract exactly (including the fields
 * the API adds, like `distance.label` and `verified`). That's what stops
 * "works on mock, breaks on live".
 */

import api, { USE_API, setToken, getToken } from './api'
import {
  ME, CANDIDATES, MATCHES, POSTS, NOTIFICATIONS, THREADS, STORIES,
  CAMPUSES, campusById, MOCK_GIFS, MOCK_SOUNDS, MOCK_MAP,
} from './mock'

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms))

/** Simulate realistic latency in mock mode so loaders/skeletons are exercised. */
const mock = async (value, ms) => {
  await delay(ms)
  return typeof value === 'function' ? value() : value
}

const distanceLabel = (km) => {
  if (km == null) return { label: 'Nearby', bucket: 'near' }
  if (km < 0.4) return { label: 'On your campus', bucket: 'here' }
  if (km < 2) return { label: 'Walking distance', bucket: 'walk' }
  if (km < 5) return { label: 'Under 5 km', bucket: 'close' }
  if (km < 15) return { label: 'Under 15 km', bucket: 'near' }
  if (km < 40) return { label: 'Same city', bucket: 'city' }
  return { label: 'Further away', bucket: 'far' }
}

/** Normalise a mock candidate into the API's card shape. */
const toCard = (u) => ({
  uid: u.uid || u.id,
  name: u.name,
  age: u.age,
  campusId: u.campusId,
  department: u.department,
  level: u.level,
  intent: u.intent,
  photos: u.photos || [],
  prompts: u.prompts || [],
  bio: u.bio || '',
  verified: u.verified ?? true,
  hasActiveStory: u.hasActiveStory ?? false,
  distance: distanceLabel(u.distanceKm),
  distanceKm: u.distanceKm,
})

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export const auth = {
  isLive: () => USE_API,
  token: getToken,

  async signup(profile) {
    if (!USE_API) return mock({ success: true, profile: { ...ME, ...profile }, verificationStatus: 'pending' })
    const res = await api.signup({
      phone: profile.phone,
      name: profile.name,
      birthdate: profile.birthdate,
      gender: profile.gender,
      interestedIn: profile.interestedIn,
      campusId: profile.campusId,
      department: profile.department,
      level: String(profile.level || '100'),
      intent: profile.intent,
      email: profile.email || undefined,
      photos: profile.photos,
      prompts: profile.prompts,
      bio: profile.bio,
    })
    if (res.token) setToken(res.token)
    return res
  },

  async me() {
    if (!USE_API) return mock({ success: true, user: ME })
    return api.me()
  },

  signout() {
    setToken(null)
  },
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

export const discovery = {
  async stack(limit = 15) {
    if (!USE_API) {
      return mock(() => ({
        success: true,
        cards: CANDIDATES.slice(0, limit).map(toCard),
        quota: { swipes: 25, superLikes: 1, undos: 3 },
        capped: false,
      }))
    }
    return api.stack(limit)
  },

  async swipe(targetUid, direction, context) {
    if (!USE_API) {
      // A pass can NEVER be a match. The old rule applied the random roll to
      // every direction, so swiping left/down fired the match overlay — the
      // backend has always been correct here (see routes/discovery.js: the
      // mutual-like check only runs for right|super); this mirrors it.
      const isLike = direction === 'right' || direction === 'super'
      const matched = isLike && (direction === 'super' || Math.random() < 0.25)
      return mock({ success: true, matched, direction }, 120)
    }
    return api.swipe(targetUid, direction, context)
  },

  async undo() {
    if (!USE_API) return mock({ success: true })
    return api.undo()
  },

  async likes() {
    if (!USE_API) return mock({ success: true, likes: CANDIDATES.slice(0, 6).map(toCard) })
    return api.likes()
  },

  async setFilters(filters) {
    if (!USE_API) return mock({ success: true, filters })
    return api.setFilters(filters)
  },
}

/* ------------------------------------------------------------------ *
 * Feed, posts, stories, notes
 * ------------------------------------------------------------------ */

export const feed = {
  async list(mode = 'foryou') {
    if (!USE_API) return mock({ success: true, posts: POSTS, mode })
    return api.feed(mode)
  },

  async create(post) {
    if (!USE_API) return mock({ success: true, post: { ...post, id: `p${Date.now()}` } }, 400)
    return api.createPost(post)
  },

  async like(postId) {
    if (!USE_API) return mock({ success: true, liked: true }, 100)
    return api.likePost(postId)
  },

  async comments(postId) {
    if (!USE_API) return mock({ success: true, comments: [] })
    return api.comments(postId)
  },

  async comment(postId, text) {
    if (!USE_API) return mock({ success: true, comment: { text, at: Date.now() } })
    return api.addComment(postId, text)
  },

  async follow(uid) {
    if (!USE_API) return mock({ success: true, following: true })
    return api.follow(uid)
  },
}

export const stories = {
  /**
   * Returns the rail in the API's shape: one entry per author, unseen first,
   * with `hasUnseen` driving the ring state everywhere in the UI.
   */
  async rail() {
    if (!USE_API) {
      return mock(() => ({
        success: true,
        rail: STORIES.map((s) => ({
          authorUid: s.author.uid || s.author.id,
          name: s.author.name,
          avatar: s.author.photos?.[0],
          verified: true,
          isMe: !!s.mine,
          hasUnseen: !s.seen,
          count: s.items?.length || 1,
          latestAt: s.at || Date.now(),
          items: (s.items || [{ media: s.media }]).map((it, i) => ({
            id: `${s.id}-${i}`,
            mediaUrl: it.media || it.mediaUrl,
            kind: 'image',
            caption: it.caption || '',
            at: s.at || Date.now(),
            seen: !!s.seen,
          })),
        })),
      }))
    }
    return api.stories()
  },

  async create(story) {
    if (!USE_API) return mock({ success: true, storyId: `s${Date.now()}` }, 400)
    return api.createStory(story)
  },

  async view(id) {
    if (!USE_API) return mock({ success: true }, 60)
    return api.viewStory(id)
  },

  async remove(id) {
    if (!USE_API) return mock({ success: true })
    return api.deleteStory(id)
  },
}

export const notes = {
  async list() {
    if (!USE_API) return mock({ success: true, notes: [] })
    return api.notes()
  },
  async set(text, music) {
    if (!USE_API) return mock({ success: true, note: { text, at: Date.now() } })
    return api.setNote(text, music)
  },
  async clear() {
    if (!USE_API) return mock({ success: true })
    return api.clearNote()
  },
}

/* ------------------------------------------------------------------ *
 * Matches & chat
 * ------------------------------------------------------------------ */

export const chat = {
  async matches() {
    if (!USE_API) return mock({ success: true, matches: MATCHES })
    return api.matches()
  },

  async messages(matchId) {
    if (!USE_API) return mock({ success: true, messages: THREADS[matchId] || [] })
    return api.messages(matchId)
  },

  async send(matchId, body) {
    if (!USE_API) return mock({ success: true, messageId: `m${Date.now()}`, at: Date.now() }, 140)
    return api.sendMessage(matchId, body)
  },

  async edit(matchId, mid, text) {
    if (!USE_API) return mock({ success: true, editedAt: Date.now() })
    return api.editMessage(matchId, mid, text)
  },

  async remove(matchId, mid, scope = 'me') {
    if (!USE_API) return mock({ success: true, scope })
    return api.deleteMessage(matchId, mid, scope)
  },

  async markRead(matchId) {
    if (!USE_API) return mock({ success: true }, 50)
    return api.markRead(matchId)
  },

  async unmatch(matchId) {
    if (!USE_API) return mock({ success: true })
    return api.unmatch(matchId)
  },
}

/* ------------------------------------------------------------------ *
 * Media
 * ------------------------------------------------------------------ */

export const media = {
  /**
   * @param file  { base64, dataUrl, mimeType } from lib/gallery
   * @returns     { url, thumb, medium, variants }
   */
  async upload(file, surface = 'post') {
    if (!USE_API) {
      // Mock mode keeps the local data URL — the composer preview is identical
      // to what a real upload would render.
      await delay(500)
      return {
        success: true,
        media: {
          url: file.dataUrl,
          thumb: file.dataUrl,
          medium: file.dataUrl,
          variants: { thumb: file.dataUrl, medium: file.dataUrl, full: file.dataUrl },
          width: file.width,
          height: file.height,
        },
      }
    }
    return api.uploadImage(file.dataUrl || file.base64, surface)
  },

  async uploadMany(files, surface = 'profile') {
    if (!USE_API) {
      await delay(700)
      return { success: true, uploaded: files.map((f) => ({ url: f.dataUrl, thumb: f.dataUrl })) }
    }
    return api.uploadImages(files.map((f) => f.dataUrl || f.base64), surface)
  },

  /**
   * GIF search. Returns { items, remote, reason } — `remote:false` means the
   * provider is unavailable/unconfigured and the UI should say so plainly
   * rather than render an empty grid that looks broken.
   */
  async gifs(q = '', offset = 0) {
    if (!USE_API) {
      await delay(320)
      return { success: true, items: MOCK_GIFS(q), remote: true, provider: 'mock' }
    }
    try {
      return await api.searchGifs(q, offset)
    } catch {
      return { success: true, items: [], remote: false, reason: 'PROVIDER_UNAVAILABLE' }
    }
  },

  /** Sound library for the composer. Same degradation contract as gifs(). */
  async sounds(q = '', page = 1) {
    if (!USE_API) {
      await delay(320)
      return { success: true, items: MOCK_SOUNDS(q), remote: true, provider: 'mock' }
    }
    try {
      return await api.searchSounds(q, page)
    } catch {
      return { success: true, items: [], remote: false, reason: 'PROVIDER_UNAVAILABLE' }
    }
  },

  async config() {
    if (!USE_API) {
      return {
        success: true,
        media: { provider: 'mock', keysConfigured: 1, ready: true, limits: { maxImageMB: 8, maxVideoMB: 60, maxVideoSeconds: 90 } },
        moderation: { enabled: false },
        features: { feed: true, stories: true, notes: true, calls: true },
      }
    }
    return api.mediaConfig()
  },
}

/* ------------------------------------------------------------------ *
 * Map
 * ------------------------------------------------------------------ */

export const campusMap = {
  async config() {
    if (!USE_API) {
      return mock({
        success: true, enabled: true, ghostIsFree: true, kAnonymity: 3,
        tileStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
        tileStyleUrlDark: 'https://tiles.openfreemap.org/styles/dark',
        settings: { visibility: 'mutuals', ghost: false, hiddenFrom: [] },
      })
    }
    return api.mapConfig()
  },

  async pins() {
    if (!USE_API) return mock({ success: true, ...MOCK_MAP() }, 420)
    return api.mapPins()
  },

  async settings(patch) {
    if (!USE_API) return mock({ success: true, settings: patch })
    return api.mapSettings(patch)
  },

  /** Fire-and-forget: never block the UI, never surface the outcome. */
  view(uid, meta) {
    if (!USE_API) return Promise.resolve({ success: true })
    return api.mapView(uid, meta).catch(() => ({ success: false }))
  },
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

export const payments = {
  async config() {
    if (!USE_API) {
      return mock({
        success: true, provider: 'paystack', enabled: false, publicKey: null, currency: 'NGN',
        plans: [
          { id: 'month', label: '1 month', months: 1, amount: 168000, display: '₦1,680' },
          { id: 'term', label: '4 months', months: 4, amount: 490000, display: '₦4,900' },
          { id: 'year', label: '12 months', months: 12, amount: 1260000, display: '₦12,600' },
        ],
      })
    }
    return api.paymentsConfig()
  },

  /** Server builds the intent; the client never supplies an amount. */
  async intent(planId) {
    if (!USE_API) return mock({ success: true, ok: false, code: 'PAYMENTS_NOT_CONFIGURED' })
    return api.paymentIntent(planId)
  },

  /** The ONLY thing that grants entitlement. */
  async verify(reference) {
    if (!USE_API) return mock({ success: true })
    return api.paymentVerify(reference)
  },

  async status() {
    if (!USE_API) return mock({ success: true, active: false, grace: false })
    return api.paymentStatus()
  },
}

/* ------------------------------------------------------------------ *
 * Profile & safety
 * ------------------------------------------------------------------ */

export const profile = {
  async get(uid) {
    if (!USE_API) {
      const u = CANDIDATES.find((c) => (c.uid || c.id) === uid) || ME
      return mock({ success: true, user: toCard(u) })
    }
    return api.getUser(uid)
  },

  async update(patch) {
    if (!USE_API) return mock({ success: true, profile: { ...ME, ...patch } })
    return api.updateProfile(patch)
  },

  async block(uid) {
    if (!USE_API) return mock({ success: true })
    return api.blockUser(uid)
  },
}

export const safety = {
  async report(payload) {
    if (!USE_API) return mock({ success: true, priority: 'normal' })
    return api.report(payload)
  },
  async shareMeetup(payload) {
    if (!USE_API) return mock({ success: true })
    return api.shareMeetup(payload)
  },
}

/* ------------------------------------------------------------------ *
 * Static reference data (identical in both modes)
 * ------------------------------------------------------------------ */

export const reference = { campuses: CAMPUSES, campusById }

export default {
  auth, discovery, feed, stories, notes, chat, media, profile, safety, reference,
  isLive: USE_API,
}
