export function Loading({ label = 'Loading\u2026' }) {
  return <div className="card p-8 text-center text-sm text-zinc-500">{label}</div>
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="card p-5 border-red-900/60 bg-red-950/20">
      <p className="text-sm text-red-300">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-3">Try again</button>}
    </div>
  )
}

export function Empty({ title, hint }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint && <p className="text-xs text-zinc-500 mt-1.5">{hint}</p>}
    </div>
  )
}
