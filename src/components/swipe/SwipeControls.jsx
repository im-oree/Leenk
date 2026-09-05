import { motion } from 'framer-motion'
import Icon from '../ui/Icon'
import { haptic } from '../../lib/haptics'

const btn = 'grid place-items-center rounded-full border transition-colors duration-200 shrink-0'

function Ctrl({ icon, size, tone, onClick, disabled, label, count }) {
  const styles = {
    undo: 'border-[color:var(--app-border)] surface text-amber-500',
    pass: 'border-[color:var(--app-border)] surface text-rose-500',
    super: 'border-[color:var(--app-border)] surface text-sky-500',
    like: 'border-transparent brand-fill text-white shadow-glow',
    boost: 'border-[color:var(--app-border)] surface text-violet-500',
  }
  return (
    <motion.button
      aria-label={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.86 }}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 600, damping: 24 }}
      onClick={() => { if (disabled) return; haptic(tone === 'like' ? 'medium' : 'light'); onClick?.() }}
      style={{ width: size, height: size }}
      className={`relative ${btn} ${styles[tone]} ${disabled ? 'opacity-35' : ''}`}
    >
      <Icon name={icon} size={size * 0.44} strokeWidth={tone === 'like' ? 2 : 1.8} filled={tone === 'like'} />
      {count != null && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full surface border hairline text-[10px] font-semibold grid place-items-center">
          {count}
        </span>
      )}
    </motion.button>
  )
}

export default function SwipeControls({ onUndo, onPass, onSuper, onLike, onBoost, undosLeft = 0, superLeft = 0, disabled }) {
  return (
    <div className="flex items-center justify-center gap-3.5 px-6">
      <Ctrl icon="undo" size={46} tone="undo" label="Undo last swipe" onClick={onUndo} disabled={disabled || undosLeft <= 0} count={undosLeft} />
      <Ctrl icon="x" size={62} tone="pass" label="Pass" onClick={onPass} disabled={disabled} />
      <Ctrl icon="star" size={50} tone="super" label="Super like" onClick={onSuper} disabled={disabled || superLeft <= 0} count={superLeft} />
      <Ctrl icon="heart" size={62} tone="like" label="Like" onClick={onLike} disabled={disabled} />
      <Ctrl icon="bolt" size={46} tone="boost" label="Boost" onClick={onBoost} disabled={disabled} />
    </div>
  )
}
