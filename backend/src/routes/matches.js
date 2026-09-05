import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth, requireVerified)

const other = (match, uid) => match.users.find((u) => u !== uid)

async function hydrate(match, uid) {
  const o = await db().collection('users').doc(other(match, uid)).get()
  const d = o.exists ? o.data() : null
  return {
    id: match.id,
    createdAtMs: match.createdAtMs,
    lastMessageAt: match.lastMessageAt,
    superLike: !!match.superLike,
    unread: match.unread?.[uid] || 0,
    user: d && {
      uid: d.uid, name: d.name, age: d.age, photos: d.photos || [],
      campusId: d.campusId, department: d.department,
      verified: d.verificationStatus === 'verified',
    },
  }
}

/* ----------------------------- GET /api/matches ----------------------------- */
router.get('/', async (req, res, next) => {
  try {
    const snap = await db().collection('matches').where('users', 'array-contains', req.user.uid).get()
    const active = snap.docs.map((d) => d.data()).filter((m) => m.status === 'active')
    const list = await Promise.all(active.map((m) => hydrate(m, req.user.uid)))
    list.sort((a, b) => (b.lastMessageAt || b.createdAtMs || 0) - (a.lastMessageAt || a.createdAtMs || 0))
    res.json({ success: true, matches: list })
  } catch (err) { next(err) }
})

/* ------------------------ GET /api/matches/:id/messages ---------------------- */
router.get('/:id/messages', async (req, res, next) => {
  try {
    const m = await db().collection('matches').doc(req.params.id).get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })

    const snap = await db().collection('matches').doc(req.params.id).collection('messages').orderBy('at', 'asc').limit(200).get()
    await db().collection('matches').doc(req.params.id).set({ unread: { [req.user.uid]: 0 } }, { merge: true })

    res.json({
      success: true,
      messages: snap.docs.map((d) => {
        const x = d.data()
        return { id: d.id, text: x.text, mediaUrl: x.mediaUrl || null, disappearing: !!x.disappearing, mine: x.senderUid === req.user.uid, at: x.at }
      }),
    })
  } catch (err) { next(err) }
})

/* ------------------------ POST /api/matches/:id/messages --------------------- */
const msgSchema = z.object({
  text: z.string().max(2000).optional(),
  mediaUrl: z.string().url().optional(),
  disappearing: z.boolean().optional(),
})

router.post('/:id/messages', async (req, res, next) => {
  try {
    const parsed = msgSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid message', details: parsed.error.flatten() })
    if (!parsed.data.text && !parsed.data.mediaUrl) return res.status(400).json({ error: 'Message must have text or media' })

    const ref = db().collection('matches').doc(req.params.id)
    const m = await ref.get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })
    if (m.data().status !== 'active') return res.status(410).json({ error: 'This conversation is closed' })

    const recipient = other(m.data(), req.user.uid)
    const at = Date.now()
    const doc = await ref.collection('messages').add({
      senderUid: req.user.uid,
      text: parsed.data.text || null,
      mediaUrl: parsed.data.mediaUrl || null,
      disappearing: !!parsed.data.disappearing,
      at,
      createdAt: FieldValue.serverTimestamp(),
    })

    await ref.set({
      lastMessageAt: at,
      lastMessagePreview: (parsed.data.text || 'Photo').slice(0, 120),
      unread: { [recipient]: FieldValue.increment(1) },
    }, { merge: true })

    res.status(201).json({ success: true, messageId: doc.id, at })
  } catch (err) { next(err) }
})

/* --------------------------- DELETE /api/matches/:id -------------------------- */
router.delete('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('matches').doc(req.params.id)
    const m = await ref.get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })

    // PRD §1.5.E — unmatch deletes the thread for BOTH sides immediately.
    const msgs = await ref.collection('messages').get()
    for (const d of msgs.docs) await ref.collection('messages').doc(d.id).delete()

    await ref.set({
      status: 'unmatched',
      unmatchedBy: req.user.uid,
      unmatchedAt: Date.now(),
      lastMessagePreview: null,
    }, { merge: true })

    res.json({ success: true, message: 'Unmatched. The conversation was deleted for both of you.' })
  } catch (err) { next(err) }
})

export default router
