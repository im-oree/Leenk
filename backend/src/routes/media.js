import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { uploadImage, mediaStatus } from '../services/media.js'
import { moderationStatus } from '../services/moderation.js'
import { getConfig } from '../services/appConfig.js'

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
    gifProvider: getConfig('messaging.gifProvider'),
    features: getConfig('features'),
  })
})

export default router
