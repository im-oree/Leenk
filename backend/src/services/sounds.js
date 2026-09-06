import { getConfig } from './appConfig.js'

/**
 * Sound / music library for the composer — zero cost, no API key, no card.
 *
 * Provider: Openverse (WordPress Foundation). Chosen because it is the only
 * quality option that satisfies every constraint at once:
 *   - anonymous access works with NO API key and NO credit card
 *   - it indexes Creative Commons + public-domain audio (Jamendo, FMA, ccMixter)
 *   - every result carries machine-readable licence + attribution metadata,
 *     which we need since users publish these tracks publicly
 *
 * Rejected: Jamendo (requires client_id registration, and its free tier is
 * non-commercial only), Pixabay (key required), Spotify/Deezer (licensing).
 *
 * Anonymous callers are capped at 20 results/page by Openverse policy, and
 * their ToS forbids scraping and multi-machine rate-limit evasion — so we
 * proxy through the backend, cache, and stay inside one page per request.
 *
 * LICENCE SAFETY: we filter to `commercial`+`modification` licence types.
 * Users are remixing these into posts on a monetised app, so NC / ND tracks
 * are not safe to offer. Attribution ships with every track and must be
 * rendered wherever the sound is credited.
 */

const TIMEOUT_MS = 8000
const BASE = 'https://api.openverse.org/v1'

// Small in-memory cache: sound search is browsed repeatedly with the same
// handful of queries, and it keeps us well inside the anonymous rate limit.
const cache = new Map()
const TTL_MS = 10 * 60 * 1000

const cacheGet = (k) => {
  const hit = cache.get(k)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) { cache.delete(k); return null }
  return hit.value
}
const cacheSet = (k, value) => {
  if (cache.size > 200) cache.clear()
  cache.set(k, { value, at: Date.now() })
}

async function getJson(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Leenk/1.0 (campus social app)' },
    })
    if (!res.ok) {
      const err = new Error(`Sound provider responded ${res.status}`)
      err.status = res.status
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

/** Normalise an Openverse audio record to the shape the composer consumes. */
function normalise(a) {
  const url = a.url || a.audio_set?.url
  if (!url) return null
  return {
    id: a.id,
    title: a.title || 'Untitled',
    artist: a.creator || 'Unknown artist',
    duration: Math.round((a.duration || 0) / 1000) || null, // ms -> s
    url,
    thumbnail: a.thumbnail || null,
    // Attribution is not optional for CC content — carry it end to end.
    license: { code: a.license, version: a.license_version, url: a.license_url },
    attribution: a.attribution || `${a.title} by ${a.creator} (${(a.license || '').toUpperCase()})`,
    source: a.source || 'openverse',
    foreignUrl: a.foreign_landing_url || null,
  }
}

export function soundStatus() {
  const provider = getConfig('media.soundProvider') || 'openverse'
  return { provider, remote: provider !== 'none', requiresKey: false }
}

export async function searchSounds({ q = '', limit = 20, page = 1 }) {
  const { remote, provider } = soundStatus()
  if (!remote) return { items: [], provider, remote: false }

  // Anonymous Openverse is hard-capped at 20 per page.
  const pageSize = Math.min(Math.max(limit, 1), 20)
  const params = new URLSearchParams({
    page_size: String(pageSize),
    page: String(Math.max(page, 1)),
    // Only licences that permit commercial use AND remixing.
    license_type: 'commercial,modification',
    // Full songs, not one-shot samples — this is a music picker.
    category: 'music',
  })
  params.set('q', q.trim() || 'instrumental')

  const key = params.toString()
  const cached = cacheGet(key)
  if (cached) return { ...cached, cached: true }

  const data = await getJson(`${BASE}/audio/?${params}`)
  const items = (data.results || []).map(normalise).filter(Boolean)

  const value = { items, provider, remote: true, total: data.result_count ?? items.length }
  cacheSet(key, value)
  return value
}
