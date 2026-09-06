/**
 * Geospatial helpers for campus/location logic.
 *
 * Design goals:
 *  - never store or expose an exact coordinate for another user
 *  - cheap enough to run on every location ping
 *  - resistant to spoofing and spam (see services/location.js)
 */

const R = 6_371_000 // Earth radius, metres
const toRad = (d) => (d * Math.PI) / 180

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const distanceKm = (a, b) => distanceMeters(a, b) / 1000

/**
 * Snap a coordinate to a fixed grid so we never persist a precise point.
 * precisionM = 250 gives ~250 m cells — enough for "on campus" / "nearby",
 * useless for finding someone's hostel room.
 */
export function snapToGrid({ lat, lng }, precisionM = 250) {
  const latStep = precisionM / 111_320
  const lngStep = precisionM / (111_320 * Math.max(0.1, Math.cos(toRad(lat))))
  return {
    lat: Math.round(lat / latStep) * latStep,
    lng: Math.round(lng / lngStep) * lngStep,
  }
}

/** Stable cell id for grouping/counting without revealing coordinates. */
export function gridCellId({ lat, lng }, precisionM = 250) {
  const s = snapToGrid({ lat, lng }, precisionM)
  return `${s.lat.toFixed(5)}:${s.lng.toFixed(5)}:${precisionM}`
}

/**
 * Geohash — used for cheap range queries in Firestore
 * (where('geohash','>=',lo).where('geohash','<=',hi)).
 */
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function geohash({ lat, lng }, precision = 9) {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180
  let hash = '', bits = 0, bit = 0, even = true

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2
      if (lng > mid) { bit = (bit << 1) + 1; lngMin = mid } else { bit <<= 1; lngMax = mid }
    } else {
      const mid = (latMin + latMax) / 2
      if (lat > mid) { bit = (bit << 1) + 1; latMin = mid } else { bit <<= 1; latMax = mid }
    }
    even = !even
    if (++bits === 5) { hash += B32[bit]; bits = 0; bit = 0 }
  }
  return hash
}

/** Bounding-box prefix pair for a radius query. */
export function geohashRange(center, radiusM) {
  // precision that roughly contains the radius
  const table = [[5_000_000, 1], [625_000, 2], [156_000, 3], [19_500, 4], [4_890, 5], [610, 6], [153, 7], [19, 8]]
  const p = table.find(([m]) => radiusM > m)?.[1] ?? 9
  const h = geohash(center, p)
  return { lo: h, hi: `${h}~` }
}

/**
 * Bucket a distance into a fuzzy, user-safe label.
 * We never return a precise distance to the client.
 */
export function fuzzyDistance(meters) {
  if (meters < 400) return { bucket: 'here', label: 'On your campus', km: 0 }
  if (meters < 2_000) return { bucket: 'walk', label: 'Walking distance', km: 1 }
  if (meters < 5_000) return { bucket: 'close', label: 'Under 5 km', km: 5 }
  if (meters < 15_000) return { bucket: 'near', label: 'Under 15 km', km: 15 }
  if (meters < 40_000) return { bucket: 'city', label: 'Same city', km: 40 }
  return { bucket: 'far', label: 'Further away', km: Math.round(meters / 1000) }
}

/**
 * Plausibility check: could the user physically have travelled from `prev`
 * to `next` in the elapsed time? Catches GPS spoofing and teleporting VPNs.
 */
export function isPlausibleMovement(prev, next, maxSpeedMps = 55) {
  if (!prev) return { ok: true, speedMps: 0 }
  const dt = (next.at - prev.at) / 1000
  if (dt <= 0) return { ok: false, reason: 'NON_MONOTONIC_TIME', speedMps: Infinity }
  const d = distanceMeters(prev, next)
  const speed = d / dt
  return { ok: speed <= maxSpeedMps, speedMps: Math.round(speed * 10) / 10, distanceM: Math.round(d) }
}
