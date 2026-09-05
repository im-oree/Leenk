export default function Section({ title, action, children, className = '', flush = false }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="flex items-end justify-between px-5 mb-2.5">
          {title && <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.08em] muted">{title}</h2>}
          {action}
        </div>
      )}
      <div className={flush ? '' : 'mx-4 surface rounded-3xl overflow-hidden divide-y divide-[color:var(--app-border)]'}>
        {children}
      </div>
    </section>
  )
}
