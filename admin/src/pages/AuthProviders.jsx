import { useState, useEffect } from 'react'
import Page from '../components/Page'
import { Loading, ErrorBox } from '../components/State'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'

/**
 * Social login providers.
 *
 * Every provider is a slot: toggle it on, paste a client id, and the student
 * app shows the button. Only providers whose backend flow is implemented can
 * actually complete a sign-in -- the rest are scaffolded so adding one later
 * is configuration, not a release.
 *
 * Client SECRETS are never shown or sent from this console. They live in the
 * backend environment. This page holds public client ids only.
 */
const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    status: 'ready',
    note: 'Free. Shares the Firebase identity pool with StudentHub, so a student who already uses Google there resolves to the same person.',
  },
  {
    id: 'studenthub',
    label: 'Sign in with StudentHub',
    status: 'ready',
    note: 'OIDC + PKCE against the parent platform. Requires STUDENTHUB_ENABLED on the backend.',
  },
  {
    id: 'apple',
    label: 'Apple',
    status: 'scaffold',
    note: 'Required by App Store review if any other social login is offered. Needs a paid Apple Developer account.',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    status: 'scaffold',
    note: 'Login Kit requires app review and a registered organisation. No public self-serve tier.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    status: 'scaffold',
    note: 'Login Kit requires a registered business and app review before production scopes are granted.',
  },
]

export default function AuthProviders() {
  const { data, error, loading, retry } = useAsync(() => api.config(), [])
  const [cfg, setCfg] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data?.config?.auth) setCfg(data.config.auth) }, [data])

  const update = (id, patch) => {
    setCfg((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    try { await api.saveConfig('auth', cfg); setSaved(true); await retry() }
    finally { setSaving(false) }
  }

  if (loading) return <Page title="Login providers"><Loading /></Page>
  if (error) return <Page title="Login providers"><ErrorBox error={error} onRetry={retry} /></Page>

  return (
    <Page
      title="Login providers"
      subtitle="Toggle which sign-in buttons appear in the app."
      actions={
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving\u2026' : saved ? 'Saved' : 'Save'}
        </button>
      }
    >
      <div className="space-y-3">
        {PROVIDERS.map((p) => {
          const c = cfg[p.id] || {}
          return (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{p.label}</p>
                    <span className={`chip ${p.status === 'ready'
                      ? 'bg-emerald-950 text-emerald-300'
                      : 'bg-ink-700 text-zinc-400'}`}>
                      {p.status === 'ready' ? 'implemented' : 'not implemented'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-xl">{p.note}</p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(c.enabled)}
                  onClick={() => update(p.id, { enabled: !c.enabled })}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors
                    ${c.enabled ? 'bg-brand-500' : 'bg-ink-600'}`}
                >
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                        style={{ left: c.enabled ? 22 : 2 }} />
                </button>
              </div>

              {c.enabled && (
                <div className="mt-3 pt-3 border-t border-ink-600">
                  <label className="label">Client ID (public)</label>
                  <input
                    className="input font-mono text-xs"
                    value={c.clientId || ''}
                    placeholder="not set"
                    onChange={(e) => update(p.id, { clientId: e.target.value })}
                  />
                  <p className="text-[11px] text-zinc-600 mt-2">
                    The matching secret is read from the backend environment and is never
                    stored or displayed here.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Page>
  )
}
