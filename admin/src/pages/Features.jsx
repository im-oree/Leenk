import { useState, useEffect } from 'react'
import Page from '../components/Page'
import { Loading, ErrorBox } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40
        ${on ? 'bg-brand-500' : 'bg-ink-600'}`}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  )
}

export default function Features() {
  const { data, error, loading, retry } = useAsync(() => api.config(), [])
  const [flags, setFlags] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (data?.config?.features) setFlags(data.config.features) }, [data])

  const flip = async (key, value) => {
    const next = { ...flags, [key]: value }
    setFlags(next)
    setSaving(true)
    try { await api.features({ [key]: value }) } finally { setSaving(false) }
  }

  if (loading) return <Page title="Features"><Loading /></Page>
  if (error) return <Page title="Features"><ErrorBox error={error} onRetry={retry} /></Page>

  const entries = Object.entries(flags)

  return (
    <Page
      title="Features"
      subtitle="Kill switches. Changes apply within the config cache window (60s)."
    >
      <div className="card divide-y divide-ink-600">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">features.{key}</p>
            </div>
            <Toggle on={Boolean(value)} onChange={(v) => flip(key, v)} disabled={saving} />
          </div>
        ))}
        {!entries.length && <p className="p-6 text-sm text-zinc-500">No feature flags exposed.</p>}
      </div>
    </Page>
  )
}
