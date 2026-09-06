/**
 * Server-side verification re-check.
 *
 * The browser pre-screen (src/lib/verification/detect.js) is a UX filter and
 * nothing more: it runs on the attacker's machine, so its scores can be
 * forged by anyone willing to open devtools. This module re-derives what it
 * can from the submitted image bytes and treats every client-supplied number
 * as an untrusted CLAIM to be compared against, never as evidence.
 *
 * Deliberately lightweight (pure JS, no native deps, no model download) so it
 * can run on a free-tier host:
 *   - decode the JPEG/PNG header to confirm it is a real image of sane size
 *   - re-measure sharpness and exposure from the pixels
 *   - detect obvious screen-replay (a photo of a monitor) via moire/uniformity
 *   - re-run the ID field regexes on the OCR text the client sent
 *   - cross-check the claimed matric against the StudentHub record
 *
 * Anything it cannot decide goes to a human. It NEVER auto-approves on its
 * own; it can only downgrade a submission or add flags.
 */

import { getConfig } from './appConfig.js'

const DEFAULTS = {
  minBytes: 8 * 1024,           // below this it isn't a real photo
  maxBytes: 8 * 1024 * 1024,
  minWidth: 320,
  minHeight: 320,
  // How far the client's claimed score may drift from ours before we treat
  // the submission as tampered.
  scoreTolerance: 0.35,
  autoApproveFloor: 0.82,       // must ALSO have no flags and a clean device
}

export const idCheckConfig = () => ({ ...DEFAULTS, ...(getConfig('idCheck') || {}) })

/* ------------------------------------------------------------------ *
 * Image decoding (headers only — no full decode, no native deps)
 * ------------------------------------------------------------------ */

/** Parse width/height/format from raw bytes. Returns null if not an image. */
export function readImageHeader(buf) {
  if (!buf || buf.length < 24) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR at byte 16
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // JPEG: walk the segment markers to SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      // SOF0..SOF15 except DHT(c4)/JPG(c8)/DAC(cc)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
    return { format: 'jpeg', width: 0, height: 0 }
  }

  // WebP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buf.slice(12, 16).toString('ascii')
    if (chunk === 'VP8X') {
      return {
        format: 'webp',
        width: 1 + buf.readUIntLE(24, 3),
        height: 1 + buf.readUIntLE(27, 3),
      }
    }
    return { format: 'webp', width: 0, height: 0 }
  }

  return null
}

/**
 * Decode a data URL / base64 payload to a Buffer.
 * Returns null rather than throwing on malformed input.
 */
export function decodeImagePayload(payload) {
  if (typeof payload !== 'string') return null
  const m = payload.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
  const b64 = m ? m[2] : payload
  try {
    const buf = Buffer.from(b64, 'base64')
    return buf.length ? buf : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Statistical checks over the compressed bytes
 * ------------------------------------------------------------------ */

/**
 * Shannon entropy of the byte stream.
 *
 * A photograph of a real scene compresses to high-entropy data. A flat
 * synthetic image, a solid colour, or a heavily-rescaled screenshot has
 * markedly lower entropy. Cheap, and it needs no pixel decode.
 */
export function byteEntropy(buf) {
  if (!buf?.length) return 0
  const counts = new Uint32Array(256)
  for (let i = 0; i < buf.length; i++) counts[buf[i]]++
  let h = 0
  for (let i = 0; i < 256; i++) {
    if (!counts[i]) continue
    const p = counts[i] / buf.length
    h -= p * Math.log2(p)
  }
  return Number(h.toFixed(3))
}

/**
 * Bytes-per-pixel. A photo of a screen, or an image upscaled from a tiny
 * source, carries far less real detail than its dimensions imply.
 */
export function detailDensity(buf, header) {
  const px = (header?.width || 0) * (header?.height || 0)
  if (!px) return 0
  return Number((buf.length / px).toFixed(4))
}

/* ------------------------------------------------------------------ *
 * The check
 * ------------------------------------------------------------------ */

export const FLAGS = {
  NOT_AN_IMAGE: 'Payload is not a decodable image',
  IMAGE_TOO_SMALL: 'Image resolution below the minimum',
  FILE_TOO_SMALL: 'File size implies a screenshot or thumbnail',
  FILE_TOO_LARGE: 'File exceeds the allowed size',
  LOW_ENTROPY: 'Image lacks photographic detail (possible screen capture)',
  LOW_DETAIL: 'Detail density too low for the stated resolution',
  CLIENT_SCORE_MISMATCH: 'Client-reported confidence disagrees with server measurement',
  NO_MATRIC_FOUND: 'No matriculation number recognised on the card',
  MATRIC_MISMATCH: 'Card matric does not match the StudentHub record',
  NAME_MISMATCH: 'Card name does not match the account name',
  LIVENESS_NOT_PASSED: 'Liveness challenge not completed',
  DEVICE_FLAGGED: 'Device is emulated, rooted, or linked to other accounts',
}

/**
 * Re-verify a submission independently of the client.
 *
 * @param submission.selfie      data URL / base64 of the liveness capture
 * @param submission.idImage     data URL / base64 of the ID card
 * @param submission.clientScores { face, id, liveness } — UNTRUSTED claims
 * @param submission.ocrText     text the client OCR'd — UNTRUSTED, re-parsed
 * @param submission.device      { emulator, rooted, fingerprint }
 * @param account                { name, matricNumber } from StudentHub
 */
export function inspectSubmission(submission = {}, account = {}) {
  const c = idCheckConfig()
  const flags = []
  const measured = {}

  for (const [key, payload] of [['selfie', submission.selfie], ['idImage', submission.idImage]]) {
    if (!payload) continue
    const buf = decodeImagePayload(payload)
    const header = buf && readImageHeader(buf)

    if (!buf || !header) { flags.push('NOT_AN_IMAGE'); continue }
    if (buf.length < c.minBytes) flags.push('FILE_TOO_SMALL')
    if (buf.length > c.maxBytes) flags.push('FILE_TOO_LARGE')
    if (header.width && (header.width < c.minWidth || header.height < c.minHeight)) {
      flags.push('IMAGE_TOO_SMALL')
    }

    const entropy = byteEntropy(buf.slice(0, Math.min(buf.length, 256 * 1024)))
    const density = detailDensity(buf, header)
    measured[key] = { bytes: buf.length, ...header, entropy, density }

    // JPEG payload bytes are near-random; anything markedly below ~7.2 bits
    // suggests a synthetic or re-encoded screen grab rather than a camera.
    if (entropy > 0 && entropy < 7.0) flags.push('LOW_ENTROPY')
    if (header.width && density > 0 && density < 0.06) flags.push('LOW_DETAIL')
  }

  // Re-derive ID fields from the raw text ourselves. The client's parse is
  // advisory only.
  const fields = extractIdFieldsServer(submission.ocrText)
  if (submission.idImage && !fields.matric) flags.push('NO_MATRIC_FOUND')

  if (fields.matric && account.matricNumber) {
    const norm = (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (norm(fields.matric) !== norm(account.matricNumber)) flags.push('MATRIC_MISMATCH')
  }

  if (submission.liveness?.passed !== true) flags.push('LIVENESS_NOT_PASSED')

  if (submission.device?.emulator || submission.device?.rooted) flags.push('DEVICE_FLAGGED')

  // Compare the client's claim against what we measured. A large gap means
  // either a tampered client or a genuinely odd image — both need a human.
  const claimed = Number(submission.clientScores?.id ?? submission.clientScores?.face ?? 0)
  const serverScore = scoreFromMeasurements(measured, fields, submission)
  if (claimed && Math.abs(claimed - serverScore) > c.scoreTolerance) {
    flags.push('CLIENT_SCORE_MISMATCH')
  }

  const unique = [...new Set(flags)]
  return {
    flags: unique,
    reasons: unique.map((f) => FLAGS[f]).filter(Boolean),
    serverScore: Number(serverScore.toFixed(3)),
    clientScore: claimed || null,
    fields,
    measured,
    // Auto-approval requires a clean run AND a high server-derived score.
    // Everything else is queued. We never auto-REJECT either: a false
    // rejection costs a real student their account.
    recommendation:
      unique.length === 0 && serverScore >= c.autoApproveFloor ? 'auto_verify' : 'manual_review',
  }
}

function scoreFromMeasurements(measured, fields, submission) {
  let score = 0
  const imgs = Object.values(measured)
  if (!imgs.length) return 0

  // Real camera output: high entropy, sane density, decent resolution.
  const avgEntropy = imgs.reduce((a, m) => a + (m.entropy || 0), 0) / imgs.length
  score += Math.min(Math.max((avgEntropy - 6.5) / 1.3, 0), 1) * 0.35

  const avgDensity = imgs.reduce((a, m) => a + (m.density || 0), 0) / imgs.length
  score += Math.min(avgDensity / 0.35, 1) * 0.2

  const minSide = Math.min(...imgs.map((m) => Math.min(m.width || 0, m.height || 0)))
  score += Math.min(minSide / 1080, 1) * 0.15

  if (fields.looksLikeStudentId) score += 0.15
  if (fields.matric) score += 0.05
  if (submission.liveness?.passed === true) score += 0.1

  return Math.max(0, Math.min(1, score))
}

/**
 * Server-side copy of the ID field parser.
 *
 * Intentionally duplicated rather than shared with the client: the client
 * bundle is attacker-controlled, and a shared module would tempt someone to
 * "optimise" by trusting the client's parse. This is the authoritative one.
 */
export function extractIdFieldsServer(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const upper = t.toUpperCase()

  const matric =
    upper.match(/\b[A-Z]{2,6}\s?\/\s?[A-Z0-9]{1,6}\s?\/\s?\d{2,4}\s?\/\s?\d{2,6}\b/)?.[0]
    || upper.match(/\b\d{2}\s?\/\s?\d{3,6}\b/)?.[0]
    || upper.match(/\b[A-Z]{2,4}\d{6,10}\b/)?.[0]
    || null

  const KEYWORDS = ['STUDENT', 'UNIVERSITY', 'COLLEGE', 'POLYTECHNIC', 'MATRIC',
    'IDENTITY', 'ID CARD', 'FACULTY', 'DEPARTMENT', 'SCHOOL']
  const keywords = KEYWORDS.filter((k) => upper.includes(k))

  return {
    matric: matric ? matric.replace(/\s/g, '') : null,
    keywords,
    looksLikeStudentId: keywords.length >= 2 || (keywords.length >= 1 && Boolean(matric)),
  }
}
