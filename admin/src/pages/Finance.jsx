import { useState, useEffect } from 'react'
import Page from '../components/Page'
import { Loading, ErrorBox } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

/** Kobo <-> naira. Paystack works in kobo; humans do not. */
const toNaira = (kobo) => (Number(kobo) || 0) / 100
const toKobo = (naira) => Math.round((Number(naira) || 0) * 100)

export default function Finance() {
  const { data, error, loading, retry } = useAsync(() => api.config(), [])
  const [plans, setPlans] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const p = data?.config?.payments?.plans
    if (p) setPlans(p.map((x) => ({ ...x })))
  }, [data])

  const edit = (i, field, value) => {
    setPlans((prev) => prev.map((p, j) => (j === i ? { ...p, [field]: value } : p)))
    setDirty(true); setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.saveConfig('payments', { plans })
      setDirty(false); setSaved(true)
      await retry()
    } finally { setSaving(false) }
  }

  if (loading) return <Page title="Finance & pricing"><Loading /></Page>
  if (error) return <Page title="Finance & pricing"><ErrorBox error={error} onRetry={retry} /></Page>

  const pay = data?.config?.payments || {}

  return (
    <Page
      title="Finance & pricing"
      subtitle="Prices are stored in the database and take effect immediately \u2014 no redeploy."
      actions={
        <button onClick={save} disabled={!dirty || saving} className="btn-primary">
          {saving ? 'Saving\u2026' : saved ? 'Saved' : 'Save changes'}
        </button>
      }
    >
      <div className="card p-4 mb-4">
        <p className="text-sm font-medium mb-3">Provider</p>
        <dl className="text-xs text-zinc-400 grid grid-cols-2 gap-y-2">
          <dt>Active provider</dt><dd className="text-zinc-200">{pay.provider || '\u2014'}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`chip ${pay.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-ink-700 text-zinc-400'}`}>
              {pay.enabled ? 'live' : 'disabled'}
            </span>
          </dd>
          <dt>Currency</dt><dd className="text-zinc-200">{pay.currency || 'NGN'}</dd>
        </dl>
        <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
          Secret keys are never returned by the API and cannot be read here.
          Set them as environment variables on the backend.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-700 text-zinc-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Plan</th>
              <th className="text-left px-4 py-2.5 font-medium">Price (\u20a6)</th>
              <th className="text-left px-4 py-2.5 font-medium">Months</th>
              <th className="text-left px-4 py-2.5 font-medium">Stored (kobo)</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, i) => (
              <tr key={p.id} className="border-t border-ink-600">
                <td className="px-4 py-2.5 font-medium">{p.label || p.id}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    className="input w-32"
                    value={toNaira(p.amount)}
                    onChange={(e) => edit(i, 'amount', toKobo(e.target.value))}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    min="1"
                    className="input w-20"
                    value={p.months ?? 1}
                    onChange={(e) => edit(i, 'months', Number(e.target.value))}
                  />
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500 tabular-nums">{p.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
        Changing a price does not affect anyone mid-cycle. Existing entitlements
        run to their expiry at the price already paid.
      </p>
    </Page>
  )
}
