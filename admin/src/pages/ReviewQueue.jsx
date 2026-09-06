import { useState } from 'react'
import Page from '../components/Page'
import { Loading, ErrorBox, Empty } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

/**
 * Verification review.
 *
 * The on-device pre-screen and the server re-check both feed in here as
 * ADVICE. Neither can approve anyone on its own -- the whole point of this
 * screen is that a human makes the call, with the machine's reasoning shown
 * so it can be argued with rather than obeyed.
 */
export default function ReviewQueue() {
  const { data, error, loading, retry } = useAsync(() => api.reviewQueue(), [])
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState('')

  const decide = async (id, decision) => {
    setBusy(id)
    try { await api.decide(id, decision, note); setNote(''); await retry() }
    finally { setBusy(null) }
  }

  if (loading) return <Page title="Verification queue"><Loading /></Page>
  if (error) return <Page title="Verification queue"><ErrorBox error={error} onRetry={retry} /></Page>

  const items = data?.queue || []
  if (!items.length) {
    return (
      <Page title="Verification queue">
        <Empty title="Nothing waiting" hint="Submissions needing a human decision appear here." />
      </Page>
    )
  }

  return (
    <Page
      title="Verification queue"
      subtitle={`${items.length} awaiting a decision. Machine scores are advisory.`}
    >
      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.recordId} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-sm">{r.name || r.uid}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {r.method} \u00b7 submitted {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'recently'}
                </p>
              </div>
              <span className={`chip ${
                r.serverScore >= 0.8 ? 'bg-emerald-950 text-emerald-300'
                : r.serverScore >= 0.5 ? 'bg-amber-950 text-amber-300'
                : 'bg-red-950 text-red-300'}`}>
                score {typeof r.serverScore === 'number' ? r.serverScore.toFixed(2) : '\u2014'}
              </span>
            </div>

            {(r.flags?.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {r.flags.map((f) => (
                  <span key={f} className="chip bg-ink-700 text-amber-300">{f}</span>
                ))}
              </div>
            )}

            {r.fields?.matric && (
              <p className="text-xs text-zinc-400 mt-2.5">
                Card matric <span className="font-mono text-zinc-200">{r.fields.matric}</span>
                {r.accountMatric && (
                  <> \u00b7 on file <span className="font-mono text-zinc-200">{r.accountMatric}</span></>
                )}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <input
                className="input flex-1"
                placeholder="Note (recorded in the audit log)"
                value={busy === r.recordId ? note : undefined}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                disabled={busy === r.recordId}
                onClick={() => decide(r.recordId, 'verified')}
                className="btn bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Approve
              </button>
              <button
                disabled={busy === r.recordId}
                onClick={() => decide(r.recordId, 'rejected')}
                className="btn bg-red-700 hover:bg-red-600 text-white"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </Page>
  )
}
