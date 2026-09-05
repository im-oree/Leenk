import { useState, forwardRef, useId } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from './Icon'

const Input = forwardRef(function Input(
  { label, hint, error, icon, type = 'text', suffix, className = '', containerClassName = '', ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const [reveal, setReveal] = useState(false)
  const id = useId()
  const isPass = type === 'password'
  const inputType = isPass ? (reveal ? 'text' : 'password') : type

  return (
    <div className={`w-full ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium muted mb-1.5 ml-1">
          {label}
        </label>
      )}
      <div
        className={[
          'relative flex items-center rounded-2xl border transition-all duration-200',
          'bg-[color:var(--app-elev)]',
          error
            ? 'border-red-500/60'
            : focused
              ? 'border-brand-500/70 ring-brand-soft'
              : 'border-[color:var(--app-border)]',
        ].join(' ')}
      >
        {icon && <Icon name={icon} size={18} className="ml-3.5 shrink-0 muted" />}
        <input
          id={id}
          ref={ref}
          type={inputType}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
          className={`w-full bg-transparent outline-none py-3.5 px-4 text-[15px] placeholder:text-[color:var(--app-muted)] placeholder:opacity-70 ${icon ? 'pl-2.5' : ''} ${className}`}
          {...rest}
        />
        {isPass && (
          <button type="button" onClick={() => setReveal((r) => !r)} className="px-3.5 muted" aria-label={reveal ? 'Hide' : 'Show'}>
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
        {suffix && <span className="pr-4 text-[13px] muted shrink-0">{suffix}</span>}
      </div>
      <AnimatePresence initial={false}>
        {(error || hint) && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`text-[12.5px] mt-1.5 ml-1 ${error ? 'text-red-500' : 'muted'}`}
          >
            {error || hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
})

export default Input
