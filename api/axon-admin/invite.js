// POST /api/axon-admin/invite
// Creates an account invite and sends the email via Resend
const { sb, authAdmin, requireAxonAdmin, cors } = require('../_lib/supabase')

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || 'https://axon-ai-website-three.vercel.app'
const FROM_EMAIL = 'Axon AI <onboarding@axon.ai>'

async function sendInviteEmail(to, shopName, inviteUrl) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject: `You're invited to Axon AI — ${shopName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Inter,sans-serif;background:#f9fafb;padding:40px 20px;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;border:1px solid #e5e7eb">
    <div style="font-size:1.2rem;font-weight:900;color:#1D4ED8;margin-bottom:24px">Axon AI</div>
    <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 12px">You're invited to ${shopName}</h2>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 24px">
      Your Axon AI account is ready. Click the button below to set your password and access your shop's tools.
    </p>
    <a href="${inviteUrl}"
       style="display:inline-block;background:#111827;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:0.95rem">
      Set Password &amp; Get Started →
    </a>
    <p style="color:#9ca3af;font-size:0.8rem;margin-top:24px;line-height:1.6">
      This link expires in 7 days. If you didn't expect this email, you can ignore it.<br/>
      Questions? Reply to this email or contact hello@axon.ai
    </p>
  </div>
</body>
</html>`,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
  }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAxonAdmin(req, res)) return

  const { email, account_id, role = 'owner' } = req.body || {}
  if (!email || !account_id) return res.status(400).json({ error: 'email and account_id required' })

  // Fetch account name
  const accounts = await sb('GET', `accounts?id=eq.${account_id}&select=name`)
  if (!accounts || accounts.length === 0) return res.status(404).json({ error: 'Account not found' })
  const shopName = accounts[0].name

  // Create invite record
  const [invite] = await sb('POST', 'account_invites', {
    account_id,
    email,
    role,
  })

  // Create Supabase auth user (will be activated on accept)
  try {
    await authAdmin('POST', 'users', {
      email,
      email_confirm: false,
      user_metadata: { account_id, role },
    })
  } catch (err) {
    // User might already exist — that's OK
    console.log('Auth user create (may already exist):', err.message)
  }

  // Send invite email
  const inviteUrl = `${SITE_URL}/app/accept-invite.html?token=${invite.token}`
  await sendInviteEmail(email, shopName, inviteUrl)

  res.status(201).json({
    ok:          true,
    invite_id:   invite.id,
    invite_url:  inviteUrl,
    email,
    shop:        shopName,
  })
}
