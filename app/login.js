import { saveSession } from './_shared/auth.js'

import { SUPABASE_URL, SUPABASE_ANON } from './_shared/config.js'

const form  = document.getElementById('loginForm')
const btn   = document.getElementById('submitBtn')
const errEl = document.getElementById('loginError')

// Check for messages (expired session, etc.)
const params = new URLSearchParams(location.search)
if (params.get('expired')) showError('Your session expired. Please sign in again.')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const email    = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value

  if (!email || !password) { showError('Email and password are required.'); return }

  setLoading(true)
  hideError()

  try {
    // Step 1: Authenticate with Supabase
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body:    JSON.stringify({ email, password }),
    })
    const authData = await authRes.json()

    if (!authRes.ok) {
      throw new Error(authData.error_description || authData.msg || 'Invalid email or password')
    }

    // Step 2: Get account context
    const sessionRes = await fetch('/api/auth?action=session', {
      headers: { Authorization: `Bearer ${authData.access_token}` },
    })
    const sessionData = await sessionRes.json()

    if (!sessionRes.ok) {
      throw new Error(sessionData.error || 'Unable to load your account. Contact support.')
    }

    // Step 3: Save session
    saveSession({
      access_token:  authData.access_token,
      refresh_token: authData.refresh_token,
      account:       sessionData.account,
      role:          sessionData.role,
      user:          sessionData.user,
      full_name:     sessionData.full_name,
    })

    // Step 4: Redirect
    const returnTo = params.get('return')
    const target = new URL(returnTo || '/app/dashboard.html', window.location.origin)
    window.location.href = target.origin === window.location.origin && target.pathname.startsWith('/app/')
      ? target.pathname + target.search + target.hash : '/app/dashboard.html'

  } catch (err) {
    showError(err.message)
    setLoading(false)
  }
})

function setLoading(on) {
  btn.disabled    = on
  btn.textContent = on ? 'Signing in…' : 'Sign In'
  if (!on) {
    btn.innerHTML = 'Sign In <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
}
function showError(msg) { errEl.textContent = msg; errEl.style.display = 'block' }
function hideError()    { errEl.style.display = 'none' }
