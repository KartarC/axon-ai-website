// Axon AI — API fetch wrapper with JWT + auto-refresh
import { getSession, refreshToken, clearSession } from './auth.js'

let isRefreshing = false
let refreshQueue = []

export async function apiFetch(path, options = {}) {
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
    if (isRefreshing) {
      // Wait for the ongoing refresh
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject, path, options })
      })
    }

    isRefreshing = true
    const newToken = await refreshToken()
    isRefreshing = false

    if (!newToken) {
      clearSession()
      window.location.href = '/app/login.html?expired=1'
      throw new Error('Session expired')
    }

    // Retry queued requests
    refreshQueue.forEach(({ resolve, reject, path: p, options: o }) => {
      apiFetch(p, o).then(resolve).catch(reject)
    })
    refreshQueue = []

    // Retry original request
    return apiFetch(path, options)
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
