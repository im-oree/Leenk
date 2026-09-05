import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { addTrustSignal } from '../services/trust.js'

const router = Router()
router.use(requireAuth)

/** Safety categories jump the queue (PRD §1.9). */
const PRIORITY = new Set(['harassment', 'threat', 'explicit', 'underage', 'impersonation', 'fake_student'])

const reportSchema = z.object({
  targetUid: z.string().optional(),
  targetType: z.enum(['user', 'post', 'message', 'comment']).default('user'),
  targetId: z.string().optional(),
  category: z.string().min(3),
  detail: z.string().max(2000).optional(),
  evidence: z.array(z.string()).max(5).optional(),
})

/* ------------------------------ POST /api/safety/report ----------------------- */
router.post('/report', async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid report', details: parsed.error.flatten() })
    const d = parsed.data

    const priority = PRIORITY.has(d.category) ? 'high' : 'normal'
    const doc = await db().collection('reports').add({
      reporterUid: req.user.uid,
      targetUid: d.targetUid || null,
      targetType: d.targetType,
      targetId: d.targetId || null,
      category: d.category,
      detail: d.detail || null,
      evidence: d.evidence || [],
      priority,
      status: 'open',
      at: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    })

    // PRD §1.8.4 — accumulated reports trigger RE-VERIFICATION, never an
    // instant ban, so mass-reporting can't be weaponised.
    if (d.targetUid) {
      await addTrustSignal(d.targetUid, { type: 'report_pending', meta: { category: d.category }, actor: 'community' })

      const all = await db().collection('reports').where('targetUid', '==', d.targetUid).get()
      const open = all.docs.filter((x) => x.data().status === 'open').length
      if (open >= 3) {
        await db().collection('users').doc(d.targetUid).set({
          verificationStatus: 'in_review',
          reverifyReason: 'COMMUNITY_FLAGS',
          verificationUpdatedAt: Date.now(),
        }, { merge: true })
      }
    }

    res.status(201).json({
      success: true,
      reportId: doc.id,
      priority,
      message: priority === 'high'
        ? 'Thanks — this goes to the front of our review queue.'
        : 'Thanks. Our moderators will review this.',
    })
  } catch (err) { next(err) }
})

/* --------------------------- Share-my-meetup (PRD §1.9) ----------------------- */
const meetupSchema = z.object({
  matchId: z.string().optional(),
  placeLabel: z.string().max(120),
  startsAt: z.number(),
  endsAt: z.number(),
  contactRef: z.string().max(200),
})

router.post('/meetup', async (req, res, next) => {
  try {
    const parsed = meetupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid meetup', details: parsed.error.flatten() })
    const d = parsed.data
    if (d.endsAt <= d.startsAt) return res.status(400).json({ error: 'endsAt must be after startsAt' })

    const doc = await db().collection('meetupShares').add({
      uid: req.user.uid,
      matchId: d.matchId || null,
      placeLabel: d.placeLabel,   // general area only, never a precise point
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      contactRef: d.contactRef,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    })
    res.status(201).json({ success: true, shareId: doc.id, expiresAt: d.endsAt })
  } catch (err) { next(err) }
})

router.post('/meetup/:id/end', async (req, res, next) => {
  try {
    await db().collection('meetupShares').doc(req.params.id).set(
      { status: 'ended', endedAt: Date.now() }, { merge: true },
    )
    res.json({ success: true })
  } catch (err) { next(err) }
})

/* ------------------------------ Moderator queue ------------------------------- */
router.get('/reports', requireAdmin, async (req, res, next) => {
  try {
    const snap = await db().collection('reports').where('status', '==', 'open').limit(100).get()
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    rows.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1) || a.at - b.at)
    res.json({ success: true, reports: rows })
  } catch (err) { next(err) }
})

router.post('/reports/:id/resolve', requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({
      resolution: z.enum(['dismissed', 'warned', 'suspended', 'banned', 'reverify']),
      reasonCode: z.string().min(2),
      note: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid resolution', details: parsed.error.flatten() })

    const ref = db().collection('reports').doc(req.params.id)
    const rep = await ref.get()
    if (!rep.exists) return res.status(404).json({ error: 'Report not found' })
    const targetUid = rep.data().targetUid

    await ref.set({
      status: 'resolved',
      resolution: parsed.data.resolution,
      reasonCode: parsed.data.reasonCode,
      note: parsed.data.note || null,
      moderatorUid: req.user.uid,
      resolvedAt: Date.now(),
    }, { merge: true })

    // Append-only moderation log
    await db().collection('moderationActions').add({
      reportId: req.params.id, targetUid,
      action: parsed.data.resolution, reasonCode: parsed.data.reasonCode,
      moderatorUid: req.user.uid, at: Date.now(), createdAt: FieldValue.serverTimestamp(),
    })

    if (targetUid) {
      if (parsed.data.resolution === 'banned') {
        await banUser(targetUid, parsed.data.reasonCode, req.user.uid)
      } else if (parsed.data.resolution === 'reverify') {
        await db().collection('users').doc(targetUid).set({ verificationStatus: 'in_review' }, { merge: true })
      } else if (parsed.data.resolution !== 'dismissed') {
        await addTrustSignal(targetUid, { type: 'report_upheld', meta: { reasonCode: parsed.data.reasonCode }, actor: 'moderator' })
      }
    }

    res.json({ success: true, resolution: parsed.data.resolution })
  } catch (err) { next(err) }
})

/**
 * Ban propagation (PRD §1.8.6) — a ban targets the PERSON:
 * account + every device fingerprint they've used.
 */
async function banUser(uid, reasonCode, moderatorUid) {
  await db().collection('users').doc(uid).set({
    status: 'banned', banReason: reasonCode, bannedAt: Date.now(), bannedBy: moderatorUid,
  }, { merge: true })

  const devices = await db().collection('deviceFingerprints').get()
  const linked = devices.docs.filter((d) => (d.data().linkedUids || []).includes(uid))
  for (const d of linked) {
    await db().collection('deviceFingerprints').doc(d.id).set(
      { banned: true, bannedAt: Date.now(), banReason: reasonCode }, { merge: true },
    )
  }

  await db().collection('bans').add({
    targetType: 'user', targetId: uid, reasonCode,
    propagatedDevices: linked.map((d) => d.id),
    moderatorUid, appealStatus: 'none', at: Date.now(), createdAt: FieldValue.serverTimestamp(),
  })
}

/* ---------------------------------- Appeals ----------------------------------- */
router.post('/appeal', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim()
    if (text.length < 10) return res.status(400).json({ error: 'Please explain your appeal' })
    const doc = await db().collection('appeals').add({
      uid: req.user.uid, text, status: 'open', at: Date.now(), createdAt: FieldValue.serverTimestamp(),
    })
    res.status(201).json({ success: true, appealId: doc.id, message: 'A human on Trust & Safety will review this.' })
  } catch (err) { next(err) }
})

export default router
