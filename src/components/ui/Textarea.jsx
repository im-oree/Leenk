import { useState, useId } from 'react'

export default function Textarea({ label, hint, maxLength, value = '', onChange, rows = 4, className = '', ...rest }) {
  const [focused, setFocused] = useState(false)
  const id = useId()
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="block text-[13px] font-medium muted mb-1.5 ml-1">{label}</label>}
      <div className={`rounded-2xl border transition-all duration-200 bg-[color:var(--app-elev)] ${focused ? 'border-brand-500/70 ring-brand-soft' : 'border-[color:var(--app-border)]'}`}>
        <textarea
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full bg-transparent outline-none p-4 text-[15px] resize-none placeholder:text-[color:var(--app-muted)] placeholder:opacity-70 ${className}`}
          {...rest}
        />
        {maxLength && (
          <div className="flex justify-end px-4 pb-2.5 text-[11.5px] muted tabular-nums">
            {value.length}/{maxLength}
          </div>
        )}
      </div>
      {hint && <p className="text-[12.5px] mt-1.5 ml-1 muted">{hint}</p>}
    </div>
  )
}
