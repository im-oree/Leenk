import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { getKey, setKey, api } from './lib/api'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import ReviewQueue from './pages/ReviewQueue'
import Finance from './pages/Finance'
import Features from './pages/Features'
import AuthProviders from './pages/AuthProviders'
import Audit from './pages/Audit'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/review', label: 'Verification queue' },
  { to: '/users', label: 'Users' },
  { to: '/finance', label: 'Finance & pricing' },
  { to: '/features', label: 'Features' },
  { to: '/auth', label: 'Login providers' },
  { to: '/audit', label: 'Audit log' },
]

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getKey()))
  const navigate = useNavigate()

  // Validate the key on load: a stale sessionStorage entry should bounce to
  // login rather than leave every page showing an error.
  useEffect(() => {
    if (!authed) return
    api.health().catch((e) => {
      if (e.status === 401 || e.status === 403) { setKey(''); setAuthed(false) }
    })
  }, [authed])

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />

  const signOut = () => { setKey(''); setAuthed(false); navigate('/') }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-ink-600 bg-ink-800 flex flex-col">
        <div className="px-5 py-4 border-b border-ink-600">
          <p className="font-semibold tracking-tight">Leenk <span className="text-brand-500">Admin</span></p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Internal console</p>
        </div>
        <nav className="flex-1 p-2.5 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-brand-500 text-white font-medium' : 'text-zinc-400 hover:bg-ink-700 hover:text-zinc-100'
                }`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={signOut} className="m-2.5 btn-ghost text-left">Sign out</button>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/users" element={<Users />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/features" element={<Features />} />
          <Route path="/auth" element={<AuthProviders />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
