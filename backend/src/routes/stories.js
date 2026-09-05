/**
 * Stories (24h) and Notes (Instagram-style short status).
 *
 * Both are verification-gated and never publicly viewable (PRD §1.5).
 * Story rings on profiles are driven by `hasActiveStory` computed here.
 */

import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { getConfig } from '../services/appConfig.js'
import { moderateText } from '../services/moderation.js'
import { logEvent } from '../services/events.js'

const router = Router()
router.use(requireAuth, requireVerified)

const ttlMs = () => (getConfig('feed.storyTtlHours') ?? 24) * 3_600_000

/** Everyone the viewer can see stories from: people they follow + matches. */
async function audienceFor(uid) {
  const [following, matches] = await Promise.all([
    db().collection('follows').where('followerUid', '==', uid).get(),
    db().collection('matches').where('users', 'array-contains', uid).get(),
  ])
  const set = new Set(following.docs.map((d) => d.data().followingUid))
  matches.docs.forEach((d) => d.data().users.forEach((u) => u !== uid && set.add(u)))
  return set
}

/* ----------------------------- GET /api/stories ---------------------------- */
/** Story rail: one entry per author, unwatched first. */
router.get('/', async (req, res, next) => {
  try {
    const me = req.user.uid
    const cutoff = Date.now() - ttlMs()
    const audience = await audienceFor(me)
    audience.add(me) // your own story leads the rail

    const snap = await db().collection('stories').where('at', '>', cutoff).get()

    const byAuthor = new Map()
    for (const doc of snap.docs) {
      const s = { id: doc.id, ...doc.data() }
      if (!audience.has(s.authorUid)) continue
      if (!byAuthor.has(s.authorUid)) byAuthor.set(s.authorUid, [])
      byAuthor.get(s.authorUid).push(s)
    }

    const authorIds = [...byAuthor.keys()]
    const authors = await Promise.all(
      authorIds.map((uid) => db().collection('users').doc(uid).get().then((d) => d.data()).catch(() => null)),
    )
    const authorMap = new Map(authorIds.map((uid, i) => [uid, authors[i]]))

    const rail = authorIds
      .map((uid) => {
        const items = byAuthor.get(uid).sort((a, b) => a.at - b.at)
        const a = authorMap.get(uid)
        const allSeen = items.every((s) => (s.viewers || []).includes(me))
        return {
          authorUid: uid,
          name: a?.name || 'Student',
          avatar: a?.photos?.[0] || null,
          verified: a?.verificationStatus === 'verified',
          isMe: uid === me,
          hasUnseen: !allSeen,
          count: items.length,
          latestAt: items[items.length - 1].at,
          items: items.map((s) => ({
            id: s.id, mediaUrl: s.mediaUrl, thumb: s.thumb, blurhash: s.blurhash,
            kind: s.kind, caption: s.caption, at: s.at,
            expiresAt: s.at + ttlMs(),
            seen: (s.viewers || []).includes(me),
            viewCount: uid === me ? (s.viewers || []).length : undefined,
          })),
        }
      })
      // unseen first, then own, then recency
      .sort((a, b) => (b.hasUnseen - a.hasUnseen) || (b.isMe - a.isMe) || (b.latestAt - a.latestAt))

    res.json({ success: true, rail })
  } catch (err) { next(err) }
})

/* ----------------------------- POST /api/stories --------------------------- */
const storySchema = z.object({
  mediaUrl: z.string().url(),
  thumb: z.string().url().optional(),
  blurhash: z.string().optional(),
  kind: z.enum(['image', 'video']).default('image'),
  caption: z.string().max(200).optional(),
  durationMs: z.number().max(90_000).optional(),
  music: z.object({ title: z.string(), artist: z.string().optional(), url: z.string().optional() }).optional(),
})

router.post('/', async (req, res, next) => {
  try {
    if (!getConfig('features.stories')) return res.status(503).json({ error: 'Stories are unavailable', code: 'FEATURE_OFF' })

    const parsed = storySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid story', details: parsed.error.flatten() })
    const d = parsed.data

    if (d.caption) {
      const mod = await moderateText({ text: d.caption, uid: req.user.uid, surface: 'story' })
      if (mod.action === 'block') return res.status(422).json({ error: mod.userMessage, code: 'MODERATION_BLOCKED' })
    }

    const at = Date.now()
    const doc = await db().collection('stories').add({
      authorUid: req.user.uid,
      campusId: req.profile?.campusId || null,
      ...d,
      viewers: [],
      at,
      expiresAt: at + ttlMs(),
      createdAt: FieldValue.serverTimestamp(),
    })

    await db().collection('users').doc(req.user.uid)
      .set({ hasActiveStory: true, lastStoryAt: at }, { merge: true })

    res.status(201).json({ success: true, storyId: doc.id, expiresAt: at + ttlMs() })
  } catch (err) { next(err) }
})

/* ------------------------ POST /api/stories/:id/view ----------------------- */
router.post('/:id/view', async (req, res, next) => {
  try {
    const ref = db().collection('stories').doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Story not found' })
    if (snap.data().authorUid === req.user.uid) return res.json({ success: true, own: true })

    await ref.set({ viewers: FieldValue.arrayUnion(req.user.uid) }, { merge: true })
    logEvent(req.user.uid, 'story_view', { storyId: req.params.id, authorUid: snap.data().authorUid })
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const ref = db().collection('stories').doc(req.params.id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Story not found' })
    if (snap.data().authorUid !== req.user.uid) return res.status(403).json({ error: 'Not your story' })
    await ref.delete()
    res.json({ success: true })
  } catch (err) { next(err) }
})

/* ================================ NOTES =================================== *
 * Short text status, visible for 24h, shown as a bubble above the avatar.
 * One active note per user — posting replaces the previous one.
 * ========================================================================== */

const noteSchema = z.object({
  text: z.string().min(1).max(60),
  music: z.object({ title: z.string(), artist: z.string().optional() }).optional(),
})

router.get('/notes', async (req, res, next) => {
  try {
    const me = req.user.uid
    const cutoff = Date.now() - ttlMs()
    const audience = await audienceFor(me)
    audience.add(me)

    const snap = await db().collection('notes').where('at', '>', cutoff).get()
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => audience.has(n.authorUid))

    const authors = await Promise.all(
      notes.map((n) => db().collection('users').doc(n.authorUid).get().then((d) => d.data()).catch(() => null)),
    )

    res.json({
      success: true,
      notes: notes.map((n, i) => ({
        id: n.id, text: n.text, music: n.music || null, at: n.at,
        authorUid: n.authorUid,
        name: authors[i]?.name || 'Student',
        avatar: authors[i]?.photos?.[0] || null,
        isMe: n.authorUid === me,
      })).sort((a, b) => (b.isMe - a.isMe) || (b.at - a.at)),
    })
  } catch (err) { next(err) }
})

router.post('/notes', async (req, res, next) => {
  try {
    if (!getConfig('features.notes')) return res.status(503).json({ error: 'Notes are unavailable', code: 'FEATURE_OFF' })

    const parsed = noteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid note', details: parsed.error.flatten() })

    const mod = await moderateText({ text: parsed.data.text, uid: req.user.uid, surface: 'note' })
    if (mod.action === 'block') return res.status(422).json({ error: mod.userMessage, code: 'MODERATION_BLOCKED' })

    // One note per user: overwrite by deterministic id.
    const at = Date.now()
    await db().collection('notes').doc(req.user.uid).set({
      authorUid: req.user.uid,
      text: parsed.data.text,
      music: parsed.data.music || null,
      at,
      expiresAt: at + ttlMs(),
    })

    res.status(201).json({ success: true, note: { text: parsed.data.text, at, expiresAt: at + ttlMs() } })
  } catch (err) { next(err) }
})

router.delete('/notes', async (req, res, next) => {
  try {
    await db().collection('notes').doc(req.user.uid).delete().catch(() => {})
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
