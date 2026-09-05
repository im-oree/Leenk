import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { campusById } from '../../lib/mock'
import { haptic } from '../../lib/haptics'
import { timeAgo } from '../../lib/format'

export default function PostCard({ post, onLike, onComment, onOpenAuthor, onMore }) {
  const [burst, setBurst] = useState(false)
  const lastTap = useRef(0)
  const navigate = useNavigate()

  const like = (viaDouble = false) => {
    if (viaDouble && post.liked) return
    haptic('medium')
    onLike?.(post.id)
    if (viaDouble || !post.liked) {
      setBurst(true)
      setTimeout(() => setBurst(false), 620)
    }
  }

  const onMediaTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 280) like(true)
    lastTap.current = now
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onOpenAuthor?.(post.author)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Avatar src={post.author.photos[0]} name={post.author.name} size="md" verified={post.author.verified} />
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold truncate leading-tight">{post.author.name}</p>
            <p className="text-[12px] muted truncate leading-tight mt-0.5">
              {campusById(post.author.campusId).short} · {timeAgo(post.at)}
            </p>
          </div>
        </button>
        <button onClick={() => onMore?.(post)} className="p-2 -mr-1 muted" aria-label="More options">
          <Icon name="dots" size={20} />
        </button>
      </div>

      <div className="relative bg-[color:var(--app-elev)] overflow-hidden" onClick={onMediaTap}>
        <img
          src={post.media}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full aspect-square object-cover"
          draggable={false}
        />
        <AnimatePresence>
          {burst && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.62, times: [0, 0.4, 1] }}
              className="absolute inset-0 grid place-items-center pointer-events-none"
            >
              <Icon name="heart" size={110} filled className="text-white drop-shadow-lg" strokeWidth={0} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.82 }}
            onClick={() => like(false)}
            aria-label={post.liked ? 'Unlike' : 'Like'}
            className={`p-1.5 -ml-1.5 transition-colors ${post.liked ? 'text-brand-500' : ''}`}
          >
            <Icon name="heart" size={24} filled={post.liked} strokeWidth={1.8} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.82 }} onClick={() => onComment?.(post)} className="p-1.5" aria-label="Comments">
            <Icon name="comment" size={23} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.82 }} className="p-1.5" aria-label="Share">
            <Icon name="share" size={22} />
          </motion.button>
          <span className="flex-1" />
          <motion.button whileTap={{ scale: 0.82 }} className="p-1.5 -mr-1.5" aria-label="Save">
            <Icon name="bookmark" size={22} />
          </motion.button>
        </div>

        <p className="text-[13.5px] font-semibold mt-1.5 tabular-nums">{post.likes.toLocaleString()} likes</p>
        <p className="text-[14.5px] mt-1 leading-snug">
          <span className="font-semibold">{post.author.name}</span> <span className="opacity-90">{post.caption}</span>
        </p>
        {post.comments > 0 && (
          <button onClick={() => onComment?.(post)} className="text-[13.5px] muted mt-1.5">
            View all {post.comments} comments
          </button>
        )}
      </div>
    </motion.article>
  )
}
