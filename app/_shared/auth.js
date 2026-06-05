// Axon AI — Auth utilities (browser ES module)
// Handles session storage, JWT management, and page guards

const STORAGE_KEYS = {
  ACCESS_TOKEN:  'axon_access_token',
  REFRESH_TOKEN: 'axon_refresh_token',
  ACCOUNT:       'axon_account',
  ROLE:          'axon_role',
  USER:          'axon_user',
  FULL_NAME:     'axon_full_name',
}

export function getSession() {
  const token   = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
  const account = sessionStorage.getItem(STORAGE_KEYS.ACCOUNT)
  const role    = sessionStorage.getItem(STORAGE_KEYS.ROLE)
  const user    = sessionStorage.getItem(STORAGE_KEYS.USER)
  if (!token || !account) return null
  return {
    token,
    refreshToken: sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    account:      JSON.parse(account),
    role,
    user:         user ? JSON.parse(user) : null,
    fullName:     sessionStorage.getItem(STORAGE_KEYS.FULL_NAME),
  }
}

export function saveSession({ access_token, refresh_token, account, role, user, full_name }) {
  sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN,  access_token)
  sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token || '')
  sessionStorage.setItem(STORAGE_KEYS.ACCOUNT,       JSON.stringify(account))
  sessionStorage.setItem(STORAGE_KEYS.ROLE,          role)
  sessionStorage.setItem(STORAGE_KEYS.USER,          JSON.stringify(user))
  sessionStorage.setItem(STORAGE_KEYS.FULL_NAME,     full_name || '')
}

export function clearSession() {
  Object.values(STORAGE_KEYS).forEach(k => sessionStorage.removeItem(k))
}

// Redirect to login if no session, return session if valid
export function requireAuth(returnPath) {
  const session = getSession()
  if (!session) {
    const ret = returnPath || window.location.pathname + window.location.search
    window.location.href = '/app/login.html?return=' + encodeURIComponent(ret)
    return null
  }
  return session
}

// Redirect to dashboard if module not enabled
export function requireModule(slug) {
  const session = requireAuth()
  if (!session) return null
  if (!session.account.modules.includes(slug)) {
    window.location.href = '/app/dashboard.html?upgrade=' + slug
    return null
  }
  return session
}

export async function logout() {
  const session = getSession()
  if (session?.token) {
    // Sign out from Supabase
    try {
      const SUPABASE_URL = window.__SUPABASE_URL__ // injected by nav.js
      if (SUPABASE_URL) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.token}`,
            apikey: window.__SUPABASE_ANON__ || '',
          },
        })
      }
    } catch (e) { /* ignore */ }
  }
  clearSession()
  window.location.href = '/app/login.html'
}

// Try to refresh the token, returns new token or null
export async function refreshToken() {
  const session = getSession()
  if (!session?.refreshToken) return null

  const SUPABASE_URL = window.__SUPABASE_URL__ || ''
  const SUPABASE_ANON = window.__SUPABASE_ANON__ || ''

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
    },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })

  if (!res.ok) {
    clearSession()
    return null
  }

  const data = await res.json()
  sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN,  data.access_token)
  sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token)
  return data.access_token
}
