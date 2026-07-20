// Shared email helpers — Resend REST API, no SDK.
// Graceful no-op when RESEND_API_KEY is unset (returns { skipped: true }).
// FROM defaults to Resend's shared onboarding sender until billet.app is verified.
const { sb, authAdmin } = require('./supabase')

const RESEND_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'Billet <onboarding@resend.dev>'

async function sendEmail({ to, subject, html }) {
  if (!RESEND_KEY) return { skipped: true, reason: 'RESEND_API_KEY not set' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    })
    if (!res.ok) {
      console.error('[email] send failed', res.status, await res.text().catch(() => ''))
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error('[email] send error', e)
    return { ok: false }
  }
}

// Look up the owner's email for an account (account_users → auth admin)
async function getOwnerEmail(accountId) {
  try {
    const rows = await sb('GET', `account_users?account_id=eq.${accountId}&role=eq.owner&select=user_id&limit=1`)
    if (!rows?.length) return null
    const user = await authAdmin('GET', `users/${rows[0].user_id}`)
    return user?.email || null
  } catch (e) { return null }
}

// ── Shared shell ─────────────────────────────────────────────
function shell(inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827">
    <div style="margin-bottom:24px">
      <span style="display:inline-block;background:#1F2937;color:#FAFAF9;font-weight:800;font-size:15px;border-radius:8px;padding:5px 10px">B</span>
      <span style="font-weight:800;font-size:17px;letter-spacing:-.5px;margin-left:6px">Billet</span>
    </div>
    ${inner}
    <p style="color:#9CA3AF;font-size:12px;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:14px">
      Billet — software for shops that make things. Questions? Just reply to this email.
    </p>
  </div>`
}

function welcomeEmail(shopName, appUrl) {
  return {
    subject: `Welcome to Billet — ${shopName} is live`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Your shop is set up 🎉</h2>
      <p style="color:#4B5563;line-height:1.7">Your 14-day trial of <strong>${shopName}</strong> has every tool unlocked — production board, job costing, shop traveler, AI quoting, and more. Unlimited users, no card required.</p>
      <p style="color:#4B5563;line-height:1.7">Fastest way to see the value: add your machines with hourly rates, create your first job, and set a quote — Billet will flag it the moment costs threaten your margin.</p>
      <a href="${appUrl}/app/dashboard.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Open your dashboard</a>`),
  }
}

function trialReminderEmail(shopName, daysLeft, appUrl) {
  return {
    subject: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your Billet trial`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h2>
      <p style="color:#4B5563;line-height:1.7"><strong>${shopName}</strong>'s data, jobs, and settings stay exactly as they are — pick a plan and keep rolling. Flat pricing, unlimited users, starting at $99/mo.</p>
      <a href="${appUrl}/app/billing.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Choose a plan</a>`),
  }
}

function trialExpiredEmail(shopName, appUrl) {
  return {
    subject: `Your Billet trial for ${shopName} has ended`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Your trial has ended — your data hasn't gone anywhere</h2>
      <p style="color:#4B5563;line-height:1.7">Everything you set up for <strong>${shopName}</strong> is saved. Choose a plan to pick up right where you left off.</p>
      <a href="${appUrl}/app/billing.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Reactivate ${shopName}</a>`),
  }
}

function overBudgetEmail(shopName, jobNumber, partName, actual, quoted, appUrl) {
  return {
    subject: `🔴 ${jobNumber} is over budget`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px;color:#DC2626">${jobNumber} — ${partName} just went over budget</h2>
      <p style="color:#4B5563;line-height:1.7">Actual costs (<strong>$${Math.round(actual).toLocaleString()}</strong>) have exceeded the quoted price (<strong>$${Math.round(quoted).toLocaleString()}</strong>) on this job at <strong>${shopName}</strong>. Every additional dollar is now a loss — review before more work is done.</p>
      <a href="${appUrl}/app/modules/job-costing/" style="display:inline-block;background:#DC2626;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Review the job</a>`),
  }
}

module.exports = { sendEmail, getOwnerEmail, welcomeEmail, trialReminderEmail, trialExpiredEmail, overBudgetEmail }
