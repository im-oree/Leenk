import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { toStudentHub, PUSH_FIELDS, PRIVATE_TO_LEENK } from '../services/profileMapper.js'
import { enqueue } from '../services/outbox.js'
import { getTrust } from '../services/trust.js'
import { distanceBetween } from '../services/location.js'

const router = Router()
router.use(requireAuth)

const updateSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  bio: z.string().max(300).optional(),
  photos: z.array(z.string()).max(6).optional(),
  prompts: z.array(z.object({ q: z.string().max(120), a: z.string().max(200) })).max(3).optional(),
  intent: z.string().optional(),
  department: z.string().optional(),
  level: z.string().optional(),
  privacy: z.object({
    discoverability: z.enum(['home', 'nearby', 'everyone']).optional(),
    visible: z.boolean().optional(),
    readReceipts: z.boolean().optional(),
    showActive: z.boolean().optional(),
  }).optional(),
})

/* ------------------------------ GET /api/profile ------------------------------ */
router.get('/', async (req, res, next) => {
  try {
    const trust = await getTrust(req.user.uid)
    const { trustBreakdown, ...safe } = req.profile
    res.json({ success: true, profile: { ...safe, trustScore: trust.score } })
  } catch (err) { next(err) }
})

/* ------------------------------ PUT /api/profile ------------------------------ */
router.put('/', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid profile', details: parsed.error.flatten() })

    const patch = { ...parsed.data, updatedAt: Date.now() }
    if (patch.privacy) patch.privacy = { ...(req.profile.privacy || {}), ...patch.privacy }

    await db().collection('users').doc(req.user.uid).set(patch, { merge: true })
    const updated = (await db().collection('users').doc(req.user.uid).get()).data()

    // Mirror only the shared fields upstream; dating data never leaves Leenk.
    const link = await db().collection('studentHubLinks').doc(req.user.uid).get()
    const shPatch = toStudentHub(patch)
    if (link.exists && Object.keys(shPatch).length) {
      await enqueue('profile.update', {
        studentHubUid: link.data().studentHubUid,
        patch: shPatch,
      }, { dedupeKey: `profile:${req.user.uid}:${Date.now()}` })
    }

    res.json({
      success: true,
      profile: updated,
      syncedToStudentHub: link.exists ? Object.keys(shPatch) : [],
      keptPrivate: Object.keys(patch).filter((k) => PRIVATE_TO_LEENK.includes(k)),
    })
  } catch (err) { next(err) }
})

/* --------------------------- GET /api/profile/:uid ---------------------------- */
router.get('/:uid', requireVerified, async (req, res, next) => {
  try {
    const snap = await db().collection('users').doc(req.params.uid).get()
    if (!snap.exists) return res.status(404).json({ error: 'Profile not found' })
    const d = snap.data()
    if (d.status !== 'active') return res.status(404).json({ error: 'Profile not available' })

    const blocked = await db().collection('blocks').doc(`${d.uid}__${req.user.uid}`).get()
    if (blocked.exists) return res.status(404).json({ error: 'Profile not found' })

    const dist = await distanceBetween(req.user.uid, d.uid)

    res.json({
      success: true,
      profile: {
        uid: d.uid, name: d.name, age: d.age, photos: d.photos || [],
        bio: d.bio || '', prompts: d.prompts || [],
        campusId: d.campusId, department: d.department, level: d.level, intent: d.intent,
        verified: d.verificationStatus === 'verified',
        distance: { label: dist.label, bucket: dist.bucket },
        // never exposed: trustScore, phone, email, matric, exact location
      },
    })
  } catch (err) { next(err) }
})

/* --------------------- GET /api/profile/sync/studenthub ----------------------- */
router.get('/sync/studenthub', async (req, res, next) => {
  try {
    const link = await db().collection('studentHubLinks').doc(req.user.uid).get()
    res.json({
      success: true,
      linked: link.exists,
      studentHubUid: link.exists ? link.data().studentHubUid : null,
      lastSyncAt: link.exists ? link.data().lastSyncAt : null,
      pushFields: PUSH_FIELDS,
      privateFields: PRIVATE_TO_LEENK,
    })
  } catch (err) { next(err) }
})

/* ------------------------------- Blocking ------------------------------------ */
router.post('/:uid/block', requireVerified, async (req, res, next) => {
  try {
    const id = `${req.user.uid}__${req.params.uid}`
    await db().collection('blocks').doc(id).set({
      id, blockerUid: req.user.uid, blockedUid: req.params.uid, at: Date.now(), createdAt: FieldValue.serverTimestamp(),
    })
    res.status(201).json({ success: true })
  } catch (err) { next(err) }
})

router.delete('/:uid/block', requireVerified, async (req, res, next) => {
  try {
    await db().collection('blocks').doc(`${req.user.uid}__${req.params.uid}`).delete()
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
