import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import { haptic } from '../../lib/haptics'
import Icon from './Icon'
import Spinner from './Spinner'

const variants = {
  primary:
    'brand-fill text-white shadow-glow disabled:opacity-40 disabled:shadow-none',
  secondary:
    'surface text-[color:var(--app-text)] hover:elev',
  ghost:
    'bg-transparent text-[color:var(--app-text)] hover:bg-[color:var(--app-elev)]',
  soft:
    'bg-brand-500/10 text-brand-600 dark:text-brand-300 hover:bg-brand-500/15',
  danger:
    'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/15',
  outline:
    'bg-transparent border border-[color:var(--app-border)] text-[color:var(--app-text)] hover:elev',
}

const sizes = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-4.5 text-[14.5px] rounded-2xl gap-2',
  lg: 'h-[54px] px-6 text-[15.5px] rounded-2xl gap-2',
}

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    full = false,
    className = '',
    onClick,
    hapticKind = 'light',
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.965 }}
      transition={{ type: 'spring', stiffness: 620, damping: 34 }}
      onClick={(e) => {
        if (disabled || loading) return
        haptic(hapticKind)
        onClick?.(e)
      }}
      disabled={disabled || loading}
      className={[
        'relative inline-flex items-center justify-center font-medium select-none',
        'transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 14 : 18} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
          {children && <span className="truncate">{children}</span>}
          {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
        </>
      )}
    </motion.button>
  )
})

export default Button
