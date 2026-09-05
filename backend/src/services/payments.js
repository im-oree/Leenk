import crypto from 'node:crypto'
import { db, FieldValue } from '../lib/firebase.js'
import { getConfig } from './appConfig.js'

/**
 * Payments — Paystack + Flutterwave, provider-abstracted.
 *
 * HARD RULES
 * ----------
 * 1. Checkout is ALWAYS an in-app popup/modal (Paystack InlineJS v2,
 *    Flutterwave `FlutterwaveCheckout`). We never open a new tab and never
 *    set `redirect_url` — inside a Capacitor webview a redirect can strand
 *    the user in a system browser with no way back into the app.
 *
 * 2. The CLIENT NEVER DECIDES WHAT WAS PAID. The popup's success callback is
 *    a UX hint only — it is trivially forgeable from a console. Entitlement
 *    is granted only after this service re-fetches the transaction from the
 *    provider's API with a secret key and checks status AND amount AND
 *    currency against the plan we expect.
 *
 * 3. Amount is resolved SERVER-SIDE from the plan id. The client sends a plan
 *    id, never a price, so a tampered client cannot buy 12 months for ₦1.
 *
 * Secret keys live in appConfig (hot-editable, per the config-as-data rule);
 * only public keys are ever sent to the client.
 */

/* ------------------------------- plans ---------------------------------- */

/** Prices in KOBO (Paystack's smallest unit). Naira = kobo / 100. */
export const PLANS = {
  month: { id: 'month', label: '1 month', months: 1, kobo: 168000 },
  term: { id: 'term', label: '4 months', months: 4, kobo: 490000 },
  year: { id: 'year', label: '12 months', months: 12, kobo: 1260000 },
}

export const getPlan = (id) => PLANS[id] || null

/* ------------------------------ helpers --------------------------------- */

const TIMEOUT_MS = 12_000

async function providerFetch(url, { method = 'GET', headers = {}, body } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
  } catch (err) {
    // Provider unreachable / timed out. Return a soft failure so verification
    // reports "we couldn't confirm yet" instead of throwing a 500 with a
    // stack trace. Crucially this NEVER grants entitlement — an outage must
    // fail closed.
    return { ok: false, status: 0, json: {}, networkError: true, message: err?.message }
  } finally {
    clearTimeout(t)
  }
}

const cfg = () => getConfig('payments') || {}

export function paymentsStatus() {
  const c = cfg()
  const provider = c.provider || 'paystack'
  const keys = c.keys || {}
  return {
    provider,
    enabled: Boolean(c.enabled) && Boolean(keys[provider]?.publicKey),
    // Only the PUBLIC key crosses the wire.
    publicKey: keys[provider]?.publicKey || null,
    currency: c.currency || 'NGN',
    plans: Object.values(PLANS).map((p) => ({
      id: p.id, label: p.label, months: p.months,
      amount: p.kobo, display: `₦${(p.kobo / 100).toLocaleString()}`,
    })),
  }
}

/** Server-generated reference. Never trust a client-supplied one. */
export const newReference = (uid, planId) =>
  `lk_${planId}_${uid.slice(-6)}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`

/* ---------------------------- verification ------------------------------ */

async function verifyPaystack(reference, secretKey) {
  const { ok, json, networkError } = await providerFetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { authorization: `Bearer ${secretKey}` } },
  )
  if (networkError) return { paid: false, unreachable: true, reason: 'PROVIDER_UNREACHABLE' }
  if (!ok || !json?.status) return { paid: false, reason: 'VERIFY_FAILED', raw: json }
  const d = json.data || {}
  return {
    paid: d.status === 'success',
    amount: d.amount,             // kobo
    currency: d.currency,
    reference: d.reference,
    paidAt: d.paid_at || d.paidAt || null,
    channel: d.channel,
    raw: d,
  }
}

async function verifyFlutterwave(reference, secretKey) {
  // Flutterwave verifies by its own tx id OR by our tx_ref.
  const { ok, json, networkError } = await providerFetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    { headers: { authorization: `Bearer ${secretKey}` } },
  )
  if (networkError) return { paid: false, unreachable: true, reason: 'PROVIDER_UNREACHABLE' }
  if (!ok || json?.status !== 'success') return { paid: false, reason: 'VERIFY_FAILED', raw: json }
  const d = json.data || {}
  return {
    paid: d.status === 'successful',
    // Flutterwave reports major units (naira) — normalise to kobo so the
    // amount comparison below is provider-independent.
    amount: Math.round((d.amount || 0) * 100),
    currency: d.currency,
    reference: d.tx_ref,
    paidAt: d.created_at || null,
    channel: d.payment_type,
    raw: d,
  }
}

/**
 * Verify a transaction with the provider and, if genuine, grant entitlement.
 * Idempotent: replaying the same reference never extends a subscription twice.
 */
export async function verifyAndGrant({ uid, reference }) {
  const c = cfg()
  const provider = c.provider || 'paystack'
  const secretKey = c.keys?.[provider]?.secretKey
  if (!secretKey) return { ok: false, code: 'PAYMENTS_NOT_CONFIGURED' }

  const ref = await db().collection('payments').doc(reference).get()
  if (!ref.exists) return { ok: false, code: 'UNKNOWN_REFERENCE' }
  const intent = ref.data()

  if (intent.uid !== uid) return { ok: false, code: 'REFERENCE_MISMATCH' }
  // Idempotency: already granted, just report success again.
  if (intent.status === 'granted') {
    return { ok: true, alreadyGranted: true, plan: intent.planId, expiresAt: intent.expiresAt }
  }

  const plan = getPlan(intent.planId)
  if (!plan) return { ok: false, code: 'UNKNOWN_PLAN' }

  const verify = provider === 'flutterwave' ? verifyFlutterwave : verifyPaystack
  const result = await verify(reference, secretKey)

  if (!result.paid) {
    // Leave the intent PENDING when the provider was unreachable — the money
    // may well have moved, and the webhook will settle it. Marking it failed
    // would strand a real payment.
    if (result.unreachable) {
      await ref.ref.set({ lastCheckedAt: Date.now(), lastError: 'PROVIDER_UNREACHABLE' }, { merge: true })
      return { ok: false, code: 'PROVIDER_UNREACHABLE' }
    }
    await ref.ref.set({ status: 'failed', lastCheckedAt: Date.now(), providerRaw: result.raw || null }, { merge: true })
    return { ok: false, code: 'NOT_PAID' }
  }

  // The checks that actually matter: right amount, right currency.
  const expectedCurrency = c.currency || 'NGN'
  if (result.currency !== expectedCurrency) {
    await ref.ref.set({ status: 'mismatch', reason: 'CURRENCY', lastCheckedAt: Date.now() }, { merge: true })
    return { ok: false, code: 'CURRENCY_MISMATCH' }
  }
  if (Number(result.amount) < plan.kobo) {
    await ref.ref.set({ status: 'mismatch', reason: 'AMOUNT', paidAmount: result.amount, lastCheckedAt: Date.now() }, { merge: true })
    return { ok: false, code: 'AMOUNT_MISMATCH' }
  }

  // Extend from the CURRENT expiry when still active, so paying early never
  // burns remaining days.
  const now = Date.now()
  const user = await db().collection('users').doc(uid).get()
  const current = user.exists ? user.data()?.premium?.expiresAt || 0 : 0
  const base = current > now ? current : now
  const expiresAt = base + plan.months * 30 * 24 * 60 * 60 * 1000

  await db().collection('users').doc(uid).set({
    premium: { active: true, plan: plan.id, since: now, expiresAt, provider },
  }, { merge: true })

  await ref.ref.set({
    status: 'granted',
    grantedAt: now,
    expiresAt,
    provider,
    paidAmount: result.amount,
    channel: result.channel || null,
  }, { merge: true })

  return { ok: true, plan: plan.id, expiresAt }
}

/* ------------------------------ webhooks -------------------------------- */

/** Paystack signs with HMAC-SHA512 of the raw body using the secret key. */
export function verifyPaystackSignature(rawBody, signature, secretKey) {
  if (!signature || !secretKey) return false
  const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

/** Flutterwave sends a shared secret verbatim in `verif-hash`. */
export function verifyFlutterwaveSignature(signature, secretHash) {
  if (!signature || !secretHash) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(secretHash))
  } catch {
    return false
  }
}

/**
 * Create a payment intent. Returns everything the popup needs — but crucially
 * the amount comes from OUR plan table, never from the client.
 */
export async function createIntent({ uid, planId, email }) {
  const c = cfg()
  const provider = c.provider || 'paystack'
  const publicKey = c.keys?.[provider]?.publicKey
  if (!c.enabled || !publicKey) return { ok: false, code: 'PAYMENTS_NOT_CONFIGURED' }

  const plan = getPlan(planId)
  if (!plan) return { ok: false, code: 'UNKNOWN_PLAN' }

  const reference = newReference(uid, plan.id)
  await db().collection('payments').doc(reference).set({
    reference, uid, planId: plan.id, amount: plan.kobo,
    currency: c.currency || 'NGN', provider,
    status: 'pending', createdAt: Date.now(),
  })

  return {
    ok: true,
    provider,
    publicKey,
    reference,
    email,
    amount: plan.kobo,                    // kobo — Paystack wants this directly
    amountMajor: plan.kobo / 100,         // naira — Flutterwave wants this
    currency: c.currency || 'NGN',
    plan: { id: plan.id, label: plan.label, months: plan.months },
  }
}

/**
 * Grace-period aware entitlement check (Phase 2 §2.6: never strip access
 * abruptly/punitively mid-cycle on a failed payment).
 */
export function entitlement(user) {
  const p = user?.premium
  if (!p?.expiresAt) return { active: false, grace: false }
  const now = Date.now()
  if (now <= p.expiresAt) return { active: true, grace: false, expiresAt: p.expiresAt }
  const graceDays = cfg().graceDays ?? 7
  const graceEnd = p.expiresAt + graceDays * 24 * 60 * 60 * 1000
  if (now <= graceEnd) return { active: true, grace: true, expiresAt: p.expiresAt, graceEnd }
  return { active: false, grace: false, expiresAt: p.expiresAt }
}
