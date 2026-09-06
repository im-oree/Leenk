import Page from '../components/Page'
import { Loading, ErrorBox, Empty } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

export default function Audit() {
  const { data, error, loading, retry } = useAsync(() => api.audit(), [])

  if (loading) return <Page title="Audit log"><Loading /></Page>
  if (error) return <Page title="Audit log"><ErrorBox error={error} onRetry={retry} /></Page>

  const rows = data?.entries || []
  if (!rows.length) {
    return <Page title="Audit log"><Empty title="No entries yet" hint="Every admin action is recorded here." /></Page>
  }

  return (
    <Page title="Audit log" subtitle="Append-only record of every administrative action.">
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-700 text-zinc-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">When</th>
              <th className="text-left px-4 py-2.5 font-medium">Action</th>
              <th className="text-left px-4 py-2.5 font-medium">Target</th>
              <th className="text-left px-4 py-2.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.id || i} className="border-t border-ink-600">
                <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                  {e.at ? new Date(e.at).toLocaleString() : '\u2014'}
                </td>
                <td className="px-4 py-2.5 font-medium">{e.action}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{e.target || '\u2014'}</td>
                <td className="px-4 py-2.5 text-zinc-400">{e.note || '\u2014'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  )
}
