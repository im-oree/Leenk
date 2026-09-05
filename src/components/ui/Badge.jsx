import Icon from './Icon'

const tones = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  neutral: 'elev muted',
  success: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  warn: 'bg-amber-500/14 text-amber-600 dark:text-amber-400',
  danger: 'bg-red-500/12 text-red-500',
  outline: 'border border-[color:var(--app-border)] muted',
}

export default function Badge({ children, tone = 'neutral', icon, size = 'md', className = '' }) {
  const s = size === 'sm' ? 'text-[11px] px-2 py-[3px] gap-1' : 'text-[12.5px] px-2.5 py-1 gap-1.5'
  return (
    <span className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${tones[tone]} ${s} ${className}`}>
      {icon && <Icon name={icon} size={size === 'sm' ? 11 : 13} strokeWidth={2} />}
      {children}
    </span>
  )
}

export function VerifiedBadge({ size = 'md' }) {
  return <Badge tone="brand" icon="badge" size={size}>Verified student</Badge>
}
