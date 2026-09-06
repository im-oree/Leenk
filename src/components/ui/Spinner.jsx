export default function Spinner({ size = 18, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}
