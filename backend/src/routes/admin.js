/**
 * Admin surface — everything the future admin panel needs.
 *
 * Config is data, not deployment: every weight, threshold, key pool and
 * template is editable here and takes effect within one cache TTL (60s),
 * with no redeploy. That's the whole point of appConfig.
 */

import { Router } from 'express'
import { z } from 'zod'
import { db } from '../lib/firebase.js'
import { getConfig, setConfig, loadConfig, DEFAULTS } from '../services/appConfig.js'
import { mediaStatus } from '../services/media.js'
import { moderationStatus } from '../services/moderation.js'
import { outboxStats } from '../services/outbox.js'

const router = Router()

/** Shared-secret guard. Replace with role-based auth when the panel ships. */
function requireAdminKey(req, res, next) {
  const key = req.get('x-admin-key')
  const expected = process.env.ADMIN_KEY
  if (!expected) return res.status(503).json({ error: 'Admin API disabled', code: 'NO_ADMIN_KEY' })
  if (key !== expected) return res.status(403).json({ error: 'Forbidden', code: 'BAD_ADMIN_KEY' })
  next()
}
router.use(requireAdminKey)

/* ------------------------------ CONFIG ------------------------------ */

/**
 * Redact secret-ish values before they leave the server or land in an audit
 * log. Admin endpoints are key-gated, but provider secret keys should never
 * be echoed back or persisted in plaintext audit records — a leaked admin
 * response or audit dump would otherwise hand over live payment credentials.
 */
const SECRET_KEY_RE = /(secret|privateKey|apiKey|webhookHash|encryptionKey|password|token)/i
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SECRET_KEY_RE.test(k) && typeof v === 'string' && v
          ? `${v.slice(0, 4)}••••${v.slice(-2)}`
          : redact(v),
      ]),
    )
  }
  return value
}

router.get('/config', async (req, res, next) => {
  try {
    await loadConfig(true)
    res.json({ success: true, config: redact(getConfig()), sections: Object.keys(DEFAULTS) })
  } catch (err) { next(err) }
})

router.get('/config/:section', async (req, res, next) => {
  try {
    await loadConfig(true)
    const section = getConfig(req.params.section)
    if (!section) return res.status(404).json({ error: 'Unknown section' })
    res.json({ success: true, section: req.params.section, values: redact(section) })
  } catch (err) { next(err) }
})

/**
 * PATCH a config section. Deep-merged, so you can send just the key you're
 * changing: { "weights": { "sameCampus": 0.25 } }
 */
router.patch('/config/:section', async (req, res, next) => {
  try {
    if (!DEFAULTS[req.params.section]) return res.status(404).json({ error: 'Unknown section' })
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Body must be an object' })

    const updated = await setConfig(req.params.section, req.body)
    await db().collection('adminAudit').add({
      action: 'config.update',
      section: req.params.section,
      patch: redact(req.body),
      at: Date.now(),
    }).catch(() => {})

    res.json({ success: true, section: req.params.section, values: redact(updated), appliesWithin: '60s' })
  } catch (err) { next(err) }
})

router.post('/config/:section/reset', async (req, res, next) => {
  try {
    const def = DEFAULTS[req.params.section]
    if (!def) return res.status(404).json({ error: 'Unknown section' })
    await db().collection('appConfig').doc(req.params.section).set(def)
    await loadConfig(true)
    res.json({ success: true, section: req.params.section, values: def })
  } catch (err) { next(err) }
})

/* --------------------------- API KEY POOLS --------------------------- */

const keySchema = z.object({ key: z.string().min(8) })

/** Add an ImgBB key to the round-robin pool. Live within 60s. */
router.post('/keys/imgbb', async (req, res, next) => {
  try {
    const parsed = keySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid key' })

    const current = getConfig('media.imgbbKeys') || []
    if (current.includes(parsed.data.key)) return res.status(409).json({ error: 'Key already in pool' })

    const next_ = [...current, parsed.data.key]
    await setConfig('media', { imgbbKeys: next_ })
    res.json({ success: true, poolSize: next_.length })
  } catch (err) { next(err) }
})

router.delete('/keys/imgbb', async (req, res, next) => {
  try {
    const current = getConfig('media.imgbbKeys') || []
    const next_ = current.filter((k) => k !== req.body?.key)
    await setConfig('media', { imgbbKeys: next_ })
    res.json({ success: true, poolSize: next_.length })
  } catch (err) { next(err) }
})

/* ------------------------------ STATUS ------------------------------ */

router.get('/status', async (req, res, next) => {
  try {
    const [users, reports, posts] = await Promise.all([
      db().collection('users').get().then((s) => s.size).catch(() => 0),
      db().collection('reports').where('status', '==', 'open').get().then((s) => s.size).catch(() => 0),
      db().collection('posts').get().then((s) => s.size).catch(() => 0),
    ])

    res.json({
      success: true,
      counts: { users, openReports: reports, posts },
      media: mediaStatus(),
      moderation: moderationStatus(),
      outbox: await outboxStats().catch(() => null),
      features: getConfig('features'),
    })
  } catch (err) { next(err) }
})

/** Feature kill switches — flip a broken feature off without a deploy. */
router.patch('/features', async (req, res, next) => {
  try {
    const updated = await setConfig('features', req.body || {})
    res.json({ success: true, features: updated })
  } catch (err) { next(err) }
})

/* -------------------------- MODERATION QUEUE ------------------------- */

router.get('/moderation/queue', async (req, res, next) => {
  try {
    const snap = await db().collection('moderationEvents')
      .where('action', '==', 'review').limit(100).get()
    res.json({ success: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })
  } catch (err) { next(err) }
})

export default router
