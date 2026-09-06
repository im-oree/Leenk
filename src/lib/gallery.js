/**
 * Camera + gallery access, one API for both runtimes.
 *
 * Capacitor (native) → @capacitor/camera, real system picker + camera.
 * Web              → <input type="file"> with `capture` for mobile browsers.
 *
 * Capacitor plugins are imported dynamically so the web bundle never pays for
 * them, and so the app still runs in a browser where they don't exist.
 *
 * Everything is normalised to: { base64, dataUrl, mimeType, width, height, bytes }
 */

const isNative = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true

/* ------------------------------------------------------------------ *
 * Downscaling — never upload a 12MP phone photo
 * ------------------------------------------------------------------ */

const MAX_EDGE = 1600
const QUALITY = 0.82

async function downscale(dataUrl, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  if (scale === 1 && dataUrl.length < 1_500_000) {
    return { dataUrl, width: img.width, height: img.height }
  }

  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h }
}

function splitDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) return { mimeType: 'image/jpeg', base64: dataUrl }
  return { mimeType: m[1], base64: m[2] }
}

const measure = (dataUrl) => {
  const { base64 } = splitDataUrl(dataUrl)
  return Math.floor((base64.length * 3) / 4)
}

async function normalise(dataUrl, opts) {
  const scaled = await downscale(dataUrl, opts)
  const { mimeType, base64 } = splitDataUrl(scaled.dataUrl)
  return {
    dataUrl: scaled.dataUrl,
    base64,
    mimeType,
    width: scaled.width,
    height: scaled.height,
    bytes: measure(scaled.dataUrl),
  }
}

/* ------------------------------------------------------------------ *
 * Web implementation
 * ------------------------------------------------------------------ */

function pickWeb({ multiple = false, accept = 'image/*', capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    if (capture) input.capture = capture
    input.style.display = 'none'
    document.body.appendChild(input)

    let settled = false
    const done = (files) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }

    input.onchange = async () => {
      const files = Array.from(input.files || [])
      if (!files.length) return done([])
      const read = await Promise.all(
        files.map(
          (f) =>
            new Promise((res) => {
              const r = new FileReader()
              r.onload = () => res({ dataUrl: r.result, name: f.name, type: f.type })
              r.onerror = () => res(null)
              r.readAsDataURL(f)
            }),
        ),
      )
      done(read.filter(Boolean))
    }

    // If the user cancels, `change` never fires; window focus is the only cue.
    window.addEventListener(
      'focus',
      () => setTimeout(() => { if (!input.files?.length) done([]) }, 400),
      { once: true },
    )

    input.click()
  })
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/** Take a photo with the camera. */
export async function takePhoto(opts = {}) {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 88,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: MAX_EDGE,
      })
      return [await normalise(photo.dataUrl, opts)]
    } catch (err) {
      if (/cancel/i.test(err?.message || '')) return []
      throw err
    }
  }

  const files = await pickWeb({ accept: 'image/*', capture: 'environment' })
  return Promise.all(files.map((f) => normalise(f.dataUrl, opts)))
}

/** Pick one or more images from the gallery. */
export async function pickImages({ limit = 1, ...opts } = {}) {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')

      if (limit > 1 && Camera.pickImages) {
        const { photos } = await Camera.pickImages({ quality: 88, limit })
        const urls = await Promise.all(
          photos.map(async (p) => {
            if (p.dataUrl) return p.dataUrl
            const blob = await fetch(p.webPath).then((r) => r.blob())
            return new Promise((res) => {
              const r = new FileReader()
              r.onload = () => res(r.result)
              r.readAsDataURL(blob)
            })
          }),
        )
        return Promise.all(urls.map((u) => normalise(u, opts)))
      }

      const photo = await Camera.getPhoto({
        quality: 88,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        correctOrientation: true,
        width: MAX_EDGE,
      })
      return [await normalise(photo.dataUrl, opts)]
    } catch (err) {
      if (/cancel/i.test(err?.message || '')) return []
      throw err
    }
  }

  const files = await pickWeb({ multiple: limit > 1, accept: 'image/*' })
  return Promise.all(files.slice(0, limit).map((f) => normalise(f.dataUrl, opts)))
}

/** Pick a video (feed posts / stories). Not downscaled — trimmed client-side. */
export async function pickVideo() {
  const files = await pickWeb({ accept: 'video/*' })
  if (!files.length) return []
  const f = files[0]
  const { mimeType, base64 } = splitDataUrl(f.dataUrl)
  return [{ dataUrl: f.dataUrl, base64, mimeType, bytes: measure(f.dataUrl), isVideo: true }]
}

/**
 * Ask for camera/photo permission up front where the platform supports it,
 * so the picker doesn't fail silently the first time.
 */
export async function ensurePermissions() {
  if (!isNative()) return { camera: 'prompt', photos: 'prompt' }
  try {
    const { Camera } = await import('@capacitor/camera')
    const status = await Camera.checkPermissions()
    if (status.camera === 'granted' && status.photos === 'granted') return status
    return await Camera.requestPermissions()
  } catch {
    return { camera: 'denied', photos: 'denied' }
  }
}

export const galleryAvailable = () => true
export const nativeGallery = isNative
