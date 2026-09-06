import { useState } from 'react'
import { setKey, api } from '../lib/api'

export default function Login({ onAuthed }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    setKey(value.trim())
    try {
      await api.health()
      onAuthed()
    } catch (err) {
      setKey('')
      setError(err.status === 401 || err.status === 403
        ? 'That key was rejected.'
        : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="card p-6 w-full max-w-sm">
        <p className="font-semibold tracking-tight text-lg">Leenk <span className="text-brand-500">Admin</span></p>
        <p className="text-xs text-zinc-500 mt-1 mb-5">
          Internal console. Access is logged.
        </p>

        <label className="label" htmlFor="k">Admin key</label>
        <input
          id="k"
          type="password"
          autoComplete="off"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
        />

        {error && <p className="text-xs text-red-400 mt-2.5">{error}</p>}

        <button type="submit" disabled={!value.trim() || busy} className="btn-primary w-full mt-4">
          {busy ? 'Checking\u2026' : 'Continue'}
        </button>

        <p className="text-[11px] text-zinc-600 mt-4 leading-relaxed">
          The key is held in this tab only and cleared when you close it.
        </p>
      </form>
    </div>
  )
}
