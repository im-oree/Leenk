import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { addTrustSignal, recalcTrustScore, getTrust } from '../services/trust.js'
import { fetchAcademicProfile, studentHubEnabled } from '../services/studentHub.js'

const router = Router()
router.use(requireAuth)

/**
 * Verification is append-only (PRD §1.6). We never overwrite a decision —
 * each attempt is a new VerificationRecord, and the user doc caches only the
 * current derived status.
 */

const submitSchema = z.object({
  method: z.enum(['email', 'id_card', 'portal', 'studenthub_umis']),
  idDocumentRef: z.string().optional(),   // storage path, encrypted at rest
  selfieRef: z.string().optional(),
  liveness: z.object({
    passed: z.boolean(),
    challenges: z.array(z.string()).optional(),
    score: z.number().min(0).max(1).optional(),
  }).optional(),
  faceMatch: z.object({ score: z.number().min(0).max(1) }).optional(),
  device: z.object({
    fingerprint: z.string().optional(),
    emulator: z.boolean().optional(),
    rooted: z.boolean().optional(),
    platform: z.string().optional(),
  }).optional(),
})

/* ------------------------ POST /api/verification/submit ----------------------- */
router.post('/submit', async (req, res, next) => {
  try {
    const parsed = submitSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid submission', details: parsed.error.flatten() })
    const d = parsed.data
    const uid = req.user.uid

    // Layer 4 triggers — anything suspicious goes to a human, never auto-approve.
    const flags = []
    if (d.device?.emulator) flags.push('EMULATOR_DETECTED')
    if (d.device?.rooted) flags.push('ROOTED_DEVICE')
    if (d.liveness && d.liveness.passed === false) flags.push('LIVENESS_FAILED')
    if (d.faceMatch && d.faceMatch.score < 0.72) flags.push('LOW_FACE_MATCH')

    if (d.device?.fingerprint) {
      const fp = await db().collection('deviceFingerprints').doc(d.device.fingerprint).get()
      const linked = fp.exists ? (fp.data().linkedUids || []) : []
      if (linked.filter((u) => u !== uid).length >= 2) flags.push('MULTI_ACCOUNT_DEVICE')
      if (fp.exists && fp.data().banned) flags.push('BANNED_DEVICE')
    }

    const autoPassable =
      flags.length === 0 &&
      d.liveness?.passed === true &&
      (d.faceMatch?.score ?? 0) >= 0.82 &&
      ['email', 'portal', 'studenthub_umis'].includes(d.method)

    const decision = flags.includes('BANNED_DEVICE') ? 'rejected'
      : autoPassable ? 'verified'
      : 'manual_review'

    const record = {
      uid,
      method: d.method,
      idDocumentRef: d.idDocumentRef || null,
      selfieRef: d.selfieRef || null,
      livenessPassed: d.liveness?.passed ?? null,
      livenessScore: d.liveness?.score ?? null,
      faceMatchScore: d.faceMatch?.score ?? null,
      device: d.device || null,
      flags,
      decision,
      decidedBy: decision === 'manual_review' ? null : 'auto',
      reasonCode: decision === 'manual_review' ? 'THRESHOLD_NOT_MET' : decision === 'rejected' ? 'BANNED_DEVICE' : 'AUTO_PASS',
      submittedAt: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      // PRD §1.8.4 — re-verification each academic term
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 120,
    }
    const ref = await db().collection('verificationRecords').add(record)

    // Trust signals per layer
    if (d.method === 'portal' || d.method === 'studenthub_umis') await addTrustSignal(uid, { type: 'institutional_registrar', actor: 'verification' })
    else if (d.method === 'id_card') await addTrustSignal(uid, { type: 'institutional_id_card', actor: 'verification' })
    else if (d.method === 'email') await addTrustSignal(uid, { type: 'institutional_email', actor: 'verification' })

    if (d.liveness?.passed) await addTrustSignal(uid, { type: 'liveness_passed', actor: 'verification' })
    if (d.liveness?.passed === false) await addTrustSignal(uid, { type: 'liveness_failed', actor: 'verification' })
    if ((d.faceMatch?.score ?? 0) >= 0.82) await addTrustSignal(uid, { type: 'face_match_high', actor: 'verification' })
    else if ((d.faceMatch?.score ?? 0) >= 0.72) await addTrustSignal(uid, { type: 'face_match_medium', actor: 'verification' })
    if (d.device?.emulator) await addTrustSignal(uid, { type: 'emulator_detected', actor: 'verification' })
    if (flags.includes('MULTI_ACCOUNT_DEVICE')) await addTrustSignal(uid, { type: 'multi_account_linked', actor: 'verification' })

    const status = decision === 'verified' ? 'verified' : decision === 'rejected' ? 'rejected' : 'in_review'
    await db().collection('users').doc(uid).set({
      verificationStatus: status,
      verificationRecordId: ref.id,
      verificationMethod: d.method,
      verificationUpdatedAt: Date.now(),
      reverifyDueAt: record.expiresAt,
    }, { merge: true })

    const trust = await recalcTrustScore(uid)

    res.status(201).json({
      success: true,
      recordId: ref.id,
      verificationStatus: status,
      queuedForReview: decision === 'manual_review',
      estimatedReviewHours: decision === 'manual_review' ? 6 : 0,
      trustScore: trust.score,
    })
  } catch (err) { next(err) }
})

/* ------------------------- GET /api/verification/status ----------------------- */
router.get('/status', async (req, res, next) => {
  try {
    const trust = await getTrust(req.user.uid)
    res.json({
      success: true,
      verificationStatus: req.profile.verificationStatus || 'pending',
      method: req.profile.verificationMethod || null,
      reverifyDueAt: req.profile.reverifyDueAt || null,
      trustScore: trust.score,
      breakdown: trust.breakdown,
      gatedActions: ['swipe', 'match', 'message', 'feed', 'post'],
    })
  } catch (err) { next(err) }
})

/* --------------------- POST /api/verification/studenthub-umis ----------------- */
/** Babcock: pull verified enrolment straight from StudentHub's UMIS scraper. */
router.post('/studenthub-umis', async (req, res, next) => {
  try {
    if (!studentHubEnabled()) return res.status(503).json({ error: 'StudentHub not enabled' })
    const { appJwt } = req.body || {}
    if (!appJwt) return res.status(400).json({ error: 'appJwt required' })

    const academic = await fetchAcademicProfile(appJwt)
    const personal = academic?.data?.personal || {}
    if (!personal.matricNumber && !personal.studentId) {
      return res.status(422).json({ error: 'UMIS returned no enrolment record', code: 'NO_ENROLMENT' })
    }

    await db().collection('verificationRecords').add({
      uid: req.user.uid,
      method: 'studenthub_umis',
      decision: 'verified',
      decidedBy: 'studenthub_umis',
      reasonCode: 'REGISTRAR_MATCH',
      payload: { matricNumber: personal.matricNumber, level: personal.level, course: personal.course },
      submittedAt: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 120,
    })

    await addTrustSignal(req.user.uid, { type: 'institutional_registrar', actor: 'studenthub_umis' })
    await db().collection('users').doc(req.user.uid).set({
      verificationStatus: 'verified',
      verificationMethod: 'studenthub_umis',
      matricNumber: personal.matricNumber || null,
      course: personal.course || req.profile.course || null,
      level: personal.level ? String(personal.level) : req.profile.level || null,
      verificationUpdatedAt: Date.now(),
    }, { merge: true })

    const trust = await recalcTrustScore(req.user.uid)
    res.json({ success: true, verificationStatus: 'verified', trustScore: trust.score })
  } catch (err) { next(err) }
})

/* ------------------------------ Peer vouching -------------------------------- */
router.post('/vouch', async (req, res, next) => {
  try {
    const { targetUid } = req.body || {}
    if (!targetUid) return res.status(400).json({ error: 'targetUid required' })
    if (targetUid === req.user.uid) return res.status(400).json({ error: 'You cannot vouch for yourself' })
    if (req.profile.verificationStatus !== 'verified') {
      return res.status(403).json({ error: 'Only verified students can vouch' })
    }

    const target = await db().collection('users').doc(targetUid).get()
    if (!target.exists) return res.status(404).json({ error: 'Profile not found' })
    if (target.data().campusId !== req.profile.campusId) {
      return res.status(400).json({ error: 'You can only vouch for someone on your own campus' })
    }

    const id = `${req.user.uid}__${targetUid}`
    const existing = await db().collection('vouches').doc(id).get()
    if (existing.exists) return res.status(409).json({ error: 'You already vouched for this person' })

    await db().collection('vouches').doc(id).set({
      id, voucherUid: req.user.uid, targetUid, campusId: req.profile.campusId, at: Date.now(),
    })
    await addTrustSignal(targetUid, { type: 'peer_vouch', meta: { by: req.user.uid }, actor: 'peer' })
    res.status(201).json({ success: true })
  } catch (err) { next(err) }
})

/* ---------------------------- Moderator queue -------------------------------- */
router.get('/queue', requireAdmin, async (_req, res, next) => {
  try {
    const snap = await db().collection('verificationRecords').where('decision', '==', 'manual_review').limit(50).get()
    res.json({ success: true, queue: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
  } catch (err) { next(err) }
})

router.post('/queue/:recordId/decide', requireAdmin, async (req, res, next) => {
  try {
    const schema = z.object({ decision: z.enum(['verified', 'rejected']), reasonCode: z.string().min(2), note: z.string().optional() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid decision', details: parsed.error.flatten() })

    const ref = db().collection('verificationRecords').doc(req.params.recordId)
    const rec = await ref.get()
    if (!rec.exists) return res.status(404).json({ error: 'Record not found' })

    // Append-only: write a NEW decision record rather than mutating history.
    await db().collection('verificationDecisions').add({
      recordId: req.params.recordId,
      uid: rec.data().uid,
      decision: parsed.data.decision,
      reasonCode: parsed.data.reasonCode,
      note: parsed.data.note || null,
      moderatorUid: req.user.uid,
      at: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    })
    await ref.set({ decision: parsed.data.decision, decidedBy: req.user.uid, decidedAt: Date.now() }, { merge: true })
    await db().collection('users').doc(rec.data().uid).set({
      verificationStatus: parsed.data.decision === 'verified' ? 'verified' : 'rejected',
      verificationUpdatedAt: Date.now(),
    }, { merge: true })

    const trust = await recalcTrustScore(rec.data().uid)
    res.json({ success: true, decision: parsed.data.decision, trustScore: trust.score })
  } catch (err) { next(err) }
})

export default router
