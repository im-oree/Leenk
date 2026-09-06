/**
 * Media pipeline: upload, variants, moderation.
 *
 * Provider keys come from `appConfig/media.imgbbKeys` (Firestore), NOT env —
 * so adding a key or rotating a burnt one is an admin-panel edit that applies
 * within 60s. The pool is round-robined so one key's rate limit doesn't take
 * uploads down.
 *
 * Every image passes moderation BEFORE it is persisted anywhere user-visible.
 */

import { getConfig, nextKey } from './appConfig.js'
import { moderateImage } from './moderation.js'

const MAX_ATTEMPTS = 3

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export function validateUpload({ mimeType, bytes, kind = 'image' }) {
  const cfg = getConfig('media')
  const isVideo = kind === 'video'

  const allowed = isVideo ? cfg.allowedVideoTypes : cfg.allowedImageTypes
  const maxBytes = isVideo ? cfg.maxVideoBytes : cfg.maxImageBytes

  if (mimeType && !allowed.includes(mimeType)) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: `${mimeType} isn't supported.` }
  }
  if (bytes && bytes > maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `Keep ${isVideo ? 'videos' : 'images'} under ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * ImgBB upload with key rotation
 * ------------------------------------------------------------------ */

/**
 * @param base64  raw base64 (no data: prefix)
 * @returns { url, deleteUrl, thumb, medium, width, height }
 */
async function uploadToImgbb(base64, { name } = {}) {
  const endpoint = getConfig('media.imgbbEndpoint')
  let lastErr = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const key = nextKey('media.imgbbKeys')
    if (!key) {
      const err = new Error('No image upload key configured. Add one in appConfig/media.imgbbKeys.')
      err.code = 'NO_MEDIA_KEY'
      throw err
    }

    try {
      const body = new URLSearchParams()
      body.set('key', key)
      body.set('image', base64)
      if (name) body.set('name', name)

      const res = await fetch(endpoint, { method: 'POST', body })
      const json = await res.json()

      if (!res.ok || !json?.success) {
        // 400 with "invalid key" / rate limit → rotate to the next key.
        lastErr = new Error(json?.error?.message || `ImgBB responded ${res.status}`)
        continue
      }

      const d = json.data
      return {
        provider: 'imgbb',
        url: d.url,
        displayUrl: d.display_url,
        deleteUrl: d.delete_url,
        thumb: d.thumb?.url || d.url,
        medium: d.medium?.url || d.url,
        width: Number(d.width) || null,
        height: Number(d.height) || null,
        sizeBytes: Number(d.size) || null,
      }
    } catch (err) {
      lastErr = err
    }
  }

  const err = new Error(`Image upload failed after ${MAX_ATTEMPTS} attempts: ${lastErr?.message}`)
  err.code = 'UPLOAD_FAILED'
  throw err
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Full upload path: validate → moderate → store → return variant set.
 *
 * Moderation runs BEFORE upload so blocked content never reaches a CDN
 * where it would have a public URL, however briefly.
 */
export async function uploadImage({
  base64, mimeType, bytes, name, uid, surface = 'post',
}) {
  const check = validateUpload({ mimeType, bytes, kind: 'image' })
  if (!check.ok) return { ok: false, ...check }

  const mod = await moderateImage({ base64, uid, surface })
  if (mod.action === 'block') {
    return {
      ok: false,
      code: 'MODERATION_BLOCKED',
      message: mod.userMessage || "That image doesn't meet our guidelines.",
      moderation: mod,
    }
  }

  const stored = await uploadToImgbb(base64, { name })

  return {
    ok: true,
    media: {
      ...stored,
      // Progressive loading: the client paints `thumb` (blurred) instantly,
      // then swaps to `medium`/`url` — never a blank box.
      variants: { thumb: stored.thumb, medium: stored.medium, full: stored.url },
      blurhash: mod.blurhash || null,
      moderation: { status: mod.action, score: mod.score, reviewed: mod.action === 'review' },
      uploadedBy: uid,
      uploadedAt: Date.now(),
      surface,
    },
    // 'review' still publishes, but flags for a moderator — we don't punish
    // an ambiguous score by blocking a legitimate user's photo.
    pendingReview: mod.action === 'review',
  }
}

/** Media provider health for the admin panel. */
export function mediaStatus() {
  const keys = getConfig('media.imgbbKeys') || []
  return {
    provider: getConfig('media.provider'),
    keysConfigured: keys.length,
    ready: keys.length > 0,
    limits: {
      maxImageMB: Math.round(getConfig('media.maxImageBytes') / 1024 / 1024),
      maxVideoMB: Math.round(getConfig('media.maxVideoBytes') / 1024 / 1024),
      maxVideoSeconds: getConfig('media.maxVideoSeconds'),
    },
  }
}

export default { uploadImage, validateUpload, mediaStatus }
