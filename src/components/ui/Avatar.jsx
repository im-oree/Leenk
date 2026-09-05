import { useState } from 'react'
import Icon from './Icon'

const sizes = { xs: 28, sm: 36, md: 44, lg: 56, xl: 84, '2xl': 108 }

export default function Avatar({ src, name = '', size = 'md', ring = false, verified = false, online = false, className = '' }) {
  const px = typeof size === 'number' ? size : sizes[size]
  const [err, setErr] = useState(false)
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: px, height: px }}>
      <div
        className={`w-full h-full rounded-full overflow-hidden elev grid place-items-center ${ring ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-[color:var(--app-bg)]' : ''}`}
      >
        {src && !err ? (
          <img src={src} alt={name} onError={() => setErr(true)} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <span className="font-display font-semibold muted" style={{ fontSize: px * 0.36 }}>{initials || '?'}</span>
        )}
      </div>
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full brand-fill text-white grid place-items-center border-2"
          style={{ width: px * 0.34, height: px * 0.34, borderColor: 'var(--app-bg)' }}>
          <Icon name="check" size={px * 0.18} strokeWidth={3.2} />
        </span>
      )}
      {online && !verified && (
        <span className="absolute bottom-0 right-0 rounded-full bg-emerald-500 border-2"
          style={{ width: px * 0.26, height: px * 0.26, borderColor: 'var(--app-bg)' }} />
      )}
    </div>
  )
}
