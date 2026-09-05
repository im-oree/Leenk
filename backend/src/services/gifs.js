import { getConfig } from './appConfig.js'

/**
 * GIF search, provider-abstracted.
 *
 * IMPORTANT — Tenor is gone. Google froze new Tenor API key registration on
 * 2026-01-13 and fully decommissioned the third-party API on 2026-06-30; all
 * requests now error. We cannot use it, and we cannot even sign up. The old
 * `messaging.gifProvider: 'tenor'` default is therefore dead config.
 *
 * Providers are pluggable via `appConfig.messaging.gifProvider` so this can be
 * switched from the admin panel with no deploy:
 *
 *   klipy   - free-forever tier, no credit card. Default. This is where
 *             WhatsApp/Discord/Bluesky migrated after the Tenor shutdown.
 *   giphy   - works, but no longer has a free tier -> violates our zero-cost
 *             constraint. Wired for completeness, off by default.
 *   none    - disables remote search; the curated built-in pack still works.
 *
 * Every provider normalises to ONE shape so the client never branches:
 *   { id, description, preview{url,width,height}, full{url,width,height} }
 *
 * `preview` is a small looping asset for the grid, `full` is what actually
 * gets sent in a message. Keeping them separate matters a lot on Nigerian
 * mobile data — the grid would otherwise pull tens of MB of full-size GIFs.
 */

const TIMEOUT_MS = 7000

async function getJson(url, headers = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers })
    if (!res.ok) {
      const err = new Error(`GIF provider responded ${res.status}`)
      err.status = res.status
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

/* ------------------------------- klipy --------------------------------- */

async function klipySearch({ q, limit, offset, apiKey }) {
  const base = 'https://api.klipy.com/api/v1'
  const path = q ? 'gifs/search' : 'gifs/trending'
  const params = new URLSearchParams({
    per_page: String(limit),
    page: String(Math.floor(offset / limit) + 1),
    content_filter: 'high', // campus app: strictest safety tier available
  })
  if (q) params.set('q', q)

  const data = await getJson(`${base}/${apiKey}/${path}?${params}`)
  const items = data?.data?.data || data?.data || []

  return items.map((g) => {
    const f = g.file?.hd || g.file?.md || g.file?.sm || {}
    const p = g.file?.sm || g.file?.md || f
    return {
      id: String(g.id ?? g.slug),
      description: g.title || g.slug || 'GIF',
      preview: { url: p?.gif?.url || p?.webp?.url, width: num(p?.gif?.width), height: num(p?.gif?.height) },
      full: { url: f?.gif?.url || f?.webp?.url, width: num(f?.gif?.width), height: num(f?.gif?.height) },
    }
  })
}

/* ------------------------------- giphy --------------------------------- */

async function giphySearch({ q, limit, offset, apiKey }) {
  const base = 'https://api.giphy.com/v1/gifs'
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(limit),
    offset: String(offset),
    rating: 'pg-13',
  })
  if (q) params.set('q', q)

  const data = await getJson(`${base}/${q ? 'search' : 'trending'}?${params}`)
  return (data.data || []).map((g) => ({
    id: g.id,
    description: g.title || 'GIF',
    preview: {
      url: g.images?.fixed_width_small?.url || g.images?.preview_gif?.url,
      width: num(g.images?.fixed_width_small?.width),
      height: num(g.images?.fixed_width_small?.height),
    },
    full: {
      url: g.images?.downsized_medium?.url || g.images?.original?.url,
      width: num(g.images?.downsized_medium?.width),
      height: num(g.images?.downsized_medium?.height),
    },
  }))
}

/* ------------------------------ dispatch -------------------------------- */

export function gifStatus() {
  const provider = getConfig('messaging.gifProvider') || 'none'
  const keys = getConfig('messaging.gifApiKeys') || {}
  const apiKey = keys[provider]
  const remote = provider !== 'none' && Boolean(apiKey)
  return {
    provider,
    remote,                       // is live search available?
    // Tell the client WHY search is off, so it can show honest copy instead
    // of an empty grid that looks broken.
    reason: remote ? null : provider === 'none' ? 'PROVIDER_DISABLED' : 'NO_PROVIDER_KEY',
    tenorRetired: true,
  }
}

export async function searchGifs({ q = '', limit = 24, offset = 0 }) {
  const { provider, remote } = gifStatus()
  if (!remote) return { items: [], provider, remote: false }

  const apiKey = (getConfig('messaging.gifApiKeys') || {})[provider]
  const args = { q: q.trim(), limit: Math.min(Math.max(limit, 1), 50), offset: Math.max(offset, 0), apiKey }

  const fn = { klipy: klipySearch, giphy: giphySearch }[provider]
  if (!fn) return { items: [], provider, remote: false }

  const items = (await fn(args)).filter((g) => g.preview?.url && g.full?.url)
  return { items, provider, remote: true }
}
