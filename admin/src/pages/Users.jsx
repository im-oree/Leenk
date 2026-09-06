import { useState } from 'react'
import Page from '../components/Page'
import { Loading, ErrorBox, Empty } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

export default function Users() {
  const [q, setQ] = useState('')
  const [active, setActive] = useState('')
  const { data, error, loading, retry } = useAsync(() => api.users(active), [active])
  const [busy, setBusy] = useState(false)

  const act = async (uid, action) => {
    const reason = window.prompt(`Reason for "${action}"? (recorded in the audit log)`)
    if (reason === null) return
    setBusy(true)
    try { await api.userAction(uid, action, reason); await retry() } finally { setBusy(false) }
  }

  const users = data?.users || []

  return (
    <Page title="Users" subtitle="Search, inspect, and action accounts.">
      <form
        onSubmit={(e) => { e.preventDefault(); setActive(q.trim()) }}
        className="flex gap-2 mb-4"
      >
        <input
          className="input flex-1"
          placeholder="Search by name, phone, matric or uid"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-primary" type="submit">Search</button>
      </form>

      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={retry} />}
      {!loading && !error && !users.length && (
        <Empty title="No users found" hint="Try a different search term." />
      )}

      {!loading && !error && users.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-700 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Campus</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Trust</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid} className="border-t border-ink-600">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">{u.uid}</p>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{u.campusId || '\u2014'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`chip ${
                      u.status === 'banned' ? 'bg-red-950 text-red-300'
                      : u.verificationStatus === 'verified' ? 'bg-emerald-950 text-emerald-300'
                      : 'bg-amber-950 text-amber-300'}`}>
                      {u.status === 'banned' ? 'banned' : u.verificationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-400">{u.trustScore ?? '\u2014'}</td>
                  <td className="px-4 py-2.5 text-right space-x-1.5">
                    <button disabled={busy} onClick={() => act(u.uid, 'suspend')} className="btn-ghost">Suspend</button>
                    <button disabled={busy} onClick={() => act(u.uid, 'ban')} className="btn bg-red-700 hover:bg-red-600 text-white">Ban</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
