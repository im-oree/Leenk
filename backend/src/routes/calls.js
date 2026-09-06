/**
 * WebRTC signalling for voice/video calls.
 *
 * Media is peer-to-peer — it never touches our server, which is what makes
 * this free to run. We only relay the handshake (SDP offer/answer + ICE
 * candidates) through Firestore, which the clients already subscribe to.
 *
 * Cost model:
 *   STUN  — free public servers (Google/Twilio). Handles ~85% of connections.
 *   TURN  — only needed for symmetric NAT (~15%). Not configured by default;
 *           add credentials in appConfig/calls.turnServers when needed. Until
 *           then those calls fail gracefully with a clear message rather than
 *           silently hanging.
 *
 * No Blaze plan, no credit card, no per-minute billing.
 */

import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { getConfig } from '../services/appConfig.js'
import { sendToUser } from '../services/notifications.js'

const router = Router()
router.use(requireAuth, requireVerified)

/** Both parties must be in an active match — you cannot cold-call a stranger. */
async function assertMatched(uid, peerUid) {
  const snap = await db().collection('matches').where('users', 'array-contains', uid).get()
  const match = snap.docs.find((d) => d.data().users.includes(peerUid) && d.data().status === 'active')
  return match ? { id: match.id, data: match.data() } : null
}

/* --------------------------- GET /api/calls/config -------------------------- */
/** ICE servers for RTCPeerConnection. Editable live from the admin panel. */
router.get('/config', (req, res) => {
  const cfg = getConfig('calls')
  res.json({
    success: true,
    enabled: cfg.enabled,
    audio: cfg.audioEnabled,
    video: cfg.videoEnabled,
    iceServers: [...(cfg.iceServers || []), ...(cfg.turnServers || [])],
    hasTurn: (cfg.turnServers || []).length > 0,
    maxCallMinutes: cfg.maxCallMinutes,
  })
})

/* ----------------------------- POST /api/calls ------------------------------ */
const startSchema = z.object({
  peerUid: z.string().min(2),
  kind: z.enum(['audio', 'video']).default('audio'),
  offer: z.object({ type: z.string(), sdp: z.string() }),
})

router.post('/', async (req, res, next) => {
  try {
    const cfg = getConfig('calls')
    if (!cfg.enabled) return res.status(503).json({ error: 'Calls are unavailable', code: 'FEATURE_OFF' })

    const parsed = startSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    const { peerUid, kind, offer } = parsed.data

    if (kind === 'video' && !cfg.videoEnabled) return res.status(503).json({ error: 'Video calls are off', code: 'VIDEO_OFF' })

    if (cfg.requireMatch) {
      const match = await assertMatched(req.user.uid, peerUid)
      if (!match) return res.status(403).json({ error: 'You can only call people you have matched with', code: 'NOT_MATCHED' })
    }

    const at = Date.now()
    const doc = await db().collection('calls').add({
      callerUid: req.user.uid,
      calleeUid: peerUid,
      kind,
      status: 'ringing',
      offer,
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      startedAt: at,
      answeredAt: null,
      endedAt: null,
      endedBy: null,
    })

    sendToUser(peerUid, {
      type: 'incoming_call',
      title: `${req.profile?.name || 'Someone'} is calling`,
      body: kind === 'video' ? 'Video call' : 'Voice call',
      data: { callId: doc.id, kind, callerUid: req.user.uid },
      priority: 'high',
      // Calls bypass quiet hours — a ringing phone is time-critical.
      bypassQuietHours: true,
    })

    res.status(201).json({ success: true, callId: doc.id, status: 'ringing' })
  } catch (err) { next(err) }
})

/* ------------------------ POST /api/calls/:id/answer ------------------------ */
router.post('/:id/answer', async (req, res, next) => {
  try {
    const answer = z.object({ type: z.string(), sdp: z.string() }).safeParse(req.body?.answer)
    if (!answer.success) return res.status(400).json({ error: 'Invalid answer' })

    const ref = db().collection('calls').doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Call not found' })
    const c = snap.data()
    if (c.calleeUid !== req.user.uid) return res.status(403).json({ error: 'Not your call' })
    if (c.status !== 'ringing') return res.status(409).json({ error: `Call is ${c.status}`, code: 'BAD_STATE' })

    await ref.set({ answer: answer.data, status: 'connected', answeredAt: Date.now() }, { merge: true })
    res.json({ success: true, status: 'connected' })
  } catch (err) { next(err) }
})

/* ---------------------- POST /api/calls/:id/candidate ----------------------- */
/** Trickle ICE. Called repeatedly while the connection is negotiating. */
router.post('/:id/candidate', async (req, res, next) => {
  try {
    const cand = req.body?.candidate
    if (!cand) return res.status(400).json({ error: 'Missing candidate' })

    const ref = db().collection('calls').doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Call not found' })
    const c = snap.data()

    const isCaller = c.callerUid === req.user.uid
    if (!isCaller && c.calleeUid !== req.user.uid) return res.status(403).json({ error: 'Not your call' })

    await ref.set({
      [isCaller ? 'callerCandidates' : 'calleeCandidates']: FieldValue.arrayUnion(cand),
    }, { merge: true })

    res.json({ success: true })
  } catch (err) { next(err) }
})

/* --------------------------- GET /api/calls/:id ----------------------------- */
/** Polling fallback for clients not using a Firestore realtime listener. */
router.get('/:id', async (req, res, next) => {
  try {
    const snap = await db().collection('calls').doc(req.params.id).get()
    if (!snap.exists) return res.status(404).json({ error: 'Call not found' })
    const c = snap.data()
    if (![c.callerUid, c.calleeUid].includes(req.user.uid)) return res.status(403).json({ error: 'Not your call' })

    const isCaller = c.callerUid === req.user.uid
    res.json({
      success: true,
      call: {
        id: req.params.id,
        status: c.status,
        kind: c.kind,
        offer: isCaller ? undefined : c.offer,
        answer: isCaller ? c.answer : undefined,
        // Only ever hand over the *peer's* candidates.
        peerCandidates: isCaller ? c.calleeCandidates : c.callerCandidates,
        startedAt: c.startedAt,
        answeredAt: c.answeredAt,
        endedAt: c.endedAt,
      },
    })
  } catch (err) { next(err) }
})

/* -------------------------- POST /api/calls/:id/end ------------------------- */
router.post('/:id/end', async (req, res, next) => {
  try {
    const ref = db().collection('calls').doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Call not found' })
    const c = snap.data()
    if (![c.callerUid, c.calleeUid].includes(req.user.uid)) return res.status(403).json({ error: 'Not your call' })

    const reason = req.body?.reason || 'hangup'
    const endedAt = Date.now()
    await ref.set({
      status: reason === 'declined' ? 'declined' : 'ended',
      endedAt,
      endedBy: req.user.uid,
      reason,
      durationMs: c.answeredAt ? endedAt - c.answeredAt : 0,
    }, { merge: true })

    res.json({ success: true, durationMs: c.answeredAt ? endedAt - c.answeredAt : 0 })
  } catch (err) { next(err) }
})

export default router
