// Shared email helpers — Resend REST API, no SDK.
// Missing sender credentials fail closed; secure invitations use a separate untracked domain.
const { sb, authAdmin } = require('./supabase')

function emailStatus() {
  return { notifications_ready: !!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL),
    invitations_ready: !!((process.env.RESEND_AUTH_API_KEY || process.env.RESEND_API_KEY) && process.env.AUTH_FROM_EMAIL),
    sender: process.env.FROM_EMAIL || null, auth_sender: process.env.AUTH_FROM_EMAIL || null }
}
async function sendEmail({ to, subject, html, text, kind = 'notification', idempotencyKey, secure = false }) {
  const key = secure ? (process.env.RESEND_AUTH_API_KEY || process.env.RESEND_API_KEY) : process.env.RESEND_API_KEY
  const from = secure ? process.env.AUTH_FROM_EMAIL : process.env.FROM_EMAIL
  if (!key || !from) return { skipped: true, reason: 'Email sender is not configured' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [to], subject, html, text,
        tags: [{name:'brand',value:'ovrendi'},{name:'category',value:kind}],
        reply_to: 'hello@getovrendi.com' }),
    })
    if (!res.ok) {
      console.error('[email] Provider rejected send', res.status)
      return { ok: false }
    }
    const result = await res.json()
    if (!result.id) return {ok:false}
    return { ok: true, id: result.id }
  } catch (_) {
    console.error('[email] Delivery request failed')
    return { ok: false }
  }
}

function passwordResetEmail(url) {
 return {secure:true,kind:'password_reset',subject:'Reset your Ovrendi password',text:`A password reset was requested for your Ovrendi account. Choose a new password: ${url}\nIf you did not request this, ignore this email. Your password has not changed.`,html:shell(`<h2>Reset your password</h2><p>A password reset was requested for your Ovrendi account.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#D9042B;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Choose a new password</a></p><p>If you did not request this, ignore this email. Your password has not changed.</p>`)}
}
function invitationEmail(shopName, inviteUrl) {
  const name = escapeHtml(shopName), url = escapeHtml(inviteUrl)
  return { kind:'invitation', secure:true, subject:'Your Ovrendi workspace invitation',
    text:`You have been invited to ${shopName} on Ovrendi. Open this private link to review and accept: ${inviteUrl}\nUse your existing Ovrendi password if you already have an account, or create a password if you are new.\nIf you were not expecting this invitation, ignore this message.`,
    html:shell(`<p style="color:#D9042B;font-size:11px;letter-spacing:2px;font-weight:bold">WORKSPACE INVITATION</p><h2 style="font-size:28px;line-height:1.2">Join your team on Ovrendi.</h2><p>You have been invited to <strong>${name}</strong> on Ovrendi.</p><p><a href="${url}" style="display:inline-block;padding:14px 22px;background:#D9042B;color:white;border-radius:8px;text-decoration:none">Review invitation</a></p><div style="background:#f5f5f7;border-radius:10px;padding:18px;line-height:1.7"><strong>Getting started</strong><br>1. Open your invitation.<br>2. Sign in with your existing password, or create one if you are new.<br>3. Accept to join your company workspace.</div><p style="font-size:13px;line-height:1.6">Button not working? Copy this private link into your browser:<br><a href="${url}" style="color:#B50322;word-break:break-all">${url}</a></p><p style="font-size:13px;line-height:1.6">If your invitation has expired, ask your workspace administrator for a new one. Keep this link private. If you were not expecting this invitation, ignore this message.</p><p style="font-size:13px">Need help? <a href="mailto:hello@getovrendi.com" style="color:#B50322">hello@getovrendi.com</a></p>`, `You’re invited to ${shopName}. Review your invitation and securely access your team’s workspace.`) }
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
function shell(inner, preview = 'An update about your Ovrendi workspace.') {
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all" aria-hidden="true">${escapeHtml(preview)}${'&#8204;&nbsp;'.repeat(100)}</div><div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111827">
    <div style="margin-bottom:24px">
      <img src="https://getovrendi.com/assets/ovrendi-email-mark.png" width="40" height="40" alt="Ovrendi logo" style="display:inline-block;vertical-align:middle;border:0;width:40px;height:40px">
      <span style="font-weight:800;font-size:17px;letter-spacing:-.5px;margin-left:6px">Ovrendi</span>
    </div>
    ${inner}
    <p style="color:#9CA3AF;font-size:12px;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:14px">
      Ovrendi | Business software
    </p>
  </div>`
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function welcomeEmail(shopName, appUrl) {
  shopName = escapeHtml(shopName)
  return {
    subject: 'Welcome to Ovrendi',
    kind: 'welcome',
    text: `Your Ovrendi workspace is ready. Explore the available tools during your 14-day trial. No card is required. Open your workspace: ${appUrl}/app/dashboard.html`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Welcome to your workspace</h2>
      <p style="color:#4B5563;line-height:1.7">Your 14-day trial of <strong>${shopName}</strong> includes the available ERP tools, including production, job costing and quoting. No credit card is required.</p>
      <p style="color:#4B5563;line-height:1.7">Start by adding your machines and rates. Then try a representative job, review its costs, and explore the production board and quoting pilot.</p>
      <a href="${appUrl}/app/dashboard.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Open your dashboard</a>`),
  }
}

function trialReminderEmail(shopName, daysLeft, appUrl, automatic=false, canceled=false) {
  shopName = escapeHtml(shopName)
  return {
    subject: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your Ovrendi trial`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h2>
      <p style="color:#4B5563;line-height:1.7"><strong>${shopName}</strong>: ${automatic ? (canceled ? 'Your subscription is scheduled to end. Review the cancellation date in Manage billing.' : 'Your selected USD monthly subscription starts automatically when the trial ends. Review your amount and first charge date, or cancel before that date, in Manage billing.') : 'Choose a plan and add your card to continue automatically after the trial. Plans start at US$49/month. Without a subscription, no payment is taken.'}</p>
      <a href="${appUrl}/app/billing.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">${automatic ? 'Manage billing' : 'Choose a plan'}</a>`),
  }
}

function trialExpiredEmail(shopName, appUrl) {
  shopName = escapeHtml(shopName)
  return {
    subject: `Your Ovrendi trial for ${shopName} has ended`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px">Your trial has ended — your data hasn't gone anywhere</h2>
      <p style="color:#4B5563;line-height:1.7">Everything you set up for <strong>${shopName}</strong> is saved. Choose a plan to pick up right where you left off.</p>
      <a href="${appUrl}/app/billing.html" style="display:inline-block;background:#1F2937;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Reactivate ${shopName}</a>`),
  }
}

function overBudgetEmail(shopName, jobNumber, partName, actual, quoted, appUrl) {
  shopName = escapeHtml(shopName); jobNumber = escapeHtml(jobNumber); partName = escapeHtml(partName)
  return {
    subject: `🔴 ${jobNumber} is over budget`,
    html: shell(`
      <h2 style="font-size:20px;margin:0 0 10px;color:#DC2626">${jobNumber} — ${partName} just went over budget</h2>
      <p style="color:#4B5563;line-height:1.7">Actual costs (<strong>$${Math.round(actual).toLocaleString()}</strong>) have exceeded the quoted price (<strong>$${Math.round(quoted).toLocaleString()}</strong>) on this job at <strong>${shopName}</strong>. Every additional dollar is now a loss — review before more work is done.</p>
      <a href="${appUrl}/app/modules/job-costing/" style="display:inline-block;background:#DC2626;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;margin-top:8px">Review the job</a>`),
  }
}

module.exports = { passwordResetEmail, emailStatus, invitationEmail, sendEmail, getOwnerEmail, welcomeEmail, trialReminderEmail, trialExpiredEmail, overBudgetEmail }
