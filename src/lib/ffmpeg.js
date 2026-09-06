/**
 * FFmpeg.wasm wrapper — trimming, compression, thumbnails, audio mixing.
 *
 * Design notes that matter:
 *
 * 1. LAZY LOADED. The core is ~25MB. It is fetched only when a user actually
 *    opens the video editor, never on app boot, so the initial bundle is
 *    unaffected.
 *
 * 2. TRIM IS STREAM-COPY BY DEFAULT (`-c copy`). No re-encode means a 60s clip
 *    trims in well under a second instead of a minute. The tradeoff is that
 *    cuts land on the nearest keyframe, so the start can be off by up to ~2s.
 *    When frame accuracy is requested we re-encode instead and say so in the
 *    UI, because silently taking 40x longer is worse than explaining why.
 *
 * 3. SINGLE INSTANCE. Loading twice wastes 25MB and can deadlock the worker.
 *
 * 4. SharedArrayBuffer: the multi-threaded build needs COOP/COEP headers.
 *    We use the SINGLE-THREADED core, which works without any special headers
 *    — slower, but it works on every host including the Capacitor webview and
 *    the preview sandbox. That is the right default.
 */

import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_VERSION = '0.12.10'
const BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

let instance = null
let loadPromise = null
const listeners = new Set()

/** Subscribe to { phase, ratio, message } progress updates. */
export function onFfmpegProgress(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = (payload) => listeners.forEach((fn) => { try { fn(payload) } catch { /* ignore */ } })

/** Is the core already in memory? Lets the UI skip the "preparing" copy. */
export const ffmpegReady = () => !!instance

/**
 * Load ffmpeg.wasm. Safe to call repeatedly — returns the same instance.
 */
export async function loadFfmpeg() {
  if (instance) return instance
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    emit({ phase: 'loading', ratio: 0, message: 'Preparing video tools…' })

    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const ff = new FFmpeg()

    ff.on('progress', ({ progress }) => {
      emit({ phase: 'processing', ratio: Math.max(0, Math.min(1, progress || 0)) })
    })
    if (import.meta.env.DEV) ff.on('log', ({ message }) => console.debug('[ffmpeg]', message))

    // toBlobURL sidesteps cross-origin worker restrictions.
    await ff.load({
      coreURL: await toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    emit({ phase: 'ready', ratio: 1 })
    instance = ff
    return ff
  })()

  try {
    return await loadPromise
  } catch (err) {
    loadPromise = null
    emit({ phase: 'error', message: err.message })
    throw new Error('Could not load the video editor. Check your connection and try again.')
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const IN = 'input.mp4'
const OUT = 'output.mp4'

async function writeInput(ff, source) {
  const data = await fetchFile(source)
  await ff.writeFile(IN, data)
  return data
}

async function readOutput(ff, name = OUT, mime = 'video/mp4') {
  const data = await ff.readFile(name)
  const blob = new Blob([data.buffer], { type: mime })
  return blob
}

async function cleanup(ff, files) {
  await Promise.all(files.map((f) => ff.deleteFile(f).catch(() => {})))
}

const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

const fmt = (s) => {
  const t = Math.max(0, s)
  const m = Math.floor(t / 60)
  const sec = (t % 60).toFixed(2).padStart(5, '0')
  return `${String(m).padStart(2, '0')}:${sec}`
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

/**
 * Trim a clip.
 *
 * @param source        File | Blob | data URL | URL
 * @param start,end     seconds
 * @param accurate      true = re-encode for frame-exact cuts (slow),
 *                      false = stream copy, keyframe-aligned (fast, default)
 */
export async function trimVideo(source, { start = 0, end, accurate = false, maxWidth = 1080 } = {}) {
  const ff = await loadFfmpeg()
  const duration = Math.max(0.1, (end ?? 0) - start)

  await writeInput(ff, source)
  emit({ phase: 'processing', ratio: 0, message: accurate ? 'Trimming precisely…' : 'Trimming…' })

  // -ss BEFORE -i is the fast seek; with -c copy this is near-instant.
  const args = accurate
    ? [
        '-i', IN,
        '-ss', fmt(start),
        '-t', fmt(duration),
        '-vf', `scale='min(${maxWidth},iw)':-2`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        OUT,
      ]
    : [
        '-ss', fmt(start),
        '-i', IN,
        '-t', fmt(duration),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart',
        OUT,
      ]

  await ff.exec(args)
  const blob = await readOutput(ff)
  await cleanup(ff, [IN, OUT])

  emit({ phase: 'done', ratio: 1 })
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    mimeType: 'video/mp4',
    bytes: blob.size,
    isVideo: true,
    durationSec: duration,
  }
}

/**
 * Re-encode to a sane upload size. Called when the source is larger than the
 * configured limit — a 4K phone video is ~200MB and must not be uploaded raw.
 */
export async function compressVideo(source, { maxWidth = 1080, crf = 28, fps = 30 } = {}) {
  const ff = await loadFfmpeg()
  await writeInput(ff, source)
  emit({ phase: 'processing', ratio: 0, message: 'Compressing…' })

  await ff.exec([
    '-i', IN,
    '-vf', `scale='min(${maxWidth},iw)':-2,fps=${fps}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    OUT,
  ])

  const blob = await readOutput(ff)
  await cleanup(ff, [IN, OUT])
  emit({ phase: 'done', ratio: 1 })

  return { blob, dataUrl: await blobToDataUrl(blob), mimeType: 'video/mp4', bytes: blob.size, isVideo: true }
}

/** Single frame as a JPEG — used for the post thumbnail and the scrubber. */
export async function extractThumbnail(source, atSec = 0.1, width = 480) {
  const ff = await loadFfmpeg()
  await writeInput(ff, source)

  const name = 'thumb.jpg'
  await ff.exec([
    '-ss', fmt(atSec),
    '-i', IN,
    '-frames:v', '1',
    '-vf', `scale=${width}:-2`,
    '-q:v', '4',
    name,
  ])

  const blob = await readOutput(ff, name, 'image/jpeg')
  await cleanup(ff, [IN, name])
  return { blob, dataUrl: await blobToDataUrl(blob), mimeType: 'image/jpeg' }
}

/** Evenly spaced frames for the timeline strip. */
export async function extractFilmstrip(source, { count = 8, duration = 1, width = 96 } = {}) {
  const ff = await loadFfmpeg()
  await writeInput(ff, source)

  const frames = []
  for (let i = 0; i < count; i++) {
    const t = (duration / count) * i + duration / (count * 2)
    const name = `f${i}.jpg`
    try {
      await ff.exec(['-ss', fmt(t), '-i', IN, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '8', name])
      const blob = await readOutput(ff, name, 'image/jpeg')
      frames.push(await blobToDataUrl(blob))
      await ff.deleteFile(name).catch(() => {})
    } catch {
      frames.push(null)
    }
    emit({ phase: 'filmstrip', ratio: (i + 1) / count })
  }

  await cleanup(ff, [IN])
  return frames
}

/**
 * Mix a music bed under the original audio.
 * `volume` 0..1 controls the music level; original audio stays at 1.0.
 */
export async function addAudioTrack(source, audioSource, { volume = 0.5, loop = true } = {}) {
  const ff = await loadFfmpeg()
  await writeInput(ff, source)
  await ff.writeFile('music.mp3', await fetchFile(audioSource))

  emit({ phase: 'processing', ratio: 0, message: 'Adding music…' })

  await ff.exec([
    '-i', IN,
    ...(loop ? ['-stream_loop', '-1'] : []),
    '-i', 'music.mp3',
    '-filter_complex',
    `[1:a]volume=${volume}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-movflags', '+faststart',
    OUT,
  ])

  const blob = await readOutput(ff)
  await cleanup(ff, [IN, OUT, 'music.mp3'])
  emit({ phase: 'done', ratio: 1 })

  return { blob, dataUrl: await blobToDataUrl(blob), mimeType: 'video/mp4', bytes: blob.size, isVideo: true }
}

/** Strip audio entirely (the "mute" toggle). */
export async function muteVideo(source) {
  const ff = await loadFfmpeg()
  await writeInput(ff, source)
  await ff.exec(['-i', IN, '-an', '-c:v', 'copy', '-movflags', '+faststart', OUT])
  const blob = await readOutput(ff)
  await cleanup(ff, [IN, OUT])
  return { blob, dataUrl: await blobToDataUrl(blob), mimeType: 'video/mp4', bytes: blob.size, isVideo: true }
}

/** Read duration/dimensions without ffmpeg — the <video> element knows. */
export function probeVideo(src) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight })
      v.src = ''
    }
    v.onerror = () => reject(new Error('Could not read that video.'))
    v.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

export default {
  loadFfmpeg, ffmpegReady, onFfmpegProgress,
  trimVideo, compressVideo, extractThumbnail, extractFilmstrip,
  addAudioTrack, muteVideo, probeVideo,
}
