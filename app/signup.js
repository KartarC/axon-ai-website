import { saveSession } from './_shared/auth.js'

// Supabase (anon key is safe in the browser) — mirrors login.js
const SUPABASE_URL  = 'https://emdgtyaggcbqaxsdrsaa.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZGd0eWFnZ2NicWF4c2Ryc2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDE0ODIsImV4cCI6MjA5NTkxNzQ4Mn0.mG0rl5_ZVZXISaKF3SnhxEtaxQocV58XCYWhXIgU_30'
window.__SUPABASE_URL__  = SUPABASE_URL
window.__SUPABASE_ANON__ = SUPABASE_ANON

const form = document.getElementById('signupForm')
const btn  = document.getElementById('signupBtn')
const err  = document.getElementById('signupError')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const shop_name = document.getElementById('shop').value.trim()
  const full_name = document.getElementById('name').value.trim()
  const email     = document.getElementById('email').value.trim()
  const password  = document.getElementById('password').value

  if (!shop_name || !full_name || !email || !password) { showError('Please fill in every field.'); return }
  if (password.length < 8) { showError('Password must be at least 8 characters.'); return }

  setLoading(true); hideError()

  try {
    const res  = await fetch('/api/auth?action=signup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ shop_name, full_name, email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not create your shop. Please try again.')

    // Signup returns everything needed for a session (auto-login)
    if (data.auto_login && data.access_token) {
      saveSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        account:       data.account,
        role:          data.role,
        user:          data.user,
        full_name:     data.full_name,
      })
      window.location.href = '/app/onboarding.html'
    } else {
      // Account made but auto-login didn't return tokens — send to login
      window.location.href = '/app/login.html?created=1'
    }
  } catch (e2) {
    showError(e2.message)
    setLoading(false)
  }
})

function setLoading(on) {
  btn.disabled = on
  btn.innerHTML = on
    ? 'Creating your shop…'
    : 'Create my shop <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}
function showError(m) { err.textContent = m; err.style.display = 'block' }
function hideError()  { err.style.display = 'none' }
