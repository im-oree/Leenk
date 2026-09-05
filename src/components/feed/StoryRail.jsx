import { motion } from 'framer-motion'
import StoryRing from './StoryRing'

/**
 * Story rail.
 *
 * Consumes the API's rail shape directly (one entry per author, unseen first):
 *   { authorUid, name, avatar, verified, isMe, hasUnseen, count, items[] }
 *
 * Skeletons render while loading so the row doesn't pop in and shift the feed.
 */
export default function StoryRail({ rail = [], loading = false, onOpen, onAdd }) {
  if (loading && !rail.length) {
    return (
      <div className="flex gap-3.5 overflow-hidden px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]">
            <div className="w-[60px] h-[60px] rounded-full skeleton" />
            <div className="w-10 h-2 rounded-full skeleton" />
          </div>
        ))}
      </div>
    )
  }

  if (!rail.length) return null

  return (
    <div className="flex gap-3.5 overflow-x-auto no-scrollbar px-4 py-3">
      {rail.map((s, i) => (
        <motion.div
          key={s.authorUid}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.035, 0.3), duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]"
        >
          <StoryRing
            src={s.avatar}
            name={s.name}
            size={54}
            hasStory={s.count > 0}
            hasUnseen={s.hasUnseen}
            isMe={s.isMe}
            showAdd={s.isMe}
            onClick={() => (s.isMe && !s.count ? onAdd?.() : onOpen?.(s))}
          />
          <span className="text-[11.5px] muted truncate w-full text-center leading-tight">
            {s.isMe ? 'Your story' : s.name}
          </span>
        </motion.div>
      ))}
    </div>
  )
}
