import { saveSession } from './_shared/auth.js'

const SUPABASE_URL  = 'https://emdgtyaggcbqaxsdrsaa.supabase.co'
const SUPABASE_ANON = window.__SUPABASE_ANON__ || ''

const card  = document.getElementById('inviteCard')
const token = new URLSearchParams(location.search).get('token')

if (!token) {
  showInvalid('No invite token found. Check your email link.')
} else {
  loadInvite()
}

async function loadInvite() {
  try {
    const res  = await fetch(`/api/auth?action=accept-invite&token=${encodeURIComponent(token)}`)
    const data = await res.json()

    if (!res.ok) {
      return showInvalid(data.error || 'Invalid or expired invite link.')
    }

    renderForm(data)
  } catch (e) {
    showInvalid('Failed to load invite. Please try again.')
  }
}

function renderForm({ email, role, account_name, plan }) {
  const planLabel = { starter:'Starter', growth:'Growth', suite:'Suite' }[plan] || plan
  card.innerHTML = `
    <div class="invite-welcome">You're invited</div>
    <h1 class="invite-title">Welcome to Billet</h1>
    <p class="invite-sub">Set a password for <strong>${escHtml(email)}</strong> to access your shop's tools.</p>

    <div class="invite-shop">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="3" width="15" height="13" rx="1.5" stroke="#1D4ED8" stroke-width="1.3"/><path d="M5 1.5v3M13 1.5v3M1.5 9H16.5" stroke="#1D4ED8" stroke-width="1.3" stroke-linecap="round"/></svg>
      <div>
        <div class="invite-shop-name">${escHtml(account_name)}</div>
        <div class="invite-shop-role">${escHtml(role)} · ${planLabel} Plan</div>
      </div>
    </div>

    <form id="pwForm" novalidate>
      <div class="invite-field">
        <label class="invite-label" for="pw">Create a password</label>
        <input class="invite-input" type="password" id="pw" autocomplete="new-password" placeholder="At least 8 characters" required/>
        <div class="pw-hint">Use at least 8 characters with a mix of letters and numbers.</div>
      </div>
      <div class="invite-field">
        <label class="invite-label" for="pw2">Confirm password</label>
        <input class="invite-input" type="password" id="pw2" autocomplete="new-password" placeholder="Repeat your password" required/>
      </div>
      <button class="invite-btn" type="submit" id="submitBtn">Activate Account →</button>
      <div class="invite-error" id="inviteError"></div>
    </form>
  `

  document.getElementById('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault()
    const pw  = document.getElementById('pw').value
    const pw2 = document.getElementById('pw2').value

    if (pw.length < 8) { showErr('Password must be at least 8 characters.'); return }
    if (pw !== pw2)     { showErr('Passwords do not match.'); return }

    const btn = document.getElementById('submitBtn')
    btn.disabled    = true
    btn.textContent = 'Activating…'
    hideErr()

    try {
      const res  = await fetch('/api/auth?action=accept-invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password: pw }),
      })
      const data = await res.json()

      if (!res.ok) { showErr(data.error || 'Activation failed.'); btn.disabled = false; btn.textContent = 'Activate Account →'; return }

      if (data.auto_login && data.access_token) {
        // Get session context
        const sessRes  = await fetch('/api/auth?action=session', {
          headers: { Authorization: `Bearer ${data.access_token}` },
        })
        const sessData = await sessRes.json()

        if (sessRes.ok) {
          saveSession({
            access_token:  data.access_token,
            refresh_token: data.refresh_token,
            account:       sessData.account,
            role:          sessData.role,
            user:          sessData.user,
            full_name:     sessData.full_name,
          })
          window.location.href = '/app/dashboard.html'
          return
        }
      }

      // Fallback: redirect to login
      window.location.href = '/app/login.html?activated=1'
    } catch (err) {
      showErr('Something went wrong. Please try again.')
      btn.disabled = false
      btn.textContent = 'Activate Account →'
    }
  })
}

function showInvalid(msg) {
  card.innerHTML = `
    <div class="state-invalid">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="margin:0 auto;display:block;color:#D1D5DB">
        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1.5"/>
        <path d="M20 12v9M20 27v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2>Invite not valid</h2>
      <p>${escHtml(msg)}</p>
      <a href="mailto:hello@billet.app" style="color:var(--blue-700);font-size:.875rem;font-weight:600">Contact support →</a>
    </div>
  `
}
function showErr(msg) { document.getElementById('inviteError').textContent = msg; document.getElementById('inviteError').style.display = 'block' }
function hideErr()    { document.getElementById('inviteError').style.display = 'none' }
function escHtml(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
