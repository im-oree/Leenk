/**
 * Client-side location reporter.
 *
 * Mirrors the server's write policy (backend/docs §5.5) so we don't waste
 * radio, battery or requests on pings the server would reject anyway:
 *   - minimum 60 s between sends
 *   - minimum 75 m of movement
 *   - drop fixes worse than 250 m accuracy
 *   - buffer while offline, flush as a batch on reconnect
 *
 * Nothing here runs unless the user has granted permission AND the API is on.
 */

import api, { USE_API } from './api'

const R = 6_371_000
const toRad = (d) => (d * Math.PI) / 180

function distanceM(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const POLICY = { minIntervalMs: 60_000, minDistanceM: 75, maxAccuracyM: 250 }
const BUFFER_KEY = 'leenk.locbuffer'

let watchId = null
let lastSent = null
let lastSentAt = 0

const readBuffer = () => {
  try { return JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]') } catch { return [] }
}
const writeBuffer = (b) => {
  try { localStorage.setItem(BUFFER_KEY, JSON.stringify(b.slice(-50))) } catch { /* full */ }
}

async function flushBuffer() {
  const buf = readBuffer()
  if (!buf.length || !navigator.onLine) return
  try {
    await api.pingBatch(buf)
    writeBuffer([])
  } catch { /* keep buffered, try again later */ }
}

function shouldSend(fix) {
  if (fix.accuracy != null && fix.accuracy > POLICY.maxAccuracyM) return false
  if (!lastSent) return true
  if (Date.now() - lastSentAt < POLICY.minIntervalMs) return false
  return distanceM(lastSent, fix) >= POLICY.minDistanceM
}

async function handleFix(pos, campusId) {
  const fix = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: Math.round(pos.coords.accuracy || 0),
    at: Date.now(),
  }
  if (!shouldSend(fix)) return

  lastSent = fix
  lastSentAt = fix.at

  const payload = { latitude: fix.lat, longitude: fix.lng, accuracy: fix.accuracy, at: fix.at, campusId, source: 'app' }

  if (!navigator.onLine) {
    writeBuffer([...readBuffer(), payload])
    return
  }
  try {
    await api.ping(payload)
    flushBuffer()
  } catch {
    writeBuffer([...readBuffer(), payload])
  }
}

/** Ask permission and begin reporting. Returns a stop function. */
export function startLocationReporting({ campusId } = {}) {
  if (!USE_API) return () => {}
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {}
  if (watchId != null) return stopLocationReporting

  watchId = navigator.geolocation.watchPosition(
    (pos) => handleFix(pos, campusId),
    () => { /* permission denied or unavailable — silently stop trying */ },
    { enableHighAccuracy: false, maximumAge: 45_000, timeout: 20_000 },
  )

  window.addEventListener('online', flushBuffer)
  return stopLocationReporting
}

export function stopLocationReporting() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  window.removeEventListener('online', flushBuffer)
}

export const locationPolicy = () => ({ ...POLICY })
