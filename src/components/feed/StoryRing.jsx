import { motion } from 'framer-motion'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { haptic } from '../../lib/haptics'

/**
 * Instagram-style story ring around an avatar.
 *
 * Three states:
 *   unseen  → brand gradient ring
 *   seen    → flat border ring
 *   none    → no ring at all (renders a plain Avatar)
 *
 * The gap between ring and photo is a real inset in the page background
 * colour, so it reads correctly on both themes without a hardcoded white.
 */
export default function StoryRing({
  src,
  name,
  size = 54,
  hasStory = false,
  hasUnseen = false,
  isMe = false,
  verified = false,
  onClick,
  showAdd = false,
  className = '',
  ...rest
}) {
  const px = typeof size === 'number' ? size : 54

  if (!hasStory && !showAdd) {
    return <Avatar src={src} name={name} size={px} verified={verified} className={className} {...rest} />
  }

  const ringClass = hasUnseen
    ? 'brand-fill'
    : 'bg-[color:var(--app-border)]'

  return (
    <motion.button
      type="button"
      whileTap={onClick ? { scale: 0.93 } : undefined}
      transition={{ type: 'spring', stiffness: 620, damping: 30 }}
      onClick={onClick ? (e) => { haptic('light'); onClick(e) } : undefined}
      aria-label={
        isMe ? (hasStory ? 'Your story' : 'Add to your story')
             : `${name}'s story${hasUnseen ? ', unseen' : ''}`
      }
      className={`relative shrink-0 rounded-full ${onClick ? '' : 'pointer-events-none'} ${className}`}
      {...rest}
    >
      {/* outer ring */}
      <span className={`block rounded-full p-[2.5px] ${ringClass}`}>
        {/* background gap */}
        <span className="block rounded-full p-[2px] bg-[color:var(--app-bg)]">
          <Avatar src={src} name={name} size={px} />
        </span>
      </span>

      {/* add badge for your own empty story */}
      {isMe && showAdd && !hasStory && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full brand-fill grid place-items-center border-2"
          style={{ width: px * 0.36, height: px * 0.36, borderColor: 'var(--app-bg)' }}
        >
          <Icon name="plus" size={px * 0.2} className="text-white" strokeWidth={3} />
        </span>
      )}

      {verified && !(isMe && showAdd && !hasStory) && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full brand-fill text-white grid place-items-center border-2"
          style={{ width: px * 0.32, height: px * 0.32, borderColor: 'var(--app-bg)' }}
        >
          <Icon name="check" size={px * 0.17} strokeWidth={3.2} />
        </span>
      )}
    </motion.button>
  )
}
