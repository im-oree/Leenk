import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { config } from '../lib/config.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { distanceBetween } from '../services/location.js'
import { visibilityMultiplier } from '../services/trust.js'
import { gateReason, buildStack, assertOrientation, orientationCompatible } from '../services/matching.js'
import { getConfig } from '../services/appConfig.js'
import { logEvent, logSwipe } from '../services/events.js'

const router = Router()
router.use(requireAuth, requireVerified)

const todayKey = () => new Date().toISOString().slice(0, 10)

async function quota(uid) {
  const ref = db().collection('users').doc(uid).collection('dailyQuota').doc(todayKey())
  const snap = await ref.get()
  const d = snap.exists ? snap.data() : { swipes: 0, superLikes: 0, undos: 0 }
  return {
    ref,
    used: d,
    remaining: {
      swipes: Math.max(0, config.discovery.dailySwipeCapFree - (d.swipes || 0)),
      superLikes: Math.max(0, config.discovery.dailySuperLikeFree - (d.superLikes || 0)),
      undos: Math.max(0, config.discovery.dailyUndoFree - (d.undos || 0)),
    },
  }
}

/** Card shape sent to the client — never leaks precise location or trust. */
async function toCard(me, other) {
  const dist = await distanceBetween(me.uid, other.uid)
  return {
    uid: other.uid,
    name: other.name,
    age: other.age,
    campusId: other.campusId,
    department: other.department,
    level: other.level,
    intent: other.intent,
    photos: other.photos || [],
    prompts: other.prompts || [],
    bio: other.bio || '',
    verified: other.verificationStatus === 'verified',
    distance: { label: dist.label, bucket: dist.bucket },
  }
}

/* -------------------------- GET /api/discovery/stack -------------------------- */
router.get('/stack', async (req, res, next) => {
  try {
    const me = req.profile
    const limit = Math.min(Number(req.query.limit) || 15, 30)
    const q = await quota(me.uid)
    if (q.remaining.swipes <= 0 && me.subscriptionTier === 'free') {
      return res.json({ success: true, cards: [], quota: q.remaining, capped: true, resetsAt: `${todayKey()}T23:59:59Z` })
    }

    const seenSnap = await db().collection('swipes').where('actorUid', '==', me.uid).get()
    const seen = new Set(seenSnap.docs.map((d) => d.data().targetUid))
    seen.add(me.uid)

    const all = await db().collection('users').where('verificationStatus', '==', 'verified').limit(500).get()
    const filters = me.filters || {}

    // Blocks in both directions.
    const blkSnap = await db().collection('blocks').where('blockerUid', '==', me.uid).get()
    const blkBySnap = await db().collection('blocks').where('blockedUid', '==', me.uid).get()
    const blocked = new Set(blkSnap.docs.map((d) => d.data().blockedUid))
    const blockedBy = new Set(blkBySnap.docs.map((d) => d.data().blockerUid))

    // Who already liked me — biggest single ranking signal.
    const likedMeSnap = await db().collection('swipes')
      .where('targetUid', '==', me.uid).where('direction', 'in', ['right', 'super']).get()
    const likedMe = new Set(likedMeSnap.docs.map((d) => d.data().actorUid))

    // --- Stage 1: hard gates (orientation, age, trust, blocks, scope) ---
    const gateCtx = { seen, blocked, blockedBy, filters }
    const eligible = []
    const rejected = {}
    for (const doc of all.docs) {
      const u = doc.data()
      const reason = gateReason(me, u, gateCtx)
      if (reason === null) eligible.push(u)
      else rejected[reason] = (rejected[reason] || 0) + 1
    }

    // --- Stage 2: scoring ---
    const distances = new Map()
    await Promise.all(eligible.map(async (u) => {
      const d = await distanceBetween(me.uid, u.uid)
      distances.set(u.uid, d)
    }))

    const impressionsSnap = await db().collection('users').doc(me.uid)
      .collection('impressions').get().catch(() => ({ docs: [] }))
    const timesShownMap = new Map(impressionsSnap.docs.map((d) => [d.id, d.data().count || 0]))

    const ranked = buildStack(
      me,
      eligible,
      (u) => ({
        distanceKm: distances.get(u.uid)?.km,
        likedMe: likedMe.has(u.uid),
        timesShown: timesShownMap.get(u.uid) || 0,
        mutuals: 0, // social graph wired in phase 5
        poolStats: {},
      }),
      { limit },
    )

    // --- Final safety net: orientation can never leak, even via a scoring bug ---
    const safe = assertOrientation(me, ranked)
    const pool = safe.map((x) => x.u)

    // Record impressions so the fatigue penalty works next time.
    Promise.all(pool.map((u) =>
      db().collection('users').doc(me.uid).collection('impressions').doc(u.uid)
        .set({ count: FieldValue.increment(1), lastAt: Date.now() }, { merge: true })
        .catch(() => {}),
    )).catch(() => {})

    logEvent(me.uid, 'stack_served', { count: pool.length, rejected })

    const cards = await Promise.all(pool.map((u) => toCard(me, u)))
    res.json({ success: true, cards, quota: q.remaining, capped: false })
  } catch (err) { next(err) }
})

/* --------------------------- POST /api/discovery/swipe --------------------------- */
const swipeSchema = z.object({
  targetUid: z.string().min(2),
  direction: z.enum(['left', 'right', 'super']),
  context: z.object({ source: z.string().optional(), dwellMs: z.number().optional() }).optional(),
})

router.post('/swipe', async (req, res, next) => {
  try {
    const parsed = swipeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    const { targetUid, direction, context } = parsed.data
    const me = req.profile

    if (targetUid === me.uid) return res.status(400).json({ error: 'You cannot swipe yourself' })

    const targetSnap = await db().collection('users').doc(targetUid).get()
    if (!targetSnap.exists) return res.status(404).json({ error: 'Profile not found' })
    const target = targetSnap.data()

    // Orientation is enforced on the ACTION too, not just the stack. A crafted
    // request must not be able to create an incompatible match.
    if (!orientationCompatible(me, target)) {
      return res.status(403).json({ error: 'Not available', code: 'NOT_ELIGIBLE' })
    }

    logSwipe(me.uid, targetUid, direction, { dwellMs: context?.dwellMs, position: context?.position })

    const q = await quota(me.uid)
    if (me.subscriptionTier === 'free') {
      if (q.remaining.swipes <= 0) return res.status(429).json({ error: 'Daily swipe limit reached', code: 'SWIPE_CAP', resetsAt: `${todayKey()}T23:59:59Z` })
      if (direction === 'super' && q.remaining.superLikes <= 0) {
        return res.status(429).json({ error: 'No super likes left today', code: 'SUPERLIKE_CAP' })
      }
    }


    const swipeId = `${me.uid}__${targetUid}`
    await db().collection('swipes').doc(swipeId).set({
      id: swipeId,
      actorUid: me.uid,
      targetUid,
      direction,
      context: context || {},
      at: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    })

    await q.ref.set({
      swipes: FieldValue.increment(1),
      superLikes: FieldValue.increment(direction === 'super' ? 1 : 0),
      day: todayKey(),
    }, { merge: true })

    // Mutual-like check
    let match = null
    if (direction === 'right' || direction === 'super') {
      const reciprocal = await db().collection('swipes').doc(`${targetUid}__${me.uid}`).get()
      const rd = reciprocal.exists ? reciprocal.data() : null
      if (rd && (rd.direction === 'right' || rd.direction === 'super')) {
        const pair = [me.uid, targetUid].sort()
        const matchId = `${pair[0]}__${pair[1]}`
        await db().collection('matches').doc(matchId).set({
          id: matchId,
          users: pair,
          createdAt: FieldValue.serverTimestamp(),
          createdAtMs: Date.now(),
          lastMessageAt: null,
          status: 'active',
          superLike: direction === 'super' || rd.direction === 'super',
        }, { merge: true })

        match = { id: matchId, user: await toCard(me, target) }
        for (const u of pair) {
          await db().collection('users').doc(u).set({ stats: { matches: FieldValue.increment(1) } }, { merge: true })
        }
      }
    }

    const after = await quota(me.uid)
    res.json({ success: true, matched: !!match, match, quota: after.remaining })
  } catch (err) { next(err) }
})

/* --------------------------- POST /api/discovery/undo --------------------------- */
router.post('/undo', async (req, res, next) => {
  try {
    const me = req.profile
    const q = await quota(me.uid)
    if (q.remaining.undos <= 0) return res.status(429).json({ error: 'No undos left today', code: 'UNDO_CAP' })

    const last = await db().collection('swipes').where('actorUid', '==', me.uid).orderBy('at', 'desc').limit(1).get()
    if (last.empty) return res.status(404).json({ error: 'Nothing to undo' })

    const doc = last.docs[0]
    await db().collection('swipes').doc(doc.id).delete()
    await q.ref.set({ undos: FieldValue.increment(1), swipes: FieldValue.increment(-1), day: todayKey() }, { merge: true })

    const after = await quota(me.uid)
    res.json({ success: true, restoredUid: doc.data().targetUid, quota: after.remaining })
  } catch (err) { next(err) }
})

/* --------------------------- GET /api/discovery/likes --------------------------- */
router.get('/likes', async (req, res, next) => {
  try {
    const me = req.profile
    const snap = await db().collection('swipes').where('targetUid', '==', me.uid).get()
    const likedMe = snap.docs.map((d) => d.data()).filter((s) => s.direction === 'right' || s.direction === 'super')

    const isPro = me.subscriptionTier !== 'free'
    const out = []
    for (const s of likedMe.slice(0, 40)) {
      const u = await db().collection('users').doc(s.actorUid).get()
      if (!u.exists) continue
      const d = u.data()
      out.push(isPro
        ? { ...(await toCard(me, d)), superLike: s.direction === 'super', at: s.at }
        : { uid: null, blurred: true, photo: d.photos?.[0] || null, campusId: d.campusId, at: s.at })
    }
    res.json({ success: true, count: likedMe.length, revealed: isPro, likes: out })
  } catch (err) { next(err) }
})

/* ---------------------------- Filters ---------------------------- */
router.put('/filters', async (req, res, next) => {
  try {
    const schema = z.object({
      ageRange: z.tuple([z.number().min(18), z.number().max(99)]).optional(),
      scope: z.enum(['home', 'nearby', 'anywhere']).optional(),
      intent: z.string().optional(),
      department: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid filters', details: parsed.error.flatten() })

    const filters = { ...(req.profile.filters || {}), ...parsed.data }
    await db().collection('users').doc(req.user.uid).set({ filters }, { merge: true })
    res.json({ success: true, filters })
  } catch (err) { next(err) }
})

export default router
