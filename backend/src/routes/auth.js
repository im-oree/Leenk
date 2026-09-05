import { Router } from 'express'
import { z } from 'zod'
import { db, FieldValue } from '../lib/firebase.js'
import { config } from '../lib/config.js'
import { signLeenkToken, requireAuth } from '../middleware/auth.js'
import {
  exchangeCode, fetchUserInfo, fetchLeenkProfileBundle, firebaseToJwt, studentHubEnabled,
} from '../services/studentHub.js'
import { fromStudentHub, mergeOnSignIn, hubTrustContribution, toStudentHub } from '../services/profileMapper.js'
import { addTrustSignal, recalcTrustScore } from '../services/trust.js'
import { enqueue } from '../services/outbox.js'

const router = Router()

const newUserDoc = (uid, extra = {}) => ({
  uid,
  createdAt: FieldValue.serverTimestamp(),
  createdAtMs: Date.now(),
  status: 'active',
  verificationStatus: 'pending',
  trustScore: 50,
  subscriptionTier: 'free',
  onboardingComplete: false,
  // Orientation fields. Deliberately null rather than defaulted: an absent
  // preference fails the orientation gate closed, so a half-onboarded account
  // (e.g. StudentHub sign-in before the dating questions) is never shown to
  // anyone and never sees anyone until it answers them.
  gender: null,
  interestedIn: null,
  photos: [],
  prompts: [],
  privacy: { discoverability: 'nearby', visible: true, readReceipts: true, showActive: true },
  filters: { ageRange: [18, 26], scope: 'nearby', intent: 'any', department: 'any' },
  stats: { matches: 0, followers: 0, following: 0, posts: 0 },
  ...extra,
})

/* -------------------------------------------------------------- *
 * A. SIGN IN WITH STUDENTHUB  (pull existing profile)
 * -------------------------------------------------------------- */

const signInSchema = z.object({
  code: z.string().min(4),
  codeVerifier: z.string().min(8),
  redirectUri: z.string().optional(),
  device: z.object({ fingerprint: z.string().optional(), platform: z.string().optional() }).optional(),
})

router.post('/studenthub/callback', async (req, res, next) => {
  try {
    const parsed = signInSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    if (!studentHubEnabled()) return res.status(503).json({ error: 'StudentHub sign-in is not enabled', code: 'SH_DISABLED' })

    const { code, codeVerifier, redirectUri, device } = parsed.data

    // 1. OIDC code -> tokens
    const tokens = await exchangeCode({ code, codeVerifier, redirectUri })

    // 2. Identity claims + the richer Leenk bundle
    const claims = await fetchUserInfo(tokens.access_token)
    let bundle = {}
    try {
      bundle = await fetchLeenkProfileBundle(tokens.appJwt || tokens.access_token)
    } catch { /* optional enrichment — never fatal */ }

    const incoming = fromStudentHub({ ...claims, ...(bundle.profile || {}) })
    if (!incoming.studentHubUid) return res.status(502).json({ error: 'StudentHub returned no subject id' })

    if (incoming.bannedUpstream) {
      return res.status(403).json({ error: 'This account is banned on StudentHub', code: 'UPSTREAM_BANNED' })
    }

    // 3. Find or create the Leenk account keyed by StudentHub uid
    const existing = await db().collection('users').where('studentHubUid', '==', incoming.studentHubUid).limit(1).get()

    let uid
    let isNew = false
    if (!existing.empty) {
      uid = existing.docs[0].id
      const merged = mergeOnSignIn(existing.docs[0].data(), incoming)
      await db().collection('users').doc(uid).set(merged, { merge: true })
    } else {
      isNew = true
      uid = `lk_${incoming.studentHubUid}`
      await db().collection('users').doc(uid).set(
        newUserDoc(uid, { ...incoming, linkedProvider: 'studenthub', linkedAt: Date.now() }),
        { merge: true },
      )
    }

    // 4. StudentHub-derived trust signals
    const contribution = hubTrustContribution({ ...claims, ...incoming })
    if (contribution.score > 0) {
      await addTrustSignal(uid, {
        type: 'studenthub_verified',
        weight: contribution.score,
        meta: { reasons: contribution.reasons },
        actor: 'studenthub',
      })
    }

    // 5. Record the link + refresh tokens for later syncs
    await db().collection('studentHubLinks').doc(uid).set({
      uid,
      studentHubUid: incoming.studentHubUid,
      refreshToken: tokens.refresh_token || null,
      scope: tokens.scope || null,
      linkedAt: Date.now(),
      lastSyncAt: Date.now(),
    }, { merge: true })

    if (device?.fingerprint) {
      await db().collection('deviceFingerprints').doc(device.fingerprint).set({
        fingerprint: device.fingerprint,
        platform: device.platform || null,
        linkedUids: FieldValue.arrayUnion(uid),
        lastSeenAt: Date.now(),
      }, { merge: true })
    }

    const profile = (await db().collection('users').doc(uid).get()).data()

    res.json({
      success: true,
      isNew,
      token: signLeenkToken({ uid, sh: incoming.studentHubUid }),
      expiresIn: config.jwt.ttlSeconds,
      needsOnboarding: !profile.onboardingComplete,
      verificationStatus: profile.verificationStatus,
      profile: publicSelf(profile),
      imported: {
        fields: Object.keys(incoming).filter((k) => incoming[k] != null),
        institutionalVerified: incoming.institutionalVerified,
      },
    })
  } catch (err) { next(err) }
})

/* -------------------------------------------------------------- *
 * B. SIGN UP ON LEENK  (push new profile INTO StudentHub)
 * -------------------------------------------------------------- */

const signUpSchema = z.object({
  phone: z.string().min(7),
  name: z.string().min(2).max(40),
  birthdate: z.string(),
  gender: z.enum(['man', 'woman', 'nonbinary']),
  // Who they want to see. Drives the orientation gate — required, no default,
  // because guessing it would be the single worst bug this app could ship.
  interestedIn: z.array(z.enum(['men', 'women', 'nonbinary'])).min(1),
  campusId: z.string().min(2),
  department: z.string().min(2),
  level: z.string().min(1).default('100'),
  intent: z.string().min(2),
  email: z.string().email().optional(),
  photos: z.array(z.string()).max(6).optional(),
  prompts: z.array(z.object({ q: z.string(), a: z.string() })).max(3).optional(),
  bio: z.string().max(300).optional(),
  device: z.object({ fingerprint: z.string().optional(), platform: z.string().optional() }).optional(),
})

function ageFrom(iso) {
  const b = new Date(iso)
  const n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  const m = n.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--
  return a
}

router.post('/signup', async (req, res, next) => {
  try {
    const parsed = signUpSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
    const d = parsed.data

    const age = ageFrom(d.birthdate)
    if (!Number.isFinite(age) || age < 18) {
      return res.status(403).json({ error: 'You must be 18 or older to use Leenk', code: 'UNDERAGE' })
    }

    const dupe = await db().collection('users').where('phone', '==', d.phone).limit(1).get()
    if (!dupe.empty) return res.status(409).json({ error: 'An account already exists for this number', code: 'PHONE_TAKEN' })

    const uid = `lk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const doc = newUserDoc(uid, {
      phone: d.phone,
      email: d.email || null,
      name: d.name,
      birthdate: d.birthdate,
      age,
      gender: d.gender,
      interestedIn: d.interestedIn,
      campusId: d.campusId,
      department: d.department,
      level: d.level,
      intent: d.intent,
      photos: d.photos || [],
      prompts: d.prompts || [],
      bio: d.bio || '',
      onboardingComplete: true,
      signupSource: 'leenk',
    })
    await db().collection('users').doc(uid).set(doc)

    if (d.device?.fingerprint) {
      await db().collection('deviceFingerprints').doc(d.device.fingerprint).set({
        fingerprint: d.device.fingerprint,
        platform: d.device.platform || null,
        linkedUids: FieldValue.arrayUnion(uid),
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      }, { merge: true })
    }

    if ((d.photos?.length || 0) >= 2 && (d.prompts?.length || 0) >= 1) {
      await addTrustSignal(uid, { type: 'profile_complete', actor: 'signup' })
    }
    await recalcTrustScore(uid)

    // PUSH the new student into StudentHub so the parent platform gains the user.
    await enqueue('user.provision', {
      leenkUid: uid,
      phone: d.phone,
      email: d.email || null,
      campusId: d.campusId,
      profile: toStudentHub(doc),
    }, { dedupeKey: `provision:${uid}` })

    const profile = (await db().collection('users').doc(uid).get()).data()

    res.status(201).json({
      success: true,
      token: signLeenkToken({ uid }),
      expiresIn: config.jwt.ttlSeconds,
      verificationStatus: profile.verificationStatus,
      nextStep: 'verification',
      profile: publicSelf(profile),
      studentHub: { queued: true, note: 'Profile is being provisioned on StudentHub in the background.' },
    })
  } catch (err) { next(err) }
})

/* -------------------------------------------------------------- *
 * C. Utility
 * -------------------------------------------------------------- */

router.post('/firebase-exchange', async (req, res, next) => {
  try {
    const { firebaseIdToken } = req.body || {}
    if (!firebaseIdToken) return res.status(400).json({ error: 'firebaseIdToken required' })
    const out = await firebaseToJwt(firebaseIdToken)
    res.json({ success: true, ...out })
  } catch (err) { next(err) }
})

router.get('/me', requireAuth, async (req, res) => {
  res.json({ success: true, profile: publicSelf(req.profile) })
})

router.post('/link-studenthub', requireAuth, async (req, res, next) => {
  try {
    const { code, codeVerifier } = req.body || {}
    if (!code) return res.status(400).json({ error: 'code required' })
    const tokens = await exchangeCode({ code, codeVerifier })
    const claims = await fetchUserInfo(tokens.access_token)
    const incoming = fromStudentHub(claims)

    await db().collection('users').doc(req.user.uid).set(
      mergeOnSignIn(req.profile, incoming), { merge: true },
    )
    await db().collection('studentHubLinks').doc(req.user.uid).set({
      uid: req.user.uid, studentHubUid: incoming.studentHubUid,
      refreshToken: tokens.refresh_token || null, linkedAt: Date.now(),
    }, { merge: true })

    await enqueue('profile.update', {
      studentHubUid: incoming.studentHubUid,
      patch: toStudentHub(req.profile),
    }, { dedupeKey: `link:${req.user.uid}` })

    res.json({ success: true, studentHubUid: incoming.studentHubUid })
  } catch (err) { next(err) }
})

export function publicSelf(p = {}) {
  const {
    walletPinHash, trustBreakdown, verificationRecords, deviceFingerprints, ...safe
  } = p
  return safe
}

export default router
