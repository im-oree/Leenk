import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Input from '../ui/Input'
import Chip from '../ui/Chip'
import Icon from '../ui/Icon'
import SmartImage from '../ui/SmartImage'
import EmptyState from '../ui/EmptyState'
import { media } from '../../lib/data'
import { haptic } from '../../lib/haptics'

const SUGGESTIONS = ['excited', 'laughing', 'love', 'shocked', 'dancing', 'shy', 'wave', 'celebrate']

/**
 * GIF search + picker.
 *
 * Two-column masonry so mixed aspect ratios don't leave gaps. We render the
 * small `preview` in the grid and only hand the caller the heavy `full` asset
 * on selection — on Nigerian mobile data, loading full-size GIFs into a grid
 * would burn megabytes per scroll.
 *
 * `remote:false` from the data layer means the provider is down or unkeyed;
 * we say so plainly instead of showing an empty grid that reads as a bug.
 */
export default function GifPicker({ onSelect, onClose, autoFocus = true }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading') // loading | ready | offline
  const seq = useRef(0)
  const alive = useRef(true)

  // MUST set alive=true on mount, not just false on unmount: React StrictMode
  // mounts -> unmounts -> remounts in dev, and a cleanup-only ref stays false
  // forever after the first unmount, so every result gets discarded and the
  // grid never leaves its loading state.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    const mine = ++seq.current
    setState('loading')
    // Debounce typing; trending (empty q) loads immediately.
    const t = setTimeout(async () => {
      const res = await media.gifs(q)
      // Ignore out-of-order responses from earlier keystrokes.
      if (!alive.current || mine !== seq.current) return
      setItems(res.items || [])
      setState(res.remote === false ? 'offline' : 'ready')
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [q])

  // Split into two balanced columns by running height, so neither column runs
  // far longer than the other.
  const columns = useMemo(() => {
    const cols = [[], []]
    const heights = [0, 0]
    for (const g of items) {
      const ratio = (g.preview?.height || 1) / (g.preview?.width || 1)
      const i = heights[0] <= heights[1] ? 0 : 1
      cols[i].push(g)
      heights[i] += ratio
    }
    return cols
  }, [items])

  const pick = (g) => {
    haptic('light')
    onSelect?.({
      kind: 'gif',
      url: g.full?.url || g.preview?.url,
      width: g.full?.width,
      height: g.full?.height,
      description: g.description,
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-1 pb-3 flex items-center gap-2.5">
        <div className="flex-1">
          <Input
            icon="search"
            placeholder="Search GIFs"
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {onClose && (
          <button onClick={onClose} className="hit-expand shrink-0 text-[14px] font-medium muted px-1">
            Cancel
          </button>
        )}
      </div>

      {!q && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} size="sm" onClick={() => setQ(s)}>{s}</Chip>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-4">
        {state === 'loading' && (
          <div className="flex gap-2.5">
            {[0, 1].map((c) => (
              <div key={c} className="flex-1 flex flex-col gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl2 elev animate-pulse"
                    style={{ height: 90 + ((i + c) % 3) * 42 }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {state === 'offline' && (
          <EmptyState
            icon="sticker"
            title="GIF search is unavailable"
            description="We couldn't reach the GIF provider. Check your connection, or send a photo instead."
          />
        )}

        {state === 'ready' && items.length === 0 && (
          <EmptyState icon="search" title="No GIFs found" description={`Nothing matched "${q}".`} />
        )}

        {state === 'ready' && items.length > 0 && (
          <div className="flex gap-2.5">
            {columns.map((col, ci) => (
              <div key={ci} className="flex-1 flex flex-col gap-2.5">
                {col.map((g, i) => (
                  <motion.button
                    key={g.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.22 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => pick(g)}
                    aria-label={g.description || 'GIF'}
                    className="relative block w-full rounded-xl2 overflow-hidden elev"
                    style={{ aspectRatio: `${g.preview?.width || 4} / ${g.preview?.height || 3}` }}
                  >
                    <SmartImage
                      src={g.preview?.url}
                      alt={g.description || 'GIF'}
                      className="w-full h-full object-cover"
                    />
                  </motion.button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider attribution is a licensing requirement for GIF APIs. */}
      {state === 'ready' && items.length > 0 && (
        <p className="px-4 pb-2 text-[10.5px] muted text-center">Powered by Klipy</p>
      )}
    </div>
  )
}
