import { motion } from 'framer-motion'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import SmartImage from '../ui/SmartImage'
import { timeAgo } from '../../lib/format'

/**
 * A StudentHub post, rendered inline in the Leenk feed.
 *
 * Federation is read-only: these posts live on StudentHub and Leenk never
 * writes back. So this card deliberately has NO like button, NO comment
 * field and NO follow affordance. Showing a heart that silently does
 * nothing — or worse, that only "likes" locally — would be a lie about
 * where the content lives.
 *
 * It also has to be unmistakably not-a-Leenk-post at a glance, otherwise
 * users will wonder why they can't interact with it. Hence the tinted
 * surface, the source chip, and the muted footer line instead of the
 * usual action bar.
 */
export default function StudentHubPost({ post }) {
  const open = () => {
    if (post.sourceUrl) window.open(post.sourceUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2 px-3"
    >
      <div className="rounded-2xl border hairline bg-[color:var(--app-elev)] overflow-hidden">
        {/* Source line — says plainly where this came from. */}
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-[color:var(--app-surface)] border hairline text-[10.5px] font-semibold tracking-wide uppercase muted">
            <Icon name="school" size={11} />
            StudentHub
          </span>
          {post.kind && post.kind !== 'post' && (
            <span className="text-[10.5px] font-semibold uppercase tracking-wide brand-text">
              {post.kind}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[11.5px] muted tabular-nums">{timeAgo(post.createdAtMs)}</span>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 pb-2.5">
          <Avatar
            src={post.author?.photo}
            name={post.author?.name}
            size="sm"
            verified={post.author?.verified}
          />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold truncate leading-tight">
              {post.author?.name}
              {post.author?.official && (
                <span className="ml-1.5 text-[10.5px] font-semibold muted uppercase tracking-wide">
                  Official
                </span>
              )}
            </p>
          </div>
        </div>

        {post.caption && (
          <p className="px-3.5 pb-3 text-[14.5px] leading-snug whitespace-pre-wrap">
            {post.caption}
          </p>
        )}

        {post.mediaUrl && (
          <div className="bg-[color:var(--app-surface)]">
            <SmartImage
              src={post.mediaUrl}
              alt=""
              className="w-full max-h-[420px] object-cover"
            />
          </div>
        )}

        {/* No action bar. Counts are display-only, from StudentHub. */}
        <div className="flex items-center gap-3.5 px-3.5 py-2.5 text-[12px] muted">
          {post.likeCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon name="heart" size={13} /> {post.likeCount.toLocaleString()}
            </span>
          )}
          {post.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon name="comment" size={13} /> {post.commentCount.toLocaleString()}
            </span>
          )}
          <span className="flex-1" />
          {post.sourceUrl && (
            <button onClick={open} className="text-[12px] font-semibold brand-text">
              Open in StudentHub
            </button>
          )}
        </div>
      </div>
    </motion.article>
  )
}
