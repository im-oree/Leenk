import { createContext, useContext, useMemo, useReducer, useCallback, useEffect, useState } from 'react'
import { ME, CANDIDATES, MATCHES, POSTS, NOTIFICATIONS, THREADS } from './mock'
import { USE_API } from './api'

/**
 * Single client-side store holding everything the UI needs.
 * Every mutation below is the exact seam where a Firebase call goes later —
 * the component tree never needs to change.
 */

const KEY = 'leenk.state.v1'

const initial = {
  // account
  onboarded: false,
  authed: false,
  verificationStatus: 'pending', // pending | in_review | verified
  me: ME,

  // discovery
  queue: CANDIDATES,
  swiped: [],
  lastSwipe: null,
  undosLeft: 3,
  superLikesLeft: 1,
  swipesLeft: 25,

  matches: MATCHES,
  threads: THREADS,
  posts: POSTS,
  notifications: NOTIFICATIONS,

  filters: { ageRange: [18, 26], scope: 'nearby', intent: 'any', department: 'any' },
  settings: {
    notifications: { matches: true, messages: true, feed: true, safety: true, marketing: false },
    privacy: { discoverability: 'nearby', visible: true, readReceipts: true, showActive: true },
    reduceMotion: false,
  },
  toast: null,
  // false until real data has replaced the seeded fixtures (API mode only).
  hydrated: false,
}

function persistable(s) {
  return {
    onboarded: s.onboarded,
    authed: s.authed,
    verificationStatus: s.verificationStatus,
    me: s.me,
    filters: s.filters,
    settings: s.settings,
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    return { ...initial, ...JSON.parse(raw) }
  } catch {
    return initial
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'onboard/complete': {
      const clean = Object.fromEntries(
        Object.entries(action.profile || {}).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
      )
      return { ...state, onboarded: true, authed: true, me: { ...state.me, ...clean } }
    }
    case 'auth/signout':
      return { ...initial, onboarded: false }
    case 'verify/set':
      return { ...state, verificationStatus: action.status }

    case 'profile/update':
      return { ...state, me: { ...state.me, ...action.patch } }

    case 'swipe': {
      const [top, ...rest] = state.queue
      if (!top) return state
      const isLike = action.dir === 'right' || action.dir === 'super'
      const matched = isLike && action.forceMatch
      return {
        ...state,
        queue: rest,
        swiped: [{ user: top, dir: action.dir }, ...state.swiped],
        lastSwipe: { user: top, dir: action.dir },
        swipesLeft: Math.max(0, state.swipesLeft - 1),
        superLikesLeft: action.dir === 'super' ? Math.max(0, state.superLikesLeft - 1) : state.superLikesLeft,
        matches: matched
          ? [{ id: `m-${top.uid}`, user: top, matchedAt: Date.now(), isNew: true, lastMessage: null, unread: 0 }, ...state.matches]
          : state.matches,
      }
    }
    case 'swipe/undo': {
      if (!state.lastSwipe || state.undosLeft <= 0) return state
      return {
        ...state,
        queue: [state.lastSwipe.user, ...state.queue],
        swiped: state.swiped.slice(1),
        lastSwipe: null,
        undosLeft: state.undosLeft - 1,
        swipesLeft: state.swipesLeft + 1,
      }
    }
    case 'queue/refill':
      return { ...state, queue: CANDIDATES, swiped: [], swipesLeft: 25 }

    case 'filters/set':
      return { ...state, filters: { ...state.filters, ...action.patch } }

    case 'post/like':
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p,
        ),
      }
    case 'post/create':
      return { ...state, posts: [action.post, ...state.posts] }

    case 'message/send': {
      const list = state.threads[action.matchId] || []
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.matchId]: [...list, {
            id: Date.now(),
            mine: true,
            text: action.text || '',
            mediaUrl: action.mediaUrl || null,
            kind: action.kind || 'text',
            at: Date.now(),
          }],
        },
        matches: state.matches.map((m) =>
          m.id === action.matchId
            ? {
                ...m,
                lastMessage: { text: action.text || (action.kind === 'image' ? 'Photo' : 'GIF'), mine: true },
                isNew: false,
                unread: 0,
              }
            : m,
        ),
      }
    }
    case 'match/unmatch': {
      const { [action.matchId]: _drop, ...rest } = state.threads
      return { ...state, threads: rest, matches: state.matches.filter((m) => m.id !== action.matchId) }
    }
    case 'match/read':
      return { ...state, matches: state.matches.map((m) => (m.id === action.matchId ? { ...m, unread: 0, isNew: false } : m)) }

    case 'notifications/readAll':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, unread: false })) }

    case 'settings/set':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'toast/show':
      return { ...state, toast: { id: Date.now(), ...action.toast } }
    // Replace seeded fixtures with real server data. Only the keys present in
    // the payload are touched, so a partially-failed hydration leaves the rest
    // of the store intact rather than blanking the UI.
    case 'hydrate': {
      const next = { ...state, ...action.data, hydrated: true }
      // `me` is dereferenced all over the app (me.photos[0], me.name, ...).
      // A server profile with no photos yet -- a brand-new account, or a
      // partial payload -- would crash every one of those call sites. Normalise
      // once here rather than sprinkling ?. across thirty components.
      next.me = normalizeMe(next.me)
      return next
    }

    case 'toast/hide':
      return { ...state, toast: null }

    default:
      return state
  }
}

/**
 * Guarantee the shape every screen assumes of `me`.
 *
 * Cheap insurance: the alternative is optional chaining at each of the ~30
 * places that read it, which is easy to forget and fails at render time.
 */
function normalizeMe(me) {
  if (!me) return ME
  return {
    ...ME,                       // fill any gaps the server did not send
    ...me,
    photos: Array.isArray(me.photos) && me.photos.length ? me.photos : [],
    prompts: Array.isArray(me.prompts) ? me.prompts : [],
    interests: Array.isArray(me.interests) ? me.interests : [],
    name: me.name || ME.name,
  }
}

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  /**
   * Hydrate from the backend when VITE_USE_API is on.
   *
   * The store seeds from fixtures so the prototype renders instantly with no
   * server. In API mode those fixtures are placeholders that MUST be replaced,
   * otherwise screens reading `useStore()` would keep showing mock people
   * while screens using `useAsync(data.*)` show real ones -- the worst
   * outcome, because it looks like it works.
   *
   * Each source is settled independently: one failing endpoint must not stop
   * the others from populating.
   */
  useEffect(() => {
    if (!USE_API) return
    let alive = true

    ;(async () => {
      const { discovery, feed, chat, profile } = await import('./data')
      const results = await Promise.allSettled([
        profile.me(),
        discovery.stack(),
        feed.list('foryou'),
        chat.matches(),
      ])
      if (!alive) return

      const [meR, stackR, feedR, matchR] = results
      const data = {}
      if (meR.status === 'fulfilled' && meR.value?.profile) {
        data.me = meR.value.profile
        data.verificationStatus = meR.value.profile.verificationStatus
          || meR.value.profile.verified ? 'verified' : 'pending'
      }
      if (stackR.status === 'fulfilled') data.queue = stackR.value?.cards || []
      if (feedR.status === 'fulfilled') data.posts = feedR.value?.posts || []
      if (matchR.status === 'fulfilled') data.matches = matchR.value?.matches || []

      for (const r of results) {
        if (r.status === 'rejected') console.warn('[store] hydrate:', r.reason?.message || r.reason)
      }
      dispatch({ type: 'hydrate', data })
    })()

    return () => { alive = false }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(persistable(state)))
    } catch { /* quota */ }
  }, [state])

  const toast = useCallback((message, tone = 'default') => dispatch({ type: 'toast/show', toast: { message, tone } }), [])

  const value = useMemo(() => ({ ...state, dispatch, toast }), [state, toast])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
