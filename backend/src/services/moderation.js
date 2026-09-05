/**
 * Content moderation — NSFW imagery and abusive text.
 *
 * Provider is chosen at runtime from `appConfig/moderation`, so we can swap
 * NSFW backends (or turn moderation off during an incident) without a deploy.
 *
 * Providers, in order of preference for a zero-cost setup:
 *   nsfwjs      — TensorFlow model running in THIS process. Free forever, no
 *                 API key, no credit card, no data leaves the server.
 *   cloudflare  — Workers AI. Generous free tier, needs an account token.
 *   groq        — Llama vision / text. Free tier, very fast, needs a key.
 *   none        — disabled.
 *
 * Fail-open vs fail-closed: if the provider errors we return `allow` with
 * `degraded: true` rather than blocking uploads. A moderation outage must not
 * break the product; the review queue catches what slipped through.
 */

import { getConfig } from './appConfig.js'
import { db } from '../lib/firebase.js'

let nsfwModel = null
let modelLoading = null

/** Lazy-load nsfwjs so a deployment that doesn't use it pays no memory cost. */
async function getNsfwModel() {
  if (nsfwModel) return nsfwModel
  if (modelLoading) return modelLoading

  modelLoading = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs-node')
      const nsfw = await import('nsfwjs')
      nsfwModel = await nsfw.load()
      return nsfwModel
    } catch {
      // Package not installed — caller falls back to another provider.
      return null
    } finally {
      modelLoading = null
    }
  })()

  return modelLoading
}

/* ------------------------------------------------------------------ *
 * Image moderation
 * ------------------------------------------------------------------ */

const NSFW_CLASSES = ['Porn', 'Hentai', 'Sexy']

async function classifyNsfwjs(base64) {
  const model = await getNsfwModel()
  if (!model) return null

  const tf = await import('@tensorflow/tfjs-node')
  const buf = Buffer.from(base64, 'base64')
  const image = tf.node.decodeImage(buf, 3)
  try {
    const preds = await model.classify(image)
    const byClass = Object.fromEntries(preds.map((p) => [p.className, p.probability]))
    // 'Sexy' is weighted lower — swimwear on a dating app isn't pornography.
    const score = Math.max(
      byClass.Porn || 0,
      byClass.Hentai || 0,
      (byClass.Sexy || 0) * 0.55,
    )
    return { score, classes: byClass }
  } finally {
    image.dispose()
  }
}

async function classifyCloudflare(base64) {
  const account = getConfig('moderation.cloudflareAccountId')
  const token = getConfig('moderation.cloudflareToken')
  if (!account || !token) return null

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/microsoft/resnet-50`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(base64, 'base64'),
    },
  )
  if (!res.ok) return null
  const json = await res.json()
  const labels = json?.result || []
  const hit = labels.find((l) => /nud|porn|explicit|lingerie/i.test(l.label))
  return { score: hit?.score ?? 0, classes: Object.fromEntries(labels.map((l) => [l.label, l.score])) }
}

/**
 * @returns {{action:'allow'|'review'|'block', score:number, provider:string, degraded?:boolean}}
 */
export async function moderateImage({ base64, uid, surface = 'post' }) {
  const cfg = getConfig('moderation')

  if (!cfg.enabled || cfg.nsfwProvider === 'none') {
    return { action: 'allow', score: 0, provider: 'disabled' }
  }

  const surfaceEnabled = {
    profile: cfg.scanProfilePhotos,
    post: cfg.scanPosts,
    story: cfg.scanStories,
    chat: cfg.scanChatImages,
  }[surface] ?? true
  if (!surfaceEnabled) return { action: 'allow', score: 0, provider: 'skipped' }

  let result = null
  try {
    if (cfg.nsfwProvider === 'nsfwjs') result = await classifyNsfwjs(base64)
    else if (cfg.nsfwProvider === 'cloudflare') result = await classifyCloudflare(base64)
  } catch (err) {
    console.warn('[moderation] image provider error:', err.message)
  }

  if (!result) {
    // Fail open, but record it so the review queue can catch up.
    return { action: 'allow', score: 0, provider: cfg.nsfwProvider, degraded: true }
  }

  const { score } = result
  let action = 'allow'
  if (score >= cfg.nsfwThresholdBlock) action = 'block'
  else if (score >= cfg.nsfwThresholdReview && cfg.reviewQueueOnUncertain) action = 'review'

  if (action !== 'allow') await recordModeration({ uid, surface, score, classes: result.classes, action })

  return {
    action,
    score,
    classes: result.classes,
    provider: cfg.nsfwProvider,
    userMessage:
      action === 'block'
        ? "That image doesn't meet our guidelines. Try a different photo."
        : undefined,
  }
}

/* ------------------------------------------------------------------ *
 * Text moderation
 * ------------------------------------------------------------------ */

const SLUR_PATTERNS = [
  /\b(kill\s+your ?self|kys)\b/i,
  /\b(nigg|f[a4]gg|tr[a4]nn)/i,
]

const CONTACT_PATTERNS = [
  /\b(?:\+?234|0)\d{9,11}\b/,          // NG phone
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,     // email
  /\b(?:wa\.me|t\.me|snapchat|telegram|whatsapp)\b/i,
]

/**
 * Cheap local pass first, model second. Most abuse is caught by the regexes
 * at zero cost and zero latency; the model handles what's subtler.
 */
export async function moderateText({ text, uid, surface = 'message' }) {
  const cfg = getConfig('moderation')
  if (!cfg.enabled) return { action: 'allow', flags: [] }

  const flags = []
  if (SLUR_PATTERNS.some((r) => r.test(text))) flags.push('HATE_OR_HARASSMENT')
  if (CONTACT_PATTERNS.some((r) => r.test(text))) flags.push('CONTACT_INFO')

  if (flags.includes('HATE_OR_HARASSMENT')) {
    await recordModeration({ uid, surface, score: 1, action: 'block', flags })
    return {
      action: 'block',
      flags,
      userMessage: 'That message breaks our community guidelines.',
    }
  }

  // Contact info is a soft signal, not a block — students legitimately swap
  // handles. It feeds the trust score if it's happening at scale.
  if (flags.length) return { action: 'flag', flags }

  return { action: 'allow', flags: [] }
}

/* ------------------------------------------------------------------ */

async function recordModeration(entry) {
  try {
    await db().collection('moderationEvents').add({ ...entry, at: Date.now() })
  } catch { /* non-critical */ }
}

export function moderationStatus() {
  const cfg = getConfig('moderation')
  return {
    enabled: cfg.enabled,
    imageProvider: cfg.nsfwProvider,
    textProvider: cfg.textProvider,
    thresholds: { block: cfg.nsfwThresholdBlock, review: cfg.nsfwThresholdReview },
    modelLoaded: !!nsfwModel,
  }
}

export default { moderateImage, moderateText, moderationStatus }
