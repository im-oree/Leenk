import { motion } from 'framer-motion'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import { haptic } from '../../lib/haptics'

export default function StoryRail({ stories, onOpen, onAdd }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto no-scrollbar px-4 py-3">
      {stories.map((s, i) => (
        <motion.button
          key={s.id}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.035, 0.3), duration: 0.32 }}
          whileTap={{ scale: 0.93 }}
          onClick={() => { haptic('light'); s.mine ? onAdd?.() : onOpen?.(s) }}
          className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]"
        >
          <span className="relative">
            <span
              className={`block rounded-full p-[2.5px] ${
                s.mine ? 'bg-[color:var(--app-border)]' : s.seen ? 'bg-[color:var(--app-border)]' : 'brand-fill'
              }`}
            >
              <span className="block rounded-full p-[2px] bg-[color:var(--app-bg)]">
                <Avatar src={s.author.photos[0]} name={s.author.name} size={54} />
              </span>
            </span>
            {s.mine && (
              <span className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full brand-fill grid place-items-center border-2" style={{ borderColor: 'var(--app-bg)' }}>
                <Icon name="plus" size={12} strokeWidth={2.6} className="text-white" />
              </span>
            )}
          </span>
          <span className="text-[11.5px] muted truncate w-full text-center leading-tight">{s.author.name}</span>
        </motion.button>
      ))}
    </div>
  )
}
