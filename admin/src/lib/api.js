/**
 * Admin API client.
 *
 * Auth is a separate admin key held only in this app's memory + sessionStorage
 * -- deliberately NOT localStorage, so closing the tab drops it. The console is
 * intended to be hosted on its own origin, so a compromise of the student app
 * cannot reach these endpoints.
 */

const BASE = import.meta.env.VITE_ADMIN_API_BASE || '/api'
const KEY = 'leenk.admin.key'

export const getKey = () => sessionStorage.getItem(KEY) || ''
export const setKey = (k) => k ? sessionStorage.setItem(KEY, k) : sessionStorage.removeItem(KEY)

export async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }

  if (!res.ok) {
    const err = new Error(json?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.code = json?.code
    throw err
  }
  return json
}

export const api = {
  health:       () => request('/admin/health'),
  config:       () => request('/admin/config'),
  saveConfig:   (section, patch) => request(`/admin/config/${section}`, { method: 'PATCH', body: patch }),
  resetConfig:  (section) => request(`/admin/config/${section}/reset`, { method: 'POST' }),
  features:     (patch) => request('/admin/features', { method: 'PATCH', body: patch }),

  reviewQueue:  () => request('/verification/queue'),
  decide:       (recordId, decision, note) =>
                  request(`/verification/queue/${recordId}/decide`, { method: 'POST', body: { decision, note } }),

  users:        (q) => request(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  user:         (uid) => request(`/admin/users/${uid}`),
  userAction:   (uid, action, reason) =>
                  request(`/admin/users/${uid}/action`, { method: 'POST', body: { action, reason } }),

  reports:      () => request('/admin/reports'),
  audit:        () => request('/admin/audit'),
  revenue:      () => request('/admin/revenue'),
}
