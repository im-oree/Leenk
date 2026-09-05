/**
 * Leenk API client.
 *
 * The UI still runs on mock data by default (VITE_USE_API=false), so nothing
 * breaks. Flip VITE_USE_API=true and every call below hits the real backend
 * in /backend — the store's mutations already map 1:1 onto these functions.
 */

const BASE = import.meta.env.VITE_API_BASE || '/api'
export const USE_API = String(import.meta.env.VITE_USE_API || 'false') === 'true'

const TOKEN_KEY = 'leenk.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

async function request(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    signal,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`)
    err.status = res.status
    err.code = data.code
    err.payload = data
    throw err
  }
  return data
}

export const api = {
  /* auth */
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, auth: false }),
  studentHubCallback: (payload) => request('/auth/studenthub/callback', { method: 'POST', body: payload, auth: false }),
  linkStudentHub: (payload) => request('/auth/link-studenthub', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),

  /* profile */
  getProfile: () => request('/profile'),
  updateProfile: (patch) => request('/profile', { method: 'PUT', body: patch }),
  getUser: (uid) => request(`/profile/${uid}`),
  blockUser: (uid) => request(`/profile/${uid}/block`, { method: 'POST' }),
  unblockUser: (uid) => request(`/profile/${uid}/block`, { method: 'DELETE' }),
  studentHubSync: () => request('/profile/sync/studenthub'),

  /* discovery */
  stack: (limit = 15) => request(`/discovery/stack?limit=${limit}`),
  swipe: (targetUid, direction, context) => request('/discovery/swipe', { method: 'POST', body: { targetUid, direction, context } }),
  undo: () => request('/discovery/undo', { method: 'POST' }),
  likes: () => request('/discovery/likes'),
  setFilters: (filters) => request('/discovery/filters', { method: 'PUT', body: filters }),

  /* matches & chat */
  matches: () => request('/matches'),
  messages: (matchId) => request(`/matches/${matchId}/messages`),
  sendMessage: (matchId, body) => request(`/matches/${matchId}/messages`, { method: 'POST', body }),
  unmatch: (matchId) => request(`/matches/${matchId}`, { method: 'DELETE' }),

  /* feed */
  feed: (mode = 'foryou') => request(`/feed?mode=${mode}`),
  createPost: (post) => request('/feed', { method: 'POST', body: post }),
  likePost: (postId) => request(`/feed/${postId}/like`, { method: 'POST' }),
  comments: (postId) => request(`/feed/${postId}/comments`),
  addComment: (postId, text) => request(`/feed/${postId}/comments`, { method: 'POST', body: { text } }),
  follow: (uid) => request(`/feed/follow/${uid}`, { method: 'POST' }),

  /* verification & trust */
  verificationStatus: () => request('/verification/status'),
  submitVerification: (payload) => request('/verification/submit', { method: 'POST', body: payload }),
  umisVerify: (appJwt) => request('/verification/studenthub-umis', { method: 'POST', body: { appJwt } }),
  vouch: (targetUid) => request('/verification/vouch', { method: 'POST', body: { targetUid } }),

  /* location */
  ping: (fix) => request('/location/ping', { method: 'POST', body: fix }),
  pingBatch: (fixes) => request('/location/batch', { method: 'POST', body: { fixes } }),
  locationPolicy: () => request('/location/policy'),
  campusPlaces: (campusId) => request(`/location/campus/${campusId}/places`),

  /* media */
  uploadImage: (image, surface = 'post') => request('/media/image', { method: 'POST', body: { image, surface } }),
  uploadImages: (images, surface = 'profile') => request('/media/image/batch', { method: 'POST', body: { images, surface } }),
  mediaConfig: () => request('/media/config'),
  searchGifs: (q, offset = 0) =>
    request(`/media/gifs?q=${encodeURIComponent(q)}&offset=${offset}`),
  searchSounds: (q, page = 1) =>
    request(`/media/sounds?q=${encodeURIComponent(q)}&page=${page}`),

  /* stories & notes */
  stories: () => request('/stories'),
  createStory: (story) => request('/stories', { method: 'POST', body: story }),
  viewStory: (id) => request(`/stories/${id}/view`, { method: 'POST' }),
  deleteStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),
  notes: () => request('/stories/notes'),
  setNote: (text, music) => request('/stories/notes', { method: 'POST', body: { text, music } }),
  clearNote: () => request('/stories/notes', { method: 'DELETE' }),

  /* chat extras */
  editMessage: (matchId, mid, text) => request(`/matches/${matchId}/messages/${mid}`, { method: 'PATCH', body: { text } }),
  deleteMessage: (matchId, mid, scope = 'me') => request(`/matches/${matchId}/messages/${mid}?scope=${scope}`, { method: 'DELETE' }),
  markRead: (matchId) => request(`/matches/${matchId}/read`, { method: 'POST' }),

  /* calls (WebRTC signalling) */
  callConfig: () => request('/calls/config'),
  startCall: (peerUid, kind, offer) => request('/calls', { method: 'POST', body: { peerUid, kind, offer } }),
  answerCall: (id, answer) => request(`/calls/${id}/answer`, { method: 'POST', body: { answer } }),
  sendCandidate: (id, candidate) => request(`/calls/${id}/candidate`, { method: 'POST', body: { candidate } }),
  pollCall: (id) => request(`/calls/${id}`),
  endCall: (id, reason) => request(`/calls/${id}/end`, { method: 'POST', body: { reason } }),

  /* safety */
  report: (payload) => request('/safety/report', { method: 'POST', body: payload }),
  shareMeetup: (payload) => request('/safety/meetup', { method: 'POST', body: payload }),
  appeal: (text) => request('/safety/appeal', { method: 'POST', body: { text } }),
}

export default api
