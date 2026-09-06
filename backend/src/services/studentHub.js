/**
 * StudentHub federation client.
 *
 * Leenk is a child app of StudentHub. Two directions of data flow:
 *
 *  PULL  (sign in with StudentHub)
 *    OIDC authorization-code + PKCE -> /oauth/token -> /oauth/userinfo
 *    then /api/shared-data/profile for the richer profile payload.
 *    We take only what a dating profile legitimately needs.
 *
 *  PUSH  (sign up on Leenk)
 *    We create/attach a StudentHub identity and write the shared fields back,
 *    so the student ends up with one profile across the family of apps.
 *
 * Everything here is defensive: StudentHub being down must NEVER block Leenk.
 * Failed pushes go to an outbox and are retried (services/outbox.js).
 */

import { config } from '../lib/config.js'

const SH = config.studentHub

async function shFetch(path, { method = 'GET', body, token, headers = {}, timeoutMs } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? SH.timeoutMs)
  try {
    const res = await fetch(`${SH.baseUrl}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(SH.writeKey ? { 'X-LEENK-KEY': SH.writeKey } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json
    try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
    if (!res.ok) {
      const err = new Error(json?.error || json?.message || `StudentHub ${res.status}`)
      err.status = res.status
      err.payload = json
      throw err
    }
    return json
  } finally {
    clearTimeout(t)
  }
}

/* ------------------------------------------------------------------ *
 * PULL — sign in with StudentHub
 * ------------------------------------------------------------------ */

/** Exchange an OIDC authorization code for tokens. */
export async function exchangeCode({ code, codeVerifier, redirectUri }) {
  return shFetch('/oauth/token', {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code,
      client_id: SH.oauthClientId,
      client_secret: SH.oauthClientSecret,
      redirect_uri: redirectUri || SH.redirectUri,
      code_verifier: codeVerifier,
    },
  })
}

/** Standard OIDC claims. */
export async function fetchUserInfo(accessToken) {
  return shFetch('/oauth/userinfo', { token: accessToken })
}

/** Richer profile via the shared-data permission layer. */
export async function fetchSharedProfile(appJwt) {
  return shFetch(`/api/shared-data/profile?appId=${encodeURIComponent(SH.appId)}`, { token: appJwt })
}

/** Convert a Firebase ID token into a StudentHub app JWT. */
export async function firebaseToJwt(firebaseIdToken) {
  return shFetch('/api/auth/firebase-to-jwt', { method: 'POST', body: { firebaseIdToken } })
}

/**
 * NEW ENDPOINT REQUESTED FROM STUDENTHUB — see docs §3.1
 * Returns the Leenk-relevant slice of a StudentHub profile in one call.
 */
export async function fetchLeenkProfileBundle(appJwt) {
  return shFetch('/api/shared-data/leenk-profile', { token: appJwt })
}

/* ------------------------------------------------------------------ *
 * PUSH — sign up on Leenk, write back to StudentHub
 * ------------------------------------------------------------------ */

/**
 * NEW ENDPOINT REQUESTED FROM STUDENTHUB — see docs §3.2
 * Creates or links a StudentHub account from a Leenk signup.
 */
export async function provisionStudentHubUser(payload) {
  return shFetch('/api/auth/provision-from-child-app', {
    method: 'POST',
    body: { appId: SH.appId, ...payload },
  })
}

/**
 * NEW ENDPOINT REQUESTED FROM STUDENTHUB — see docs §3.3
 * Push profile field updates originating in Leenk.
 */
export async function pushProfileUpdate(studentHubUid, patch) {
  return shFetch('/api/shared-data/child-app-write', {
    method: 'POST',
    body: { appId: SH.appId, uid: studentHubUid, dataType: 'profile', patch },
  })
}

/* ------------------------------------------------------------------ *
 * Campus / location (Babcock UMIS + campus places)
 * ------------------------------------------------------------------ */

/** NEW ENDPOINT REQUESTED — see docs §5.2 : campus place registry. */
export async function fetchCampusPlaces(campusId) {
  return shFetch(`/api/campus/${encodeURIComponent(campusId)}/places`)
}

/** NEW ENDPOINT REQUESTED — see docs §5.3 : resolve a coordinate to a campus place. */
export async function resolveCampusPlace({ lat, lng, campusId, accuracy }) {
  return shFetch('/api/locations/resolve-place', {
    method: 'POST',
    body: { latitude: lat, longitude: lng, campusId, accuracy },
  })
}

/** Existing StudentHub route — verified enrolment for Babcock via UMIS. */
export async function fetchAcademicProfile(appJwt) {
  return shFetch('/api/users/umis/academic', { token: appJwt })
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

export async function studentHubHealth() {
  if (!SH.enabled) return { enabled: false, reachable: false, reason: 'STUDENTHUB_ENABLED=false' }
  try {
    const r = await shFetch('/health', { timeoutMs: 3000 })
    return { enabled: true, reachable: true, status: r?.status || 'ok', version: r?.version }
  } catch (e) {
    return { enabled: true, reachable: false, error: e.message }
  }
}

export const studentHubEnabled = () => SH.enabled
