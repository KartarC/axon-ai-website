import { requireAuth, saveSession, getSession } from './_shared/auth.js'
import { renderNav }                from './_shared/nav.js'
import { apiPost, apiGet }          from './_shared/api.js'
import { toastError, toastSuccess } from './_shared/toast.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')
renderNav('/app/billing')
if (!['owner','admin'].includes(session.role)) {
  document.querySelectorAll('.plan-btn, #portalBtn').forEach(btn => {
    btn.disabled = true
    btn.title = 'Only shop owners and admins can manage billing'
  })
}
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
    document.getElementById('successBanner').textContent = data.account.stripe_subscription_id && data.account.status === 'active'
      ? 'Your subscription is active.' : 'Payment confirmation is still pending. Refresh this page shortly, or contact support if your plan does not update.'
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

// Do not send customers into an unconfigured checkout or open a second subscription.
if (['owner','admin'].includes(session.role)) {
  const notice = document.getElementById('billingReadiness')
  const buttons = [...document.querySelectorAll('.plan-btn[data-plan]')]
  buttons.forEach(button => { button.disabled = true })
  document.getElementById('portalBtn').disabled = true
  apiGet('/api/billing?action=status').then(status => {
    notice.textContent = !status.checkout_ready
      ? 'Online subscription payments are being set up. Contact info@ovrendi.com for help. No payment will be taken here yet.'
      : status.test_mode ? 'Payment testing is enabled. This checkout uses test payments, not real charges.'
      : 'Subscriptions are billed monthly in USD. Review the final amount in Stripe before confirming.'
    buttons.forEach(button => { button.disabled = !status.checkout_ready || !!session.account.stripe_subscription_id || button.dataset.plan === session.account.plan })
    document.getElementById('portalBtn').disabled = !status.portal_ready
  }).catch(() => { notice.textContent = 'Payment availability could not be checked. Please refresh or contact info@ovrendi.com.' })
} else document.getElementById('billingReadiness').textContent = 'A company owner or administrator can manage subscriptions.'
