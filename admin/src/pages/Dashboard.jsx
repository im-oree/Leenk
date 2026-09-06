import Page from '../components/Page'
import { Loading, ErrorBox } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

function Stat({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1.5">{value ?? '\u2014'}</p>
      {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { data, error, loading, retry } = useAsync(() => api.health(), [])

  if (loading) return <Page title="Dashboard"><Loading /></Page>
  if (error) return <Page title="Dashboard"><ErrorBox error={error} onRetry={retry} /></Page>

  const s = data?.stats || {}
  return (
    <Page title="Dashboard" subtitle="Live counts from the Leenk API.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Users" value={s.users} />
        <Stat label="Pending review" value={s.pendingVerification} hint="Awaiting a decision" />
        <Stat label="Open reports" value={s.openReports} />
        <Stat label="Matches" value={s.matches} />
      </div>

      <div className="card p-4 mt-4">
        <p className="text-sm font-medium mb-2">Environment</p>
        <dl className="text-xs text-zinc-400 space-y-1.5">
          <div className="flex justify-between"><dt>Store</dt><dd>{data?.store || 'unknown'}</dd></div>
          <div className="flex justify-between"><dt>StudentHub</dt><dd>{data?.studentHub || 'unknown'}</dd></div>
          <div className="flex justify-between"><dt>Payments</dt><dd>{data?.payments || 'unknown'}</dd></div>
        </dl>
      </div>
    </Page>
  )
}
