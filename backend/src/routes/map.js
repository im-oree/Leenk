import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { db } from '../lib/firebase.js'
import { buildMap, mapConfig, setMapSettings, getVisibility, recordMapView } from '../services/map.js'

const router = Router()
router.use(requireAuth)

const mapLimiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Slow down.', code: 'MAP_RATE_LIMIT' },
})

/* ------------------------------ GET /api/map/config ---------------------- */
router.get('/config', async (req, res, next) => {
  try {
    const c = mapConfig()
    const me = await db().collection('users').doc(req.user.uid).get()
    res.json({
      success: true,
      enabled: c.enabled,
      tileStyleUrl: c.tileStyleUrl,
      tileStyleUrlDark: c.tileStyleUrlDark,
      kAnonymity: c.kAnonymity,
      settings: getVisibility(me.exists ? me.data() : null),
      // Ghost mode is free — never gate a safety control behind payment.
      ghostIsFree: true,
    })
  } catch (err) { next(err) }
})

/* --------------------------------- GET /api/map -------------------------- */
router.get('/', requireVerified, mapLimiter, async (req, res, next) => {
  try {
    const me = await db().collection('users').doc(req.user.uid).get()
    if (!me.exists) return res.status(404).json({ error: 'Account not found' })
    res.json({ success: true, ...(await buildMap({ uid: req.user.uid, ...me.data() })) })
  } catch (err) { next(err) }
})

/* -------------------------- PATCH /api/map/settings ---------------------- */
const settingsSchema = z.object({
  visibility: z.enum(['off', 'heatmap', 'mutuals']).optional(),
  ghost: z.boolean().optional(),
  hiddenFrom: z.array(z.string()).optional(),
})

router.patch('/settings', async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid settings', code: 'BAD_SETTINGS' })
    res.json({ success: true, settings: await setMapSettings(req.user.uid, parsed.data) })
  } catch (err) { next(err) }
})

/* ---------------------------- POST /api/map/view ------------------------- */
/**
 * Records that the viewer opened someone's pin. Always returns 200 with no
 * hint about the anti-stalking outcome — surfacing it would teach evasion.
 */
router.post('/view/:uid', mapLimiter, async (req, res, next) => {
  try {
    await recordMapView(req.user.uid, req.params.uid, {
      interacted: Boolean(req.body?.interacted),
      unmatched: Boolean(req.body?.unmatched),
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
