import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { moderateText } from '../services/moderation.js'
import { getConfig } from '../services/appConfig.js'
import { logEvent } from '../services/events.js'

const PREVIEW = { image: 'Photo', gif: 'GIF', sticker: 'Sticker', voice: 'Voice note', text: '' }

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
  kind: z.enum(['text', 'image', 'gif', 'sticker', 'voice']).default('text'),
  meta: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    thumb: z.string().optional(),
    blurhash: z.string().optional(),
    durationMs: z.number().optional(),
    provider: z.string().optional(),
  }).optional(),
  replyTo: z.string().optional(),
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

    // Block if either party has blocked the other — checked at send time, not
    // just at match time, because a block can land mid-conversation.
    const [fwd, rev] = await Promise.all([
      db().collection('blocks').doc(`${req.user.uid}__${recipient}`).get(),
      db().collection('blocks').doc(`${recipient}__${req.user.uid}`).get(),
    ])
    if (fwd.exists || rev.exists) {
      return res.status(403).json({ error: 'This conversation is unavailable', code: 'BLOCKED' })
    }

    if (parsed.data.text) {
      const mod = await moderateText({ text: parsed.data.text, uid: req.user.uid, surface: 'message' })
      if (mod.action === 'block') {
        return res.status(422).json({ error: mod.userMessage, code: 'MODERATION_BLOCKED' })
      }
    }

    const at = Date.now()
    const doc = await ref.collection('messages').add({
      senderUid: req.user.uid,
      text: parsed.data.text || null,
      mediaUrl: parsed.data.mediaUrl || null,
      kind: parsed.data.kind,
      meta: parsed.data.meta || null,
      replyTo: parsed.data.replyTo || null,
      disappearing: !!parsed.data.disappearing,
      editedAt: null,
      deletedAt: null,
      at,
      createdAt: FieldValue.serverTimestamp(),
    })

    logEvent(req.user.uid, 'message_sent', { matchId: req.params.id, kind: parsed.data.kind })

    await ref.set({
      lastMessageAt: at,
      lastMessagePreview: (parsed.data.text || PREVIEW[parsed.data.kind] || 'Photo').slice(0, 120),
      unread: { [recipient]: FieldValue.increment(1) },
    }, { merge: true })

    res.status(201).json({ success: true, messageId: doc.id, at })
  } catch (err) { next(err) }
})

/* ---------------------- PATCH /api/matches/:id/messages/:mid ------------------ *
 * Editing is allowed only inside a short window (default 15 min, configurable
 * at appConfig/messaging.editWindowSeconds). After that the message stands —
 * you cannot rewrite history in someone else's conversation.
 * ------------------------------------------------------------------------- */
router.patch('/:id/messages/:mid', async (req, res, next) => {
  try {
    const text = z.string().min(1).max(2000).safeParse(req.body?.text)
    if (!text.success) return res.status(400).json({ error: 'Invalid text' })

    const ref = db().collection('matches').doc(req.params.id)
    const m = await ref.get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })

    const mref = ref.collection('messages').doc(req.params.mid)
    const msg = await mref.get()
    if (!msg.exists) return res.status(404).json({ error: 'Message not found' })
    const d = msg.data()

    if (d.senderUid !== req.user.uid) return res.status(403).json({ error: 'You can only edit your own messages' })
    if (d.deletedAt) return res.status(410).json({ error: 'Message was deleted' })
    if (d.kind && d.kind !== 'text') return res.status(400).json({ error: 'Only text messages can be edited' })

    const windowMs = (getConfig('messaging.editWindowSeconds') ?? 900) * 1000
    const age = Date.now() - (d.at || 0)
    if (age > windowMs) {
      return res.status(403).json({
        error: `Messages can only be edited within ${Math.round(windowMs / 60000)} minutes of sending.`,
        code: 'EDIT_WINDOW_CLOSED',
      })
    }

    const mod = await moderateText({ text: text.data, uid: req.user.uid, surface: 'message' })
    if (mod.action === 'block') return res.status(422).json({ error: mod.userMessage, code: 'MODERATION_BLOCKED' })

    // Keep the original for moderation/appeals — edits are transparent, not silent.
    await mref.set({
      text: text.data,
      editedAt: Date.now(),
      editHistory: FieldValue.arrayUnion({ text: d.text, at: d.editedAt || d.at }),
    }, { merge: true })

    res.json({ success: true, messageId: req.params.mid, editedAt: Date.now() })
  } catch (err) { next(err) }
})

/* ------------------ DELETE /api/matches/:id/messages/:mid -------------------- */
router.delete('/:id/messages/:mid', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'everyone' ? 'everyone' : 'me'
    const ref = db().collection('matches').doc(req.params.id)
    const m = await ref.get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })

    const mref = ref.collection('messages').doc(req.params.mid)
    const msg = await mref.get()
    if (!msg.exists) return res.status(404).json({ error: 'Message not found' })
    const d = msg.data()

    if (scope === 'everyone') {
      if (d.senderUid !== req.user.uid) return res.status(403).json({ error: 'You can only unsend your own messages' })
      const windowMs = (getConfig('messaging.deleteForEveryoneSeconds') ?? 3600) * 1000
      if (Date.now() - (d.at || 0) > windowMs) {
        return res.status(403).json({
          error: `Unsend is only available within ${Math.round(windowMs / 60000)} minutes.`,
          code: 'UNSEND_WINDOW_CLOSED',
        })
      }
      // Tombstone rather than hard delete so the thread doesn't reorder.
      await mref.set({ text: null, mediaUrl: null, meta: null, deletedAt: Date.now(), deletedBy: 'sender' }, { merge: true })
    } else {
      await mref.set({ hiddenFor: FieldValue.arrayUnion(req.user.uid) }, { merge: true })
    }

    res.json({ success: true, scope })
  } catch (err) { next(err) }
})

/* ----------------------- POST /api/matches/:id/read -------------------------- */
router.post('/:id/read', async (req, res, next) => {
  try {
    const ref = db().collection('matches').doc(req.params.id)
    const m = await ref.get()
    if (!m.exists || !m.data().users.includes(req.user.uid)) return res.status(404).json({ error: 'Match not found' })
    await ref.set({ unread: { [req.user.uid]: 0 }, lastReadAt: { [req.user.uid]: Date.now() } }, { merge: true })
    res.json({ success: true })
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
