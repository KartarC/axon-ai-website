import { MODULES } from './_shared/modules.js'
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
const requestedModule = MODULES[params.get('module')]
if (requestedModule) {
  const banner = document.getElementById('moduleUpgradeBanner')
  banner.style.display = 'block'
  banner.textContent = requestedModule.name + ' is not included in your company’s current module access. ' + (['owner','admin'].includes(session.role)
    ? 'Upgrade your plan or contact Ovrendi to add this module. Your current modules remain available.'
    : 'Ask your company owner or administrator to upgrade and enable this module.')
}
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
    document.getElementById('successBanner').textContent = data.account.stripe_subscription_id && data.account.status === 'active' && ['active','trialing'].includes(data.account.billing_status)
      ? (data.account.billing_status==='trialing' ? 'Your trial subscription is set up. Billing starts after the trial unless you cancel.' : 'Your subscription is active.') : 'Payment confirmation is still pending. Refresh this page shortly, or contact support if your plan does not update.'
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
    if(!document.getElementById('recurringConsent').checked){toastError('Please confirm the monthly USD subscription terms first.');return}
    btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Opening checkout…'
    try {
      const r = await apiPost('/api/billing?action=checkout', { plan: btn.dataset.plan, accept_recurring: true })
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
    document.getElementById('trialSchedule').textContent = status.subscription_status==='trialing'
      ? (status.cancel_at_period_end ? 'Your trial subscription is scheduled to cancel. Review the date in Manage billing.' : 'Your trial subscription is set up for automatic billing. Review your first charge date or cancel in Manage billing.')
      : status.trial_end ? 'Add your card now: your first monthly USD charge will be on or after '+new Date(status.trial_end*1000).toLocaleDateString()+'. Stripe shows the exact date before you confirm. A short remaining trial may be extended to meet Stripe’s minimum.'
      : status.subscription_status==='active' ? 'Your subscription is active. View your agreed price and renewal date in Manage billing.' : 'Your trial has ended or is not available. The selected USD monthly plan starts when you complete checkout.'
    notice.textContent = !status.checkout_ready
      ? 'Online subscription payments are being set up. Contact hello@getovrendi.com for help. No payment will be taken here yet.'
      : status.test_mode ? 'Payment testing is enabled. This checkout uses test payments, not real charges.'
      : 'Subscriptions are billed monthly in USD. Review the final amount in Stripe before confirming.'
    buttons.forEach(button => { button.disabled = !status.checkout_ready || (!!session.account.stripe_subscription_id && !['canceled','incomplete_expired'].includes(session.account.billing_status)) || (button.dataset.plan === session.account.plan && !['canceled','incomplete_expired'].includes(session.account.billing_status)) })
    document.getElementById('portalBtn').disabled = !status.portal_ready
  }).catch(() => { notice.textContent = 'Payment availability could not be checked. Please refresh or contact hello@getovrendi.com.' })
} else document.getElementById('billingReadiness').textContent = 'A company owner or administrator can manage subscriptions.'

if (session.account.billing_status && !['active','trialing'].includes(session.account.billing_status)) {
 const banner=document.getElementById('expiredBanner'); banner.style.display='block'; banner.textContent='Your subscription needs attention. Use Manage billing to review payment details, or choose a plan if your subscription has ended.';
}
