import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion'
import { useState, useCallback, useRef } from 'react'
import Icon from '../ui/Icon'
import Badge from '../ui/Badge'
import PhotoDots from './PhotoDots'
import SwipeHint from './SwipeHint'
import { campusById, intentLabel } from '../../lib/mock'
import { haptic } from '../../lib/haptics'
import { completeHint } from '../../lib/hints'
import { usePerf } from '../../lib/PerfContext'

const THRESHOLD = 110

export default function SwipeCard({ user, onSwipe, onOpen, isTop, index = 0 }) {
  const { flags } = usePerf()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const controls = useAnimation()
  const [photoIdx, setPhotoIdx] = useState(0)

  // Guards so a drag never registers as a tap (this was opening profiles mid-swipe)
  const dragging = useRef(false)
  const pointerStart = useRef({ x: 0, y: 0, t: 0 })

  const rotate = useTransform(x, [-260, 0, 260], [-13, 0, 13])
  const likeOpacity = useTransform(x, [30, 130], [0, 1])
  const nopeOpacity = useTransform(x, [-130, -30], [1, 0])
  const superOpacity = useTransform(y, [-130, -40], [1, 0])

  const campus = campusById(user.campusId)
  const photoCount = user.photos.length

  const fling = useCallback(
    async (dir) => {
      haptic(dir === 'super' ? 'success' : 'medium')
      const to =
        dir === 'right' ? { x: 620, y: -40, rotate: 18 }
        : dir === 'left' ? { x: -620, y: -40, rotate: -18 }
        : { y: -820, x: 0, rotate: 0 }
      await controls.start({ ...to, opacity: 0, transition: { duration: 0.34, ease: [0.32, 0, 0.67, 0] } })
      onSwipe?.(dir)
    },
    [controls, onSwipe],
  )

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info
    // release the flag on the next frame so the synthetic click is swallowed
    requestAnimationFrame(() => { dragging.current = false })

    if (offset.y < -140 && Math.abs(offset.x) < 90) return fling('super')
    if (offset.x > THRESHOLD || velocity.x > 780) return fling('right')
    if (offset.x < -THRESHOLD || velocity.x < -780) return fling('left')
    controls.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 34 } })
  }

  const step = (dir) => {
    setPhotoIdx((i) => {
      const nextI = Math.min(photoCount - 1, Math.max(0, i + dir))
      if (nextI !== i) {
        haptic('light')
        completeHint('photoSwipe') // they've got it — never hint again
      }
      return nextI
    })
  }

  /* ---- photo layer gestures: horizontal flick changes photo, tap opens ---- */
  const onPointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }

  const onPointerUp = (e) => {
    if (!isTop) return
    const dx = e.clientX - pointerStart.current.x
    const dy = e.clientY - pointerStart.current.y
    const dt = Date.now() - pointerStart.current.t
    const moved = Math.hypot(dx, dy)

    // A real tap: small movement, quick → open the full profile.
    if (moved < 12 && dt < 400 && !dragging.current) {
      onOpen?.(user)
    }
  }

  const depth = Math.min(index, 2)
  const stackStyle = isTop
    ? { scale: 1, y: 0, opacity: 1 }
    : { scale: 1 - depth * 0.04, y: depth * -12, opacity: depth < 2 ? 1 : 0.6 }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 20 - index, x: isTop ? x : 0, y: isTop ? y : 0, rotate: isTop ? rotate : 0 }}
      animate={isTop ? controls : stackStyle}
      initial={false}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      drag={isTop}
      dragElastic={0.55}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragStart={() => { dragging.current = true }}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileDrag={{ cursor: 'grabbing' }}
    >
      <div className={`relative w-full h-full rounded-[30px] overflow-hidden surface ${flags.shadows ? 'shadow-card' : ''} select-none`}>
        <img
          key={photoIdx}
          src={user.photos[photoIdx]}
          alt={user.name}
          draggable={false}
          loading={index > 1 ? 'lazy' : 'eager'}
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/12 to-black/22 pointer-events-none" />

        {/* Photo gesture layer — sits above the image, below the info block.
            A horizontal flick here pages photos instead of swiping the card. */}
        {isTop && photoCount > 1 && (
          <motion.div
            className="absolute inset-x-0 top-0 bottom-[186px] z-10"
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragStart={() => { dragging.current = true }}
            onDragEnd={(_, info) => {
              requestAnimationFrame(() => { dragging.current = false })
              if (info.offset.x < -45 || info.velocity.x < -420) step(1)
              else if (info.offset.x > 45 || info.velocity.x > 420) step(-1)
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        )}
        {isTop && photoCount <= 1 && (
          <div
            className="absolute inset-x-0 top-0 bottom-[186px] z-10"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          />
        )}

        {/* stamps */}
        {isTop && (
          <>
            <motion.div style={{ opacity: likeOpacity }} className="absolute top-16 left-6 z-20 pointer-events-none">
              <div className="border-[3px] border-emerald-400 text-emerald-400 rounded-2xl px-4 py-1.5 -rotate-12 font-display font-bold text-2xl tracking-wide">LIKE</div>
            </motion.div>
            <motion.div style={{ opacity: nopeOpacity }} className="absolute top-16 right-6 z-20 pointer-events-none">
              <div className="border-[3px] border-rose-400 text-rose-400 rounded-2xl px-4 py-1.5 rotate-12 font-display font-bold text-2xl tracking-wide">NOPE</div>
            </motion.div>
            <motion.div style={{ opacity: superOpacity }} className="absolute bottom-44 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="border-[3px] border-sky-400 text-sky-400 rounded-2xl px-4 py-1.5 font-display font-bold text-xl tracking-wide">SUPER</div>
            </motion.div>
          </>
        )}

        {/* transient swipe hint — 3 times per device, 3 different people, no arrows */}
        {isTop && photoCount > 1 && (
          <div className="absolute bottom-[196px] left-0 right-0 z-20 flex justify-center">
            <SwipeHint subjectId={user.uid} />
          </div>
        )}

        {/* info block — dots live in the lower section, right above the name */}
        <div className="absolute bottom-0 left-0 right-0 z-20 text-white">
          <div className="px-5 pb-2.5">
            <PhotoDots count={photoCount} index={photoIdx} onSelect={(i) => { haptic('light'); setPhotoIdx(i); completeHint('photoSwipe') }} />
          </div>

          <div className="px-5 pb-6 pointer-events-none">
            <div className="flex items-center gap-2 mb-2">
              <Badge tone="brand" icon="badge" size="sm" className="!bg-white/18 !text-white backdrop-blur-sm">Verified</Badge>
              <Badge size="sm" className="!bg-white/14 !text-white backdrop-blur-sm">{intentLabel(user.intent)}</Badge>
            </div>
            <h2 className="font-display text-[30px] font-semibold tracking-[-0.03em] leading-none flex items-center gap-2.5">
              {user.name}
              <span className="font-sans text-[24px] font-normal opacity-85">{user.age}</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-2 text-[13.5px] opacity-90">
              <Icon name="cap" size={15} />
              <span className="truncate">{campus.short} · {user.department}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[13px] opacity-75">
              <Icon name="pin" size={14} />
              <span>{user.distanceKm === 0 ? 'On your campus' : `${user.distanceKm} km away`}</span>
            </div>
            {user.prompts?.[0] && (
              <p className="mt-3 text-[14px] leading-snug opacity-95 line-clamp-2">
                <span className="font-curvy italic opacity-80">{user.prompts[0].q}: </span>
                {user.prompts[0].a}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
