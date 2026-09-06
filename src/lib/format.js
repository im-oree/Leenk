export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clockTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function ageFromDate(iso) {
  if (!iso) return null
  const b = new Date(iso)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a
}

export const initials = (name = '') =>
  name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
