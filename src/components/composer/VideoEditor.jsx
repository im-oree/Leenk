import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

import Page from '../layout/Page'
import Header from '../layout/Header'
import Button from '../ui/Button'
import Icon from '../ui/Icon'
import Spinner from '../ui/Spinner'
import { haptic } from '../../lib/haptics'
import {
  probeVideo, trimVideo, extractFilmstrip, extractThumbnail,
  muteVideo, onFfmpegProgress, ffmpegReady, loadFfmpeg,
} from '../../lib/ffmpeg'

const MAX_SECONDS = 90
const TRACK_PAD = 14

/**
 * Video trimmer.
 *
 * Two draggable handles over a filmstrip. Preview loops the selection live so
 * you see the cut before committing — the actual ffmpeg pass only runs on
 * "Done", which keeps the interaction instant.
 */
export default function VideoEditor({ asset, onDone, onCancel }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [range, setRange] = useState({ start: 0, end: 0 })
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [muted, setMuted] = useState(false)
  const [strip, setStrip] = useState([])
  const [stripLoading, setStripLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState(null)
  const [ratio, setRatio] = useState(0)
  const [error, setError] = useState(null)
  const [accurate, setAccurate] = useState(false)

  /* ------------------------------ metadata ------------------------------- */
  useEffect(() => {
    let alive = true
    probeVideo(asset.dataUrl)
      .then((meta) => {
        if (!alive) return
        const d = Math.min(meta.duration || 0, 600)
        setDuration(d)
        setRange({ start: 0, end: Math.min(d, MAX_SECONDS) })
      })
      .catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [asset.dataUrl])

  /* ---------------------------- ffmpeg progress -------------------------- */
  useEffect(() => onFfmpegProgress(({ phase: p, ratio: r, message }) => {
    setPhase(message || p)
    if (typeof r === 'number') setRatio(r)
  }), [])

  /* ------------------------------ filmstrip ------------------------------ */
  const buildStrip = useCallback(async () => {
    if (!duration || strip.length) return
    setStripLoading(true)
    try {
      const frames = await extractFilmstrip(asset.dataUrl, { count: 8, duration })
      setStrip(frames)
    } catch {
      // A missing filmstrip is cosmetic — the trimmer still works.
    } finally {
      setStripLoading(false)
    }
  }, [asset.dataUrl, duration, strip.length])

  useEffect(() => {
    if (duration > 0) buildStrip()
  }, [duration, buildStrip])

  /* ------------------------------- playback ------------------------------ */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setCurrent(v.currentTime)
      // Loop within the selected range so the preview matches the output.
      if (v.currentTime >= range.end) {
        v.currentTime = range.start
        if (playing) v.play().catch(() => {})
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [range, playing])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    haptic('light')
    if (v.paused) {
      if (v.currentTime < range.start || v.currentTime >= range.end) v.currentTime = range.start
      v.play().catch(() => {})
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  /* ------------------------------ trim drag ------------------------------ */
  const pointerToTime = (clientX) => {
    const el = trackRef.current
    if (!el || !duration) return 0
    const r = el.getBoundingClientRect()
    const pct = (clientX - r.left - TRACK_PAD) / (r.width - TRACK_PAD * 2)
    return Math.max(0, Math.min(duration, pct * duration))
  }

  const dragHandle = (which) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    haptic('light')
    const move = (ev) => {
      const t = pointerToTime(ev.clientX ?? ev.touches?.[0]?.clientX ?? 0)
      setRange((r) => {
        if (which === 'start') {
          const start = Math.min(t, r.end - 1)
          if (videoRef.current) videoRef.current.currentTime = start
          return { ...r, start: Math.max(0, start) }
        }
        const end = Math.max(t, r.start + 1)
        return { ...r, end: Math.min(duration, Math.min(end, r.start + MAX_SECONDS)) }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      haptic('light')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* -------------------------------- commit ------------------------------- */
  const selected = Math.max(0, range.end - range.start)
  const tooLong = selected > MAX_SECONDS

  const commit = async () => {
    if (busy || tooLong) return
    setBusy(true)
    setError(null)
    try {
      if (!ffmpegReady()) {
        setPhase('Preparing video tools…')
        await loadFfmpeg()
      }

      let out = await trimVideo(asset.dataUrl, { start: range.start, end: range.end, accurate })
      if (muted) out = await muteVideo(out.blob)

      let thumb = null
      try {
        thumb = await extractThumbnail(out.blob, 0.1)
      } catch { /* thumbnail is optional */ }

      haptic('success')
      onDone({ ...asset, ...out, thumbDataUrl: thumb?.dataUrl, trimmed: true })
    } catch (err) {
      setError(err.message || 'Could not process that video.')
      haptic('error')
      setBusy(false)
    }
  }

  const pct = (t) => (duration ? (t / duration) * 100 : 0)

  return (
    <Page nav={false} padBottom={false} scroll={false}>
      <Header
        close
        onClose={onCancel}
        title="Trim video"
        right={
          <Button size="sm" loading={busy} disabled={busy || tooLong || !duration} onClick={commit}>
            Done
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="max-w-[560px] w-full mx-auto px-5 pt-4 pb-10">

          {/* preview */}
          <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={asset.dataUrl}
              muted={muted}
              playsInline
              className="w-full h-full object-contain"
              onClick={togglePlay}
            />

            <button
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="absolute inset-0 grid place-items-center"
            >
              <AnimatePresence>
                {!playing && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-14 h-14 rounded-full bg-black/45 backdrop-blur-md grid place-items-center"
                  >
                    <Icon name="play" size={24} className="text-white translate-x-[1px]" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={() => { haptic('light'); setMuted((m) => !m) }}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-md grid place-items-center"
              >
                <Icon name={muted ? 'mute' : 'mic'} size={17} className="text-white" />
              </button>
            </div>

            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md">
              <span className="text-[11.5px] text-white font-medium tabular-nums">
                {selected.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* timeline */}
          <div className="mt-5">
            <div
              ref={trackRef}
              className="relative h-[58px] rounded-2xl overflow-hidden elev border hairline select-none"
              style={{ paddingInline: TRACK_PAD }}
            >
              {/* filmstrip */}
              <div className="absolute inset-0 flex" style={{ marginInline: TRACK_PAD }}>
                {stripLoading && !strip.length ? (
                  <div className="flex-1 grid place-items-center">
                    <Spinner size={16} />
                  </div>
                ) : strip.length ? (
                  strip.map((f, i) =>
                    f ? (
                      <img key={i} src={f} alt="" className="flex-1 h-full object-cover opacity-90" draggable={false} />
                    ) : (
                      <div key={i} className="flex-1 h-full elev" />
                    ),
                  )
                ) : (
                  <div className="flex-1 h-full elev" />
                )}
              </div>

              {/* dimmed outside the selection */}
              <div className="absolute inset-y-0 bg-black/55 pointer-events-none"
                style={{ left: TRACK_PAD, width: `calc(${pct(range.start)}% - ${TRACK_PAD}px + ${TRACK_PAD}px)` }} />
              <div className="absolute inset-y-0 right-0 bg-black/55 pointer-events-none"
                style={{ left: `calc(${pct(range.end)}%)` }} />

              {/* selection border */}
              <div
                className="absolute inset-y-0 border-y-2 border-brand-500 pointer-events-none"
                style={{ left: `${pct(range.start)}%`, width: `${pct(range.end) - pct(range.start)}%` }}
              />

              {/* playhead */}
              {current >= range.start && current <= range.end && (
                <div className="absolute inset-y-0 w-[2px] bg-white/90 pointer-events-none"
                  style={{ left: `${pct(current)}%` }} />
              )}

              {/* handles */}
              <Handle side="start" left={pct(range.start)} onPointerDown={dragHandle('start')} />
              <Handle side="end" left={pct(range.end)} onPointerDown={dragHandle('end')} />
            </div>

            <div className="flex items-center justify-between mt-2 px-0.5">
              <span className="text-[11.5px] muted tabular-nums">{range.start.toFixed(1)}s</span>
              <span className={`text-[11.5px] tabular-nums ${tooLong ? 'text-red-500' : 'muted'}`}>
                {tooLong ? `Max ${MAX_SECONDS}s` : `${selected.toFixed(1)}s selected`}
              </span>
              <span className="text-[11.5px] muted tabular-nums">{range.end.toFixed(1)}s</span>
            </div>
          </div>

          {/* precision toggle — honest about the tradeoff */}
          <button
            onClick={() => { haptic('light'); setAccurate((a) => !a) }}
            className="w-full flex items-center gap-3 mt-4 px-3.5 py-3 rounded-2xl elev border hairline text-left"
          >
            <Icon name={accurate ? 'check' : 'flash'} size={17} className={accurate ? 'text-brand-500' : 'muted'} />
            <span className="flex-1">
              <span className="block text-[13.5px] font-medium">
                {accurate ? 'Precise cut' : 'Fast cut'}
              </span>
              <span className="block text-[12px] muted">
                {accurate
                  ? 'Exact to the frame. Takes longer to process.'
                  : 'Near-instant. Start may shift up to ~2s.'}
              </span>
            </span>
          </button>

          {/* progress */}
          <AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-4 px-4 py-3.5 rounded-2xl elev border hairline"
              >
                <div className="flex items-center gap-3">
                  <Spinner size={16} />
                  <span className="text-[13px] flex-1">{phase || 'Processing…'}</span>
                  {ratio > 0 && <span className="text-[12px] muted tabular-nums">{Math.round(ratio * 100)}%</span>}
                </div>
                <div className="mt-2.5 h-[3px] rounded-full bg-[color:var(--app-elev)] overflow-hidden">
                  <motion.div
                    className="h-full brand-fill"
                    animate={{ width: `${Math.max(6, ratio * 100)}%` }}
                    transition={{ ease: 'linear', duration: 0.3 }}
                  />
                </div>
                <p className="text-[11.5px] muted mt-2">
                  Editing happens on your device — nothing is uploaded until you share.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-4 px-3.5 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20"
              >
                <p className="text-[13px] text-red-500">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Page>
  )
}

function Handle({ side, left, onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="slider"
      aria-label={side === 'start' ? 'Trim start' : 'Trim end'}
      className="absolute inset-y-0 z-10 flex items-center justify-center cursor-ew-resize touch-none"
      style={{ left: `${left}%`, width: 28, transform: 'translateX(-50%)' }}
    >
      <span className="w-[14px] h-full rounded-md brand-fill grid place-items-center shadow-glow">
        <span className="w-[2px] h-4 rounded-full bg-white/85" />
      </span>
    </div>
  )
}
