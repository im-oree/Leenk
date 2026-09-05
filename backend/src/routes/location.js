import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { ingestLocation, ingestBatch, placePresence, locationPolicy, distanceBetween } from '../services/location.js'
import { fetchCampusPlaces, resolveCampusPlace, studentHubEnabled } from '../services/studentHub.js'
import { db } from '../lib/firebase.js'
import { config } from '../lib/config.js'

const router = Router()

/**
 * Transport-level guard. The service layer applies the real policy
 * (interval / distance / plausibility); this just stops flooding.
 */
const pingLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many location updates', code: 'RATE_LIMITED' },
})

router.use(requireAuth)

const fixSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10_000).optional(),
  at: z.number().optional(),
  campusId: z.string().optional(),
  source: z.enum(['app', 'background', 'manual']).optional(),
})

/* --------------------------- POST /api/location/ping -------------------------- */
router.post('/ping', pingLimiter, async (req, res, next) => {
  try {
    const parsed = fixSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid location', details: parsed.error.flatten() })
    const d = parsed.data

    const result = await ingestLocation(req.user.uid, {
      lat: d.latitude,
      lng: d.longitude,
      accuracy: d.accuracy,
      at: d.at || Date.now(),
      campusId: d.campusId || req.profile.campusId,
      source: d.source || 'app',
    })

    // Resolve to a named campus place via StudentHub when available (Babcock).
    let place = null
    if (result.stored && studentHubEnabled()) {
      try {
        const r = await resolveCampusPlace({
          lat: d.latitude, lng: d.longitude,
          campusId: d.campusId || req.profile.campusId,
          accuracy: d.accuracy,
        })
        place = r?.place || null
        if (place?.placeId) {
          await db().collection('userLocations').doc(req.user.uid).set(
            { placeId: place.placeId, placeName: place.name }, { merge: true },
          )
        }
      } catch { /* StudentHub optional */ }
    }

    // Always 200 — the client is never told which throttle rule it hit.
    res.json({
      success: true,
      accepted: result.stored,
      place,
      nextPingAfterMs: config.location.minIntervalMs,
    })
  } catch (err) { next(err) }
})

/* --------------------------- POST /api/location/batch ------------------------- */
router.post('/batch', pingLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ fixes: z.array(fixSchema).max(50) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid batch', details: parsed.error.flatten() })

    const out = await ingestBatch(
      req.user.uid,
      parsed.data.fixes.map((f) => ({
        lat: f.latitude, lng: f.longitude, accuracy: f.accuracy,
        at: f.at || Date.now(), campusId: f.campusId || req.profile.campusId,
        source: f.source || 'background',
      })),
    )
    res.json({ success: true, ...out })
  } catch (err) { next(err) }
})

/* ---------------------------- GET /api/location/policy ------------------------ */
router.get('/policy', (_req, res) => {
  res.json({ success: true, policy: locationPolicy(), privacy: {
    storedPrecision: `${config.location.gridPrecisionM}m grid`,
    exposedToOthers: 'fuzzy distance bucket only',
    rawCoordinatesRetained: false,
  } })
})

/* --------------------------- GET /api/location/distance ----------------------- */
router.get('/distance/:uid', requireVerified, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await distanceBetween(req.user.uid, req.params.uid)) })
  } catch (err) { next(err) }
})

/* ----------------------- GET /api/location/campus/:id/places ------------------ */
router.get('/campus/:campusId/places', async (req, res, next) => {
  try {
    if (studentHubEnabled()) {
      try {
        const r = await fetchCampusPlaces(req.params.campusId)
        return res.json({ success: true, source: 'studenthub', places: r.places || r })
      } catch { /* fall through to local cache */ }
    }
    const snap = await db().collection('campusPlaces').where('campusId', '==', req.params.campusId).get()
    res.json({ success: true, source: 'leenk-cache', places: snap.docs.map((d) => d.data()) })
  } catch (err) { next(err) }
})

/* ------------------------ GET /api/location/presence/:campusId ---------------- */
router.get('/presence/:campusId', requireVerified, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await placePresence(req.params.campusId, req.query.placeId)) })
  } catch (err) { next(err) }
})

export default router
