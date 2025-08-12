const API_BASE = import.meta.env.VITE_API_BASE || '/api'
let authToken = null // vom /api/config/auth

export function setAuthToken(t){ authToken = t }
export function clearAuth(){ authToken = null }

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', headers, ...opts
  })
  if (!res.ok) {
    const body = await res.json().catch(()=> ({}))
    const msg = body?.error?.message || body?.error || res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}