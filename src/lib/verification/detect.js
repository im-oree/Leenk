/**
 * On-device face + ID detection.
 *
 * This is a PRE-SCREEN, not a decision. It exists to:
 *   - stop junk reaching the review queue (no face, blurry, no card)
 *   - give the reviewer a confidence score and reasons to sort by
 *   - give the student instant feedback instead of a 24h round trip
 *
 * It deliberately does NOT approve anyone. Every real decision is made by
 * the backend (which re-checks independently) and, where it matters, a human
 * in the admin panel. Anything running in the browser is attacker-controlled:
 * a determined user can patch the JS and post whatever scores they like.
 * That is exactly why the server never trusts these numbers.
 *
 * Zero-cost constraint: TensorFlow.js + BlazeFace + Tesseract all run locally.
 * No API key, no account, no credit card, and the images never leave the
 * device until the student presses submit.
 */

let _tf = null
let _blazeface = null
let _model = null

/** Lazily pull in TF.js — it's ~1MB, so never on app boot. */
async function loadModel(onProgress) {
  if (_model) return _model
  onProgress?.({ stage: 'loading', pct: 10 })

  _tf = await import('@tensorflow/tfjs')
  await _tf.ready()
  onProgress?.({ stage: 'loading', pct: 55 })

  _blazeface = await import('@tensorflow-models/blazeface')
  _model = await _blazeface.load()
  onProgress?.({ stage: 'ready', pct: 100 })
  return _model
}

/* ------------------------------------------------------------------ *
 * Image quality
 * ------------------------------------------------------------------ */

/**
 * Variance of the Laplacian — the standard cheap blur metric.
 * A sharp photo has high edge variance; a blurry or out-of-focus one is flat.
 */
export function sharpnessScore(imageData) {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap =
        -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Mean luminance 0..1. Catches photos taken in the dark or blown out. */
export function exposureScore(imageData) {
  const { data } = imageData
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
  }
  return sum / (data.length / 4)
}

function toImageData(source, maxSide = 512) {
  const w = source.videoWidth || source.naturalWidth || source.width
  const h = source.videoHeight || source.naturalHeight || source.height
  if (!w || !h) return null

  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, cw, ch)
  return ctx.getImageData(0, 0, cw, ch)
}

/* ------------------------------------------------------------------ *
 * Face detection
 * ------------------------------------------------------------------ */

export const FACE_REASONS = {
  NO_FACE: 'We couldn\u2019t find a face. Move into the frame and try again.',
  MULTIPLE_FACES: 'More than one person is in frame. Take this one alone.',
  TOO_SMALL: 'Move a bit closer so your face fills more of the frame.',
  TOO_DARK: 'It\u2019s too dark. Find better lighting.',
  TOO_BRIGHT: 'Too much glare. Move away from the direct light.',
  BLURRY: 'That came out blurry. Hold still and try again.',
  OFF_CENTRE: 'Centre your face in the frame.',
}

/**
 * Detect exactly one, well-framed, sharp face.
 * Returns { ok, reasons[], confidence, box, landmarks }.
 */
export async function detectFace(source, { onProgress } = {}) {
  const model = await loadModel(onProgress)
  const imageData = toImageData(source)
  if (!imageData) return { ok: false, reasons: ['NO_FACE'], confidence: 0 }

  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)

  const faces = await model.estimateFaces(canvas, false)
  const reasons = []

  if (!faces.length) return { ok: false, reasons: ['NO_FACE'], confidence: 0 }
  if (faces.length > 1) reasons.push('MULTIPLE_FACES')

  const f = faces[0]
  const [x1, y1] = f.topLeft
  const [x2, y2] = f.bottomRight
  const fw = x2 - x1
  const fh = y2 - y1
  const frac = (fw * fh) / (imageData.width * imageData.height)

  if (frac < 0.06) reasons.push('TOO_SMALL')

  const cx = (x1 + x2) / 2 / imageData.width
  const cy = (y1 + y2) / 2 / imageData.height
  if (Math.abs(cx - 0.5) > 0.28 || Math.abs(cy - 0.5) > 0.3) reasons.push('OFF_CENTRE')

  const exposure = exposureScore(imageData)
  if (exposure < 0.18) reasons.push('TOO_DARK')
  if (exposure > 0.92) reasons.push('TOO_BRIGHT')

  const sharpness = sharpnessScore(imageData)
  if (sharpness < 55) reasons.push('BLURRY')

  // Confidence is a blend of the model's own probability and our framing
  // checks. Never presented to the user as a pass mark — it only ranks the
  // review queue.
  const modelProb = Array.isArray(f.probability) ? f.probability[0] : (f.probability ?? 0.5)
  const confidence = Math.max(0, Math.min(1,
    modelProb * 0.6
    + Math.min(frac / 0.25, 1) * 0.2
    + Math.min(sharpness / 250, 1) * 0.2,
  ))

  return {
    ok: reasons.length === 0,
    reasons,
    confidence: Number(confidence.toFixed(3)),
    box: { x: x1, y: y1, w: fw, h: fh },
    landmarks: f.landmarks || null,
    metrics: {
      faceFraction: Number(frac.toFixed(4)),
      exposure: Number(exposure.toFixed(3)),
      sharpness: Math.round(sharpness),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Liveness
 * ------------------------------------------------------------------ */

/**
 * Passive liveness via a challenge the user can't pre-record: we ask for a
 * specific head turn / blink and check the landmarks actually moved.
 *
 * This defeats a still photo held to the camera. It does NOT defeat a video
 * replay or a good mask — which is precisely why a human still reviews.
 */
export function createLivenessSession(challenges = ['centre', 'left', 'right']) {
  const captured = []
  let index = 0

  return {
    get current() { return challenges[index] },
    get progress() { return index / challenges.length },
    get done() { return index >= challenges.length },

    /** Feed a detection result for the current challenge. */
    submit(detection) {
      if (!detection?.ok || !detection.landmarks) return { accepted: false }
      captured.push({ challenge: challenges[index], landmarks: detection.landmarks })
      index += 1
      return { accepted: true, done: index >= challenges.length }
    },

    /**
     * A real person turning their head moves the eye landmarks relative to
     * the nose. A photo held up produces near-identical geometry every frame.
     */
    evaluate() {
      if (captured.length < 2) return { passed: false, reason: 'INCOMPLETE', score: 0 }

      const ratios = captured.map(({ landmarks }) => {
        const [rightEye, leftEye, nose] = landmarks
        const dxR = Math.abs(rightEye[0] - nose[0])
        const dxL = Math.abs(leftEye[0] - nose[0])
        return dxR / Math.max(dxL, 1e-6)
      })

      const spread = Math.max(...ratios) - Math.min(...ratios)
      // A still photo yields a spread near zero; a genuine turn moves it well
      // past this. Tuned deliberately loose — false rejections cost a real
      // student their signup, and a human sees every borderline case anyway.
      const passed = spread > 0.35
      return {
        passed,
        score: Number(Math.min(spread / 0.9, 1).toFixed(3)),
        reason: passed ? null : 'NO_MOVEMENT_DETECTED',
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * ID card detection
 * ------------------------------------------------------------------ */

export const ID_REASONS = {
  NO_CARD: 'We couldn\u2019t find a card. Lay it flat and fill the frame.',
  BLURRY: 'The text is too blurry to read. Hold steady.',
  TOO_DARK: 'Too dark to read the card.',
  GLARE: 'There\u2019s glare on the card. Tilt it slightly.',
  NO_TEXT: 'We couldn\u2019t read any text on that card.',
  NOT_A_STUDENT_ID: 'That doesn\u2019t look like a student ID.',
}

/**
 * Find a card-shaped bright quadrilateral and confirm it carries readable
 * text. Detection is geometric (edge density + aspect ratio) rather than a
 * trained model, because a student ID looks different at every institution
 * and a model trained on one campus generalises badly.
 */
export async function detectIdCard(source, { ocr = true, onProgress } = {}) {
  const imageData = toImageData(source, 720)
  if (!imageData) return { ok: false, reasons: ['NO_CARD'], confidence: 0 }

  const reasons = []
  const exposure = exposureScore(imageData)
  const sharpness = sharpnessScore(imageData)

  if (exposure < 0.16) reasons.push('TOO_DARK')
  if (exposure > 0.94) reasons.push('GLARE')
  if (sharpness < 70) reasons.push('BLURRY')

  const card = findCardRegion(imageData)
  if (!card) reasons.push('NO_CARD')

  let text = ''
  let fields = {}
  if (ocr && !reasons.includes('BLURRY') && !reasons.includes('NO_CARD')) {
    onProgress?.({ stage: 'reading', pct: 40 })
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const res = await Tesseract.recognize(sourceToDataUrl(source), 'eng', {
        logger: (m) => m.progress != null
          && onProgress?.({ stage: 'reading', pct: 40 + m.progress * 55 }),
      })
      text = res?.data?.text || ''
      fields = extractIdFields(text)
      if (text.trim().length < 12) reasons.push('NO_TEXT')
      else if (!fields.looksLikeStudentId) reasons.push('NOT_A_STUDENT_ID')
    } catch {
      // OCR is best-effort. If it fails we still submit the image for review
      // rather than blocking a legitimate student behind a flaky model.
      text = ''
    }
  }

  const confidence = Math.max(0, Math.min(1,
    (card ? 0.4 : 0)
    + Math.min(sharpness / 300, 1) * 0.25
    + (fields.looksLikeStudentId ? 0.25 : 0)
    + (text.trim().length > 40 ? 0.1 : 0),
  ))

  onProgress?.({ stage: 'done', pct: 100 })
  return {
    ok: reasons.length === 0,
    reasons,
    confidence: Number(confidence.toFixed(3)),
    card,
    text: text.slice(0, 2000),
    fields,
    metrics: {
      exposure: Number(exposure.toFixed(3)),
      sharpness: Math.round(sharpness),
    },
  }
}

function sourceToDataUrl(source, maxSide = 1000) {
  const w = source.videoWidth || source.naturalWidth || source.width
  const h = source.videoHeight || source.naturalHeight || source.height
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.9)
}

/**
 * Locate a card: a large, roughly ID-1 aspect (85.6 x 54mm, ~1.586) region
 * whose interior is brighter and edgier than the surroundings.
 */
function findCardRegion(imageData) {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  // Column/row edge energy — the card's borders show as sustained peaks.
  const colEnergy = new Float32Array(width)
  const rowEnergy = new Float32Array(height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx = Math.abs(gray[i + 1] - gray[i - 1])
      const gy = Math.abs(gray[i + width] - gray[i - width])
      colEnergy[x] += gx
      rowEnergy[y] += gy
    }
  }

  const bounds = (arr, len) => {
    const mean = arr.reduce((a, b) => a + b, 0) / len
    let lo = 0
    let hi = len - 1
    while (lo < len && arr[lo] < mean * 0.6) lo++
    while (hi > lo && arr[hi] < mean * 0.6) hi--
    return [lo, hi]
  }

  const [x1, x2] = bounds(colEnergy, width)
  const [y1, y2] = bounds(rowEnergy, height)
  const w = x2 - x1
  const h = y2 - y1
  if (w < width * 0.35 || h < height * 0.2) return null

  const aspect = w / Math.max(h, 1)
  // Accept a wide band: cards are photographed at an angle, and portrait
  // orientation is common on phones.
  if (aspect < 1.05 || aspect > 2.4) return null

  return { x: x1, y: y1, w, h, aspect: Number(aspect.toFixed(2)) }
}

/**
 * Pull the fields a Nigerian student ID typically carries. Used to sanity
 * check that this is a student card and to pre-fill the reviewer's view —
 * never to auto-approve.
 */
export function extractIdFields(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const upper = t.toUpperCase()

  // Matric formats vary by school, so match broadly: letters+digits, or the
  // common slash-separated form (e.g. 19/1234, BU/CS/19/1234).
  const matric =
    upper.match(/\b[A-Z]{2,6}\s?\/\s?[A-Z0-9]{1,6}\s?\/\s?\d{2,4}\s?\/\s?\d{2,6}\b/)?.[0]
    || upper.match(/\b\d{2}\s?\/\s?\d{3,6}\b/)?.[0]
    || upper.match(/\b[A-Z]{2,4}\d{6,10}\b/)?.[0]
    || null

  const KEYWORDS = ['STUDENT', 'UNIVERSITY', 'COLLEGE', 'POLYTECHNIC', 'MATRIC',
    'IDENTITY', 'ID CARD', 'FACULTY', 'DEPARTMENT', 'SCHOOL']
  const hits = KEYWORDS.filter((k) => upper.includes(k))

  const expiry = upper.match(/\b(20\d{2})\s?[/-]\s?(20\d{2})\b/)?.[0]
    || upper.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/)?.[0]
    || null

  return {
    matric: matric ? matric.replace(/\s/g, '') : null,
    expiry,
    keywords: hits,
    // Two independent signals: institutional vocabulary AND an id-like token.
    looksLikeStudentId: hits.length >= 2 || (hits.length >= 1 && Boolean(matric)),
  }
}

/** Free the model when leaving verification — it's ~1MB of GPU memory. */
export function disposeModels() {
  _model = null
  _blazeface = null
  if (_tf?.disposeVariables) {
    try { _tf.disposeVariables() } catch { /* already gone */ }
  }
}
