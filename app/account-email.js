import { SUPABASE_URL, SUPABASE_ANON } from './_shared/config.js'
import { clearSession } from './_shared/auth.js'

const params = new URLSearchParams(location.hash.slice(1))
// Credentials stay in memory and are removed from browser history immediately.
let accessToken = params.get('access_token')
const linkType = params.get('type')
const linkError = params.has('error') || params.has('error_description')
if (location.hash) history.replaceState(null, '', location.pathname)
const mode = document.body.dataset.authMode
const message = document.getElementById('authMessage')
const error = document.getElementById('authError')
function showMessage(text) { message.textContent = text; message.hidden = false }
function showError(text) { error.textContent = text; error.style.display = 'block' }
async function authRequest(path, body, token, method = 'POST') {
  return fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}) },
    ...(body ? {body: JSON.stringify(body)} : {}),
  })
}
const emailForm = document.getElementById('emailForm')
emailForm?.addEventListener('submit', async event => {
  event.preventDefault()
  const button = document.getElementById('emailButton')
  const original = button.textContent
  button.disabled = true; button.textContent = 'Sending…'; error.style.display = 'none'; message.hidden = true
  try {
    const recovery = mode === 'recovery-request'
    const redirect = `${location.origin}/app/${recovery ? 'reset-password' : 'confirm-email'}.html`
    const response = await authRequest(`${recovery ? 'recover' : 'resend'}?redirect_to=${encodeURIComponent(redirect)}`, {
      email: document.getElementById('email').value.trim(), ...(!recovery ? {type: 'signup'} : {}),
    })
    if (response.status === 429) throw new Error('Please wait a minute before requesting another email.')
    if (!response.ok) throw new Error('Email delivery is unavailable right now. Please try again later or contact hello@getovrendi.com.')
    showMessage('If this email is eligible, you’ll receive a link shortly. Check your inbox and spam folder.')
  } catch (err) { showError(err.message === 'Failed to fetch' ? 'Connection unavailable. Please try again.' : err.message) }
  finally { button.disabled = false; button.textContent = original }
})
if (mode === 'recovery') {
  if (!accessToken || linkType !== 'recovery' || linkError) {
    accessToken = null; showError('This reset link is missing, invalid or expired. Request a new link below.')
  } else {
    // Supabase validates the token; no decoded JWT is trusted as proof of identity.
    try {
      const response = await authRequest('user', null, accessToken, 'GET')
      if (!response.ok) throw new Error('Invalid link')
      document.getElementById('resetForm').hidden = false
    } catch (_) { accessToken = null; showError('We could not validate this link. Request a new link and try again.') }
  }
}
document.getElementById('resetForm')?.addEventListener('submit', async event => {
  event.preventDefault()
  const password = document.getElementById('password').value
  const confirmation = document.getElementById('confirmPassword').value
  if (password !== confirmation) return showError('The passwords do not match.')
  if (password.length < 8 || password.length > 256 || !accessToken) return showError('Use a valid reset link and a password of 8–256 characters.')
  const button = document.getElementById('resetButton')
  button.disabled = true; button.textContent = 'Saving…'; error.style.display = 'none'
  try {
    const response = await authRequest('user', {password}, accessToken, 'PUT')
    if (!response.ok) throw new Error('Your password could not be changed. Use a different password or request a new reset link.')
    await authRequest('logout', null, accessToken).catch(() => {})
    accessToken = null; clearSession(); event.target.reset(); event.target.hidden = true
    showMessage('Your password has been changed. Return to sign in with your new password.')
  } catch (err) { showError(err.message) }
  finally { button.disabled = false; button.textContent = 'Save new password' }
})
if (mode === 'confirmation' && accessToken && ['signup', 'email'].includes(linkType) && !linkError) {
  try {
    const response = await authRequest('user', null, accessToken, 'GET')
    if (!response.ok || !(await response.json()).email_confirmed_at) throw new Error('Invalid link')
    await authRequest('logout?scope=local', null, accessToken).catch(() => {})
    emailForm.hidden = true
    showMessage('Your email is confirmed. Sign in to finish setting up your Ovrendi workspace.')
  } catch (_) { showError('This confirmation link could not be verified. Request a new email below.') }
  finally { accessToken = null }
} else if (mode === 'confirmation' && linkError) showError('This confirmation link has expired or is invalid. Request a new email below.')
