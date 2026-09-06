export default function Page({ title, subtitle, actions, children }) {
  return (
    <div className="p-6 max-w-6xl">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}
