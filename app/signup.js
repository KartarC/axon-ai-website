import { saveSession } from './_shared/auth.js'



const form = document.getElementById('signupForm')
const btn  = document.getElementById('signupBtn')
const err  = document.getElementById('signupError')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const shop_name = document.getElementById('shop').value.trim()
  const full_name = document.getElementById('name').value.trim()
  const email     = document.getElementById('email').value.trim()
  const password  = document.getElementById('password').value

  if (!form.reportValidity()) return
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

    if (data.confirmation_required) {
      form.hidden = true
      const notice = document.createElement('div')
      notice.className = 'ov-auth-message'
      notice.setAttribute('role', 'status')
      notice.textContent = data.email_sent
        ? 'Welcome to Ovrendi. Check your inbox to confirm your email, then sign in to finish setting up your workspace.'
        : 'Your workspace was created, but the email could not be sent. Request another confirmation email below.'
      const link = document.createElement('a')
      link.href = '/app/confirm-email.html'
      link.className = 'ov-forgot'
      link.textContent = 'Resend confirmation email'
      form.after(notice, link)
      return
    }
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
    : 'Start my free trial <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}
function showError(m) { err.textContent = m; err.style.display = 'block' }
function hideError()  { err.style.display = 'none' }
