import { requireAuth, saveSession, getSession } from './_shared/auth.js'
import { renderNav }                from './_shared/nav.js'
import { apiPost, apiGet }          from './_shared/api.js'
import { toastError, toastSuccess } from './_shared/toast.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')
renderNav('/app/billing')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => document.getElementById('app-nav').classList.toggle('open'))

const params = new URLSearchParams(location.search)
if (params.get('expired'))  document.getElementById('expiredBanner').style.display = 'block'
if (params.get('canceled')) document.getElementById('canceledBanner').style.display = 'block'

// After Stripe success, refresh the cached session so the new plan shows
if (params.get('success')) {
  document.getElementById('successBanner').style.display = 'block'
  apiGet('/api/auth?action=session').then(data => {
    saveSession({
      access_token:  session.token,
      refresh_token: session.refreshToken,
      account:       data.account,
      role:          data.role,
      user:          data.user,
      full_name:     data.full_name,
    })
    renderNav('/app/billing')
    markCurrentPlan(data.account.plan)
  }).catch(() => {})
}

function markCurrentPlan(plan) {
  document.querySelectorAll('.plan-btn[data-plan]').forEach(btn => {
    if (btn.dataset.plan === plan) {
      btn.classList.add('plan-btn--current')
      btn.disabled = true
      btn.textContent = 'Current plan'
    }
  })
}
markCurrentPlan(session.account.plan)

document.querySelectorAll('.plan-btn[data-plan]').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Opening checkout…'
    try {
      const r = await apiPost('/api/billing?action=checkout', { plan: btn.dataset.plan })
      window.location.href = r.url
    } catch (e) {
      toastError(e.message)
      btn.disabled = false; btn.textContent = orig
    }
  })
})

document.getElementById('portalBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  btn.disabled = true
  try {
    const r = await apiPost('/api/billing?action=portal', {})
    window.location.href = r.url
  } catch (err) { toastError(err.message); btn.disabled = false }
})
