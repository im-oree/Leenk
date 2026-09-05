import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth, requireVerified)

/**
 * Feed ranking (PRD §1.5.D / §1.7).
 * Deliberately NOT engagement-bait: recency dominates, affinity nudges,
 * and we cap how much any single author can occupy the feed.
 */
function rankScore(post, { followingSet, myCampus }) {
  const ageHours = (Date.now() - (post.createdAtMs || 0)) / 3_600_000
  const recency = Math.exp(-ageHours / 20)              // half-life ~14h
  const affinity = followingSet.has(post.authorUid) ? 1.4 : 0
  const campus = post.campusId === myCampus ? 0.6 : 0
  const quality = Math.log10(1 + (post.likeCount || 0)) * 0.25
  return recency * 2 + affinity + campus + quality
}

/* -------------------------------- GET /api/feed ------------------------------- */
router.get('/', async (req, res, next) => {
  try {
    const mode = req.query.mode === 'following' ? 'following' : 'foryou'
    const limit = Math.min(Number(req.query.limit) || 20, 50)

    const followSnap = await db().collection('follows').where('followerUid', '==', req.user.uid).get()
    const followingSet = new Set(followSnap.docs.map((d) => d.data().followingUid))

    const blockSnap = await db().collection('blocks').where('blockerUid', '==', req.user.uid).get()
    const blocked = new Set(blockSnap.docs.map((d) => d.data().blockedUid))

    const snap = await db().collection('posts').where('status', '==', 'active').limit(250).get()
    let posts = snap.docs.map((d) => d.data()).filter((p) => {
      if (blocked.has(p.authorUid)) return false
      if (mode === 'following' && !followingSet.has(p.authorUid) && p.authorUid !== req.user.uid) return false
      if (p.visibility === 'followers' && !followingSet.has(p.authorUid) && p.authorUid !== req.user.uid) return false
      if (p.visibility === 'campus' && p.campusId !== req.profile.campusId) return false
      return true
    })

    posts = posts
      .map((p) => ({ p, s: rankScore(p, { followingSet, myCampus: req.profile.campusId }) }))
      .sort((a, b) => b.s - a.s)

    // author diversity: max 2 consecutive posts from one person
    const out = []
    const perAuthor = {}
    for (const { p } of posts) {
      perAuthor[p.authorUid] = (perAuthor[p.authorUid] || 0) + 1
      if (perAuthor[p.authorUid] > 3) continue
      out.push(p)
      if (out.length >= limit) break
    }

    const hydrated = await Promise.all(out.map(async (p) => {
      const a = await db().collection('users').doc(p.authorUid).get()
      const ad = a.exists ? a.data() : {}
      const liked = await db().collection('postLikes').doc(`${p.id}__${req.user.uid}`).get()
      return {
        id: p.id, mediaUrl: p.mediaUrl, caption: p.caption,
        likeCount: p.likeCount || 0, commentCount: p.commentCount || 0,
        liked: liked.exists, visibility: p.visibility, createdAtMs: p.createdAtMs,
        author: { uid: ad.uid, name: ad.name, photo: ad.photos?.[0] || null, campusId: ad.campusId, verified: ad.verificationStatus === 'verified' },
      }
    }))

    res.json({ success: true, mode, posts: hydrated })
  } catch (err) { next(err) }
})

/* ------------------------------- POST /api/feed ------------------------------- */
const postSchema = z.object({
  mediaUrl: z.string().min(4),
  mediaType: z.enum(['image', 'video']).optional(),
  caption: z.string().max(500).optional(),
  visibility: z.enum(['followers', 'campus', 'nearby']).optional(),
})

router.post('/', async (req, res, next) => {
  try {
    const parsed = postSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid post', details: parsed.error.flatten() })

    const id = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const post = {
      id,
      authorUid: req.user.uid,
      campusId: req.profile.campusId,
      mediaUrl: parsed.data.mediaUrl,
      mediaType: parsed.data.mediaType || 'image',
      caption: parsed.data.caption || '',
      visibility: parsed.data.visibility || 'followers',
      likeCount: 0, commentCount: 0,
      status: 'active',
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    }
    await db().collection('posts').doc(id).set(post)
    await db().collection('users').doc(req.user.uid).set({ stats: { posts: FieldValue.increment(1) } }, { merge: true })
    res.status(201).json({ success: true, post })
  } catch (err) { next(err) }
})

/* ----------------------------- Likes / comments ------------------------------- */
router.post('/:postId/like', async (req, res, next) => {
  try {
    const likeId = `${req.params.postId}__${req.user.uid}`
    const ref = db().collection('postLikes').doc(likeId)
    const existing = await ref.get()

    if (existing.exists) {
      await ref.delete()
      await db().collection('posts').doc(req.params.postId).set({ likeCount: FieldValue.increment(-1) }, { merge: true })
      return res.json({ success: true, liked: false })
    }
    await ref.set({ postId: req.params.postId, uid: req.user.uid, at: Date.now() })
    await db().collection('posts').doc(req.params.postId).set({ likeCount: FieldValue.increment(1) }, { merge: true })
    res.json({ success: true, liked: true })
  } catch (err) { next(err) }
})

router.get('/:postId/comments', async (req, res, next) => {
  try {
    const snap = await db().collection('posts').doc(req.params.postId).collection('comments').orderBy('at', 'asc').limit(200).get()
    const rows = await Promise.all(snap.docs.map(async (d) => {
      const c = d.data()
      const a = await db().collection('users').doc(c.authorUid).get()
      return { id: d.id, text: c.text, at: c.at, author: { uid: c.authorUid, name: a.data()?.name, photo: a.data()?.photos?.[0] || null } }
    }))
    res.json({ success: true, comments: rows })
  } catch (err) { next(err) }
})

router.post('/:postId/comments', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim()
    if (!text) return res.status(400).json({ error: 'Comment text required' })
    if (text.length > 500) return res.status(400).json({ error: 'Comment too long' })

    const ref = db().collection('posts').doc(req.params.postId)
    const doc = await ref.collection('comments').add({ authorUid: req.user.uid, text, at: Date.now() })
    await ref.set({ commentCount: FieldValue.increment(1) }, { merge: true })
    res.status(201).json({ success: true, commentId: doc.id })
  } catch (err) { next(err) }
})

router.delete('/:postId', async (req, res, next) => {
  try {
    const ref = db().collection('posts').doc(req.params.postId)
    const p = await ref.get()
    if (!p.exists) return res.status(404).json({ error: 'Post not found' })
    if (p.data().authorUid !== req.user.uid) return res.status(403).json({ error: 'Not your post' })
    await ref.set({ status: 'deleted', deletedAt: Date.now() }, { merge: true })
    res.json({ success: true })
  } catch (err) { next(err) }
})

/* --------------------------------- Follows ------------------------------------ */
router.post('/follow/:uid', async (req, res, next) => {
  try {
    if (req.params.uid === req.user.uid) return res.status(400).json({ error: 'You cannot follow yourself' })
    const id = `${req.user.uid}__${req.params.uid}`
    const ref = db().collection('follows').doc(id)
    if ((await ref.get()).exists) {
      await ref.delete()
      await db().collection('users').doc(req.params.uid).set({ stats: { followers: FieldValue.increment(-1) } }, { merge: true })
      await db().collection('users').doc(req.user.uid).set({ stats: { following: FieldValue.increment(-1) } }, { merge: true })
      return res.json({ success: true, following: false })
    }
    await ref.set({ id, followerUid: req.user.uid, followingUid: req.params.uid, at: Date.now() })
    await db().collection('users').doc(req.params.uid).set({ stats: { followers: FieldValue.increment(1) } }, { merge: true })
    await db().collection('users').doc(req.user.uid).set({ stats: { following: FieldValue.increment(1) } }, { merge: true })
    res.json({ success: true, following: true })
  } catch (err) { next(err) }
})

export default router
