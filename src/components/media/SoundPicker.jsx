import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Input from '../ui/Input'
import Chip from '../ui/Chip'
import Icon from '../ui/Icon'
import SmartImage from '../ui/SmartImage'
import EmptyState from '../ui/EmptyState'
import { media } from '../../lib/data'
import { haptic } from '../../lib/haptics'

const MOODS = ['afrobeat', 'lofi', 'chill', 'upbeat', 'piano', 'ambient', 'hip hop', 'acoustic']

const fmt = (s) => {
  if (!s && s !== 0) return ''
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Sound / music picker for the composer.
 *
 * Backed by Openverse (Creative Commons + public domain) — no API key, no
 * credit card, which is the zero-cost constraint. Because these are CC works
 * being republished publicly, ATTRIBUTION IS NOT OPTIONAL: it rides along on
 * the selected track and must be rendered wherever the sound is credited.
 *
 * Only one preview plays at a time — a shared <audio> element is reused rather
 * than mounting one per row, so scrolling a long list doesn't spawn dozens of
 * media elements.
 */
export default function SoundPicker({ onSelect, onClose, selectedId = null }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')
  const [playing, setPlaying] = useState(null)
  const audioRef = useRef(null)
  const seq = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    // See GifPicker: StrictMode remounts, so alive must be re-armed here.
    alive.current = true
    // One audio element for the whole list.
    const el = new Audio()
    el.preload = 'none'
    el.addEventListener('ended', () => setPlaying(null))
    el.addEventListener('error', () => setPlaying(null))
    audioRef.current = el
    return () => {
      alive.current = false
      el.pause()
      el.src = ''
    }
  }, [])

  useEffect(() => {
    const mine = ++seq.current
    setState('loading')
    const t = setTimeout(async () => {
      const res = await media.sounds(q)
      if (!alive.current || mine !== seq.current) return
      setItems(res.items || [])
      setState(res.remote === false ? 'offline' : 'ready')
    }, q ? 320 : 0)
    return () => clearTimeout(t)
  }, [q])

  const toggle = (s) => {
    const el = audioRef.current
    if (!el || !s.url) return
    haptic('light')
    if (playing === s.id) {
      el.pause()
      setPlaying(null)
      return
    }
    el.src = s.url
    el.currentTime = 0
    el.play().then(() => setPlaying(s.id)).catch(() => setPlaying(null))
  }

  const choose = (s) => {
    haptic('medium')
    audioRef.current?.pause()
    setPlaying(null)
    onSelect?.(s)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-1 pb-3 flex items-center gap-2.5">
        <div className="flex-1">
          <Input icon="search" placeholder="Search sounds" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {onClose && (
          <button onClick={onClose} className="hit-expand shrink-0 text-[14px] font-medium muted px-1">
            Cancel
          </button>
        )}
      </div>

      {!q && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
          {MOODS.map((m) => <Chip key={m} size="sm" onClick={() => setQ(m)}>{m}</Chip>)}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pb-4">
        {state === 'loading' && (
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl elev animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded elev animate-pulse w-1/2" />
                  <div className="h-2.5 rounded elev animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state === 'offline' && (
          <EmptyState
            icon="music"
            title="Sound library unavailable"
            description="We couldn't reach the music library. You can still post without a sound."
          />
        )}

        {state === 'ready' && items.length === 0 && (
          <EmptyState icon="search" title="No sounds found" description={`Nothing matched "${q}".`} />
        )}

        {state === 'ready' && items.map((s, i) => {
          const active = selectedId === s.id
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.25), duration: 0.24 }}
              className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-2xl ${active ? 'bg-brand-500/10' : ''}`}
            >
              <button
                onClick={() => toggle(s)}
                disabled={!s.url}
                aria-label={playing === s.id ? `Pause ${s.title}` : `Play ${s.title}`}
                className="relative w-12 h-12 rounded-xl overflow-hidden elev shrink-0 grid place-items-center disabled:opacity-60"
              >
                {s.thumbnail && (
                  <SmartImage src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
                <span className="relative grid place-items-center w-7 h-7 rounded-full bg-black/55 text-white">
                  <Icon name={playing === s.id ? 'pause' : 'play'} size={13} />
                </span>
              </button>

              <button onClick={() => choose(s)} className="flex-1 min-w-0 text-left">
                <span className="block text-[14px] font-medium truncate">{s.title}</span>
                <span className="block text-[12px] muted truncate">
                  {s.artist}{s.duration ? ` · ${fmt(s.duration)}` : ''}
                </span>
              </button>

              <button
                onClick={() => choose(s)}
                className={`hit-expand shrink-0 text-[12.5px] font-semibold px-3 py-1.5 rounded-full ${
                  active ? 'brand-fill text-white' : 'elev'
                }`}
              >
                {active ? 'Added' : 'Use'}
              </button>
            </motion.div>
          )
        })}
      </div>

      {state === 'ready' && items.length > 0 && (
        <p className="px-4 pb-2 text-[10.5px] muted text-center">
          Creative Commons audio via Openverse · artists credited on your post
        </p>
      )}
    </div>
  )
}
