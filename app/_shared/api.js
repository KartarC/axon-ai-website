// Billet — API fetch wrapper with JWT + auto-refresh
import { getSession, refreshToken, clearSession } from './auth.js'

let refreshPromise = null

export async function apiFetch(path, options = {}, retried = false) {
  const session = getSession()
  if (!session) {
    window.location.href = '/app/login.html'
    throw new Error('Not authenticated')
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.token}`,
    ...(options.headers || {}),
  }

  const res = await fetch(path, { ...options, headers })

  // Handle 401 — try token refresh once
  if (res.status === 401) {
    if (retried) {
      clearSession()
      window.location.href = '/app/login.html?expired=1'
      throw new Error('Session expired')
    }
    if (!refreshPromise) {
      refreshPromise = refreshToken().catch(() => null).finally(() => { refreshPromise = null })
    }
    const newToken = await refreshPromise
    if (!newToken) {
      clearSession()
      window.location.href = '/app/login.html?expired=1'
      throw new Error('Session expired')
    }
    return apiFetch(path, options, true)
  }

  // Trial expired — route to the upgrade page (unless we're already on it)
  if (res.status === 402 && !location.pathname.includes('/app/billing')) {
    window.location.href = '/app/billing.html?expired=1'
    throw new Error('Trial expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function apiGet(path)          { return apiFetch(path) }
export async function apiPost(path, body)   { return apiFetch(path, { method: 'POST',  body: JSON.stringify(body) }) }
export async function apiPatch(path, body)  { return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }) }
export async function apiDelete(path)       { return apiFetch(path, { method: 'DELETE' }) }
