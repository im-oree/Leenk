import { Router } from 'express'
import { z } from 'zod'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth.js'
import { db } from '../lib/firebase.js'
import { getConfig } from '../services/appConfig.js'
import {
  paymentsStatus, createIntent, verifyAndGrant, entitlement,
  verifyPaystackSignature, verifyFlutterwaveSignature, getPlan,
} from '../services/payments.js'

const router = Router()

/* ------------------------------- webhooks -------------------------------- */
/**
 * Mounted BEFORE requireAuth — providers are not logged-in users.
 * These need the RAW body for signature verification, so server.js must mount
 * express.raw() for this path (see the comment there).
 *
 * The webhook is a safety net, not the primary path: a user who closes the app
 * mid-payment still gets their entitlement. The popup callback is the fast
 * path; both funnel into the same idempotent verifyAndGrant().
 */
router.post('/webhook/:provider', async (req, res) => {
  const provider = req.params.provider
  const c = getConfig('payments') || {}
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}))

  let valid = false
  if (provider === 'paystack') {
    valid = verifyPaystackSignature(raw, req.get('x-paystack-signature'), c.keys?.paystack?.secretKey)
  } else if (provider === 'flutterwave') {
    valid = verifyFlutterwaveSignature(req.get('verif-hash'), c.keys?.flutterwave?.webhookHash)
  }
  // Always 200 an invalid signature: replying 4xx tells an attacker probing
  // for a valid hash when they've found one.
  if (!valid) return res.status(200).json({ received: true })

  let payload = {}
  try { payload = JSON.parse(raw.toString('utf8')) } catch { /* ignore */ }

  const reference =
    payload?.data?.reference || payload?.data?.tx_ref || payload?.data?.txRef || null

  if (reference) {
    try {
      const doc = await db().collection('payments').doc(reference).get()
      if (doc.exists) await verifyAndGrant({ uid: doc.data().uid, reference })
    } catch {
      // Swallow: providers retry, and a 500 here just triggers noisy retries.
    }
  }
  res.status(200).json({ received: true })
})

router.use(requireAuth)

const payLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many payment attempts. Wait a moment.', code: 'PAYMENT_RATE_LIMIT' },
})

/* ---------------------------- GET /api/payments/config ------------------- */
/** Public key + plan prices. Lets the client render prices from ONE source. */
router.get('/config', (req, res) => {
  res.json({ success: true, ...paymentsStatus() })
})

/* ---------------------------- POST /api/payments/intent ------------------ */
const intentSchema = z.object({ planId: z.enum(['month', 'term', 'year']) })

router.post('/intent', payLimiter, async (req, res, next) => {
  try {
    const parsed = intentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid plan', code: 'BAD_PLAN' })
    }
    // Note: no `amount` accepted from the client — it comes from the plan table.
    const out = await createIntent({
      uid: req.user.uid,
      planId: parsed.data.planId,
      email: req.user.email || `${req.user.uid}@leenk.app`,
    })
    if (!out.ok) return res.status(503).json({ error: 'Payments unavailable', code: out.code })
    res.status(201).json({ success: true, ...out })
  } catch (err) { next(err) }
})

/* ---------------------------- POST /api/payments/verify ------------------ */
/**
 * Called by the client right after the popup reports success. This is what
 * actually grants entitlement — the popup's own callback grants nothing.
 */
router.post('/verify', payLimiter, async (req, res, next) => {
  try {
    const reference = String(req.body?.reference || '')
    if (!reference) return res.status(400).json({ error: 'Missing reference', code: 'NO_REFERENCE' })

    const out = await verifyAndGrant({ uid: req.user.uid, reference })
    if (!out.ok) {
      // 503 => "try again", 402 => "genuinely not paid", 400 => bad request.
      const status =
        out.code === 'PROVIDER_UNREACHABLE' || out.code === 'PAYMENTS_NOT_CONFIGURED' ? 503
        : out.code === 'NOT_PAID' ? 402
        : 400
      return res.status(status).json({ error: 'Payment not verified', code: out.code })
    }
    res.json({ success: true, ...out })
  } catch (err) { next(err) }
})

/* ---------------------------- GET /api/payments/status ------------------- */
router.get('/status', async (req, res, next) => {
  try {
    const doc = await db().collection('users').doc(req.user.uid).get()
    res.json({ success: true, ...entitlement(doc.exists ? doc.data() : null) })
  } catch (err) { next(err) }
})

export default router
