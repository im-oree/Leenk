import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

/**
 * Progressive image.
 *
 * Paints a cheap placeholder immediately, then crossfades to the real image
 * once it has decoded — so the user never sees a blank rectangle, and the
 * layout never jumps.
 *
 * Placeholder priority:
 *   1. `blurhash`/`thumb` (tiny, from the media pipeline)
 *   2. a flat colour derived from the src, so even with nothing cached the
 *      box has a sensible tone rather than grey
 *
 * Uses `decode()` rather than the `load` event so the swap happens when the
 * frame can actually be painted — this is what stops the flash on slow phones.
 */

const hueFrom = (s = '') => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export default function SmartImage({
  src,
  thumb,
  alt = '',
  className = '',
  imgClassName = '',
  rounded = '',
  eager = false,
  aspect,
  onLoad,
  fallback,
  ...rest
}) {
  const [state, setState] = useState('loading') // loading | ready | error
  const [showThumb, setShowThumb] = useState(true)
  const imgRef = useRef(null)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    if (!src) return
    setState('loading')
    setShowThumb(true)

    let cancelled = false
    const img = new Image()
    img.src = src
    img.decoding = 'async'

    const finish = () => {
      if (cancelled || !mounted.current) return
      setState('ready')
      // Hold the thumb one frame longer so the crossfade has something under it.
      requestAnimationFrame(() => setTimeout(() => mounted.current && setShowThumb(false), 260))
      onLoad?.()
    }

    if (img.decode) {
      img.decode().then(finish).catch(() => {
        // decode() rejects on some CORS/SVG cases where the image is still fine
        img.onload = finish
        img.onerror = () => !cancelled && mounted.current && setState('error')
      })
    } else {
      img.onload = finish
      img.onerror = () => !cancelled && mounted.current && setState('error')
    }

    return () => { cancelled = true }
  }, [src, onLoad])

  const hue = hueFrom(src || alt)

  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {/* Placeholder layer */}
      {showThumb && (
        <div className="absolute inset-0">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              aria-hidden
              className="w-full h-full object-cover scale-110 blur-xl"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, hsl(${hue} 22% 88%), hsl(${(hue + 40) % 360} 18% 78%))` }}
            />
          )}
        </div>
      )}

      {/* Real image */}
      {state !== 'error' && src && (
        <motion.img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: state === 'ready' ? 1 : 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`relative w-full h-full object-cover ${imgClassName}`}
          {...rest}
        />
      )}

      {/* Error state — never a broken-image glyph */}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center elev">
          {fallback || (
            <span className="text-[12px] muted px-3 text-center">Couldn’t load image</span>
          )}
        </div>
      )}
    </div>
  )
}
