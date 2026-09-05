import jwt from 'jsonwebtoken'
import { config } from '../lib/config.js'
import { db, auth as fbAuth, usingMemory } from '../lib/firebase.js'

export function signLeenkToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.ttlSeconds })
}

export function verifyLeenkToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

/**
 * Accepts EITHER a Leenk JWT or a Firebase ID token from Leenk's own project.
 * Attaches req.user = { uid, ... } and req.profile (the Leenk user doc).
 */
export async function requireAuth(req, res, next) {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  let uid = null
  try {
    const decoded = verifyLeenkToken(token)
    uid = decoded.uid || decoded.sub
    req.tokenClaims = decoded
  } catch {
    // fall through to Firebase
  }

  if (!uid && !usingMemory()) {
    try {
      const decoded = await fbAuth().verifyIdToken(token)
      uid = decoded.uid
      req.tokenClaims = decoded
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
  }

  if (!uid) return res.status(401).json({ error: 'Invalid or expired token' })

  const snap = await db().collection('users').doc(uid).get()
  if (!snap.exists) return res.status(404).json({ error: 'Account not found', uid })

  const profile = snap.data()
  if (profile.status === 'banned') {
    return res.status(403).json({ error: 'Account banned', code: 'BANNED', reason: profile.banReason || null })
  }

  req.user = { uid }
  req.profile = profile
  next()
}

/**
 * Verification gate. PRD §1.4.2 — verification is checked server-side on
 * EVERY gated action, never just at signup.
 */
export function requireVerified(req, res, next) {
  const status = req.profile?.verificationStatus
  if (status !== 'verified') {
    return res.status(403).json({
      error: 'Verification required',
      code: 'NOT_VERIFIED',
      verificationStatus: status || 'pending',
      message: 'Swiping, messaging, posting and the feed unlock once your student status is confirmed.',
    })
  }
  if ((req.profile?.trustScore ?? 0) < config.trust.minScoreToSwipe) {
    return res.status(403).json({
      error: 'Account under review',
      code: 'LOW_TRUST',
      message: 'Your account is temporarily limited while we review it.',
    })
  }
  next()
}

export async function requireAdmin(req, res, next) {
  if (!req.profile?.isAdmin && req.profile?.role !== 'admin' && req.profile?.role !== 'moderator') {
    return res.status(403).json({ error: 'Forbidden: staff only' })
  }
  next()
}

/** Optional auth — populates req.user when a token is present, never fails. */
export async function optionalAuth(req, _res, next) {
  const token = bearer(req)
  if (!token) return next()
  try {
    const decoded = verifyLeenkToken(token)
    const uid = decoded.uid || decoded.sub
    const snap = await db().collection('users').doc(uid).get()
    if (snap.exists) { req.user = { uid }; req.profile = snap.data() }
  } catch { /* ignore */ }
  next()
}
