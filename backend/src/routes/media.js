import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { uploadImage, mediaStatus } from '../services/media.js'
import { moderationStatus } from '../services/moderation.js'
import { getConfig } from '../services/appConfig.js'
import { searchGifs, gifStatus } from '../services/gifs.js'
import { searchSounds, soundStatus } from '../services/sounds.js'

/** Upstream provider failures we swallow into an empty result. */
const isUpstreamFailure = (err) =>
  Boolean(err?.status) ||
  err?.name === 'AbortError' ||
  err?.name === 'TypeError' ||        // undici 'fetch failed' (DNS/socket)
  ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err?.code) ||
  ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err?.cause?.code)

const router = Router()
router.use(requireAuth)

// Uploads are expensive; cap them well below the general API limit.
const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many uploads. Give it a moment.', code: 'UPLOAD_RATE_LIMIT' },
})

const uploadSchema = z.object({
  // Accept a bare base64 string or a data: URL; we normalise below.
  image: z.string().min(32),
  name: z.string().max(120).optional(),
  surface: z.enum(['profile', 'post', 'story', 'chat']).default('post'),
  mimeType: z.string().optional(),
})

const stripDataUrl = (s) => {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(s)
  return m ? { mimeType: m[1], base64: m[2] } : { mimeType: null, base64: s }
}

/* ------------------------- POST /api/media/image ------------------------- */
router.post('/image', uploadLimiter, async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    }
    const d = parsed.data
    const { mimeType, base64 } = stripDataUrl(d.image)
    const bytes = Math.floor((base64.length * 3) / 4)

    const result = await uploadImage({
      base64,
      mimeType: d.mimeType || mimeType,
      bytes,
      name: d.name,
      uid: req.user.uid,
      surface: d.surface,
    })

    if (!result.ok) {
      const status = result.code === 'MODERATION_BLOCKED' ? 422 : 400
      return res.status(status).json({ error: result.message, code: result.code })
    }

    res.status(201).json({ success: true, media: result.media, pendingReview: result.pendingReview })
  } catch (err) {
    if (err.code === 'NO_MEDIA_KEY') {
      return res.status(503).json({
        error: 'Image uploads are not configured yet.',
        code: 'NO_MEDIA_KEY',
        hint: 'Add an ImgBB key to appConfig/media.imgbbKeys.',
      })
    }
    if (err.code === 'UPLOAD_FAILED') {
      return res.status(502).json({ error: 'Upload failed. Try again.', code: 'UPLOAD_FAILED' })
    }
    next(err)
  }
})

/* --------------------- POST /api/media/image/batch ---------------------- */
router.post('/image/batch', uploadLimiter, async (req, res, next) => {
  try {
    const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 6) : []
    if (!images.length) return res.status(400).json({ error: 'No images supplied' })

    const surface = req.body.surface || 'profile'
    const results = await Promise.all(
      images.map(async (img) => {
        const { mimeType, base64 } = stripDataUrl(typeof img === 'string' ? img : img.image)
        try {
          return await uploadImage({
            base64,
            mimeType,
            bytes: Math.floor((base64.length * 3) / 4),
            uid: req.user.uid,
            surface,
          })
        } catch (err) {
          return { ok: false, code: err.code || 'UPLOAD_FAILED', message: err.message }
        }
      }),
    )

    res.status(201).json({
      success: true,
      uploaded: results.filter((r) => r.ok).map((r) => r.media),
      failed: results.filter((r) => !r.ok).map((r) => ({ code: r.code, message: r.message })),
    })
  } catch (err) { next(err) }
})

/* ---------------------------- GET /api/media/config --------------------- */
/** Lets the client know limits + whether uploads are live, before it tries. */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    media: mediaStatus(),
    moderation: moderationStatus(),
    gifs: gifStatus(),
    sounds: soundStatus(),
    gifProvider: getConfig('messaging.gifProvider'),
    features: getConfig('features'),
  })
})

/* ---------------------------- GET /api/media/gifs ----------------------- */
/** Proxied so the provider key never reaches the client and can be rotated
 *  from the admin panel without shipping an app update. */
const browseLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Slow down a moment.', code: 'BROWSE_RATE_LIMIT' },
})

router.get('/gifs', browseLimiter, async (req, res, next) => {
  try {
    if (!getConfig('features.gifs')) {
      return res.status(403).json({ error: 'GIFs are turned off.', code: 'FEATURE_OFF' })
    }
    const q = String(req.query.q || '').slice(0, 80)
    const limit = Number(req.query.limit) || 24
    const offset = Number(req.query.offset) || 0
    const out = await searchGifs({ q, limit, offset })
    res.json({ success: true, ...out })
  } catch (err) {
    // A dead upstream must not break the composer — return an honest empty
    // state the client can render, not a 500.
    // Any upstream failure — bad status, timeout, DNS/socket error — must
    // degrade to an empty grid, never a 500 that breaks the composer.
    if (isUpstreamFailure(err)) {
      return res.json({ success: true, items: [], remote: false, reason: 'PROVIDER_UNAVAILABLE' })
    }
    next(err)
  }
})

/* --------------------------- GET /api/media/sounds ---------------------- */
router.get('/sounds', browseLimiter, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').slice(0, 80)
    const limit = Number(req.query.limit) || 20
    const page = Number(req.query.page) || 1
    const out = await searchSounds({ q, limit, page })
    res.json({ success: true, ...out })
  } catch (err) {
    // Any upstream failure — bad status, timeout, DNS/socket error — must
    // degrade to an empty grid, never a 500 that breaks the composer.
    if (isUpstreamFailure(err)) {
      return res.json({ success: true, items: [], remote: false, reason: 'PROVIDER_UNAVAILABLE' })
    }
    next(err)
  }
})

export default router
