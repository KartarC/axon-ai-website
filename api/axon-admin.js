// api/axon-admin.js — consolidated Billet internal admin
// All routes require X-Admin-Secret header or ?secret= query param
// ?resource=accounts → GET list / POST create / PATCH ?id=X
// ?resource=invite   → POST send invite
const { sb, authAdmin, requireAxonAdmin, cors } = require('./_lib/supabase')

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL       = process.env.SITE_URL || 'https://axon-ai-website-three.vercel.app'
const FROM_EMAIL     = 'Billet <onboarding@billet.app>'

async function sendInviteEmail(to, shopName, inviteUrl) {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set — skipping email'); return }
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL, to: [to],
      subject: `You're invited to Billet — ${shopName}`,
      html: `<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#f9fafb;padding:40px 20px">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;border:1px solid #e5e7eb">
          <div style="font-size:1.1rem;font-weight:900;color:#1D4ED8;margin-bottom:20px">Billet</div>
          <h2 style="font-size:1.3rem;font-weight:800;margin:0 0 12px">You're invited to ${shopName}</h2>
          <p style="color:#4b5563;line-height:1.7;margin:0 0 24px">Your Billet account is ready. Click below to set your password and start using your shop tools.</p>
          <a href="${inviteUrl}" style="display:inline-block;background:#111827;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Set Password &amp; Get Started →</a>
          <p style="color:#9ca3af;font-size:.8rem;margin-top:24px">Link expires in 7 days. Questions? hello@billet.app</p>
        </div></body></html>`,
    }),
  })
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAxonAdmin(req, res)) return

  const { resource, id } = req.query

  // ── ACCOUNTS ─────────────────────────────────────────────
  if (resource === 'accounts') {
    if (req.method === 'GET') {
      const accounts = await sb('GET', 'accounts?select=*&order=created_at.desc')
      return res.status(200).json(accounts || [])
    }
    if (req.method === 'POST') {
      const { name, plan = 'starter', modules = [], timezone = 'America/Toronto', notes } = req.body || {}
      if (!name) return res.status(400).json({ error: 'name required' })
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      const existing = await sb('GET', `accounts?slug=eq.${slug}`)
      const finalSlug = (existing?.length > 0) ? `${slug}-${Math.random().toString(36).slice(2,6)}` : slug
      const [account] = await sb('POST', 'accounts', { name, slug: finalSlug, plan, modules, timezone, notes: notes || null })
      return res.status(201).json(account)
    }
    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id required' })
      const allowed = ['name','plan','modules','status','timezone','notes']
      const updates = {}
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
      const [updated] = await sb('PATCH', `accounts?id=eq.${id}`, updates)
      return res.status(200).json(updated)
    }
  }

  // ── INVITE ───────────────────────────────────────────────
  if (resource === 'invite' && req.method === 'POST') {
    const { email, account_id, role = 'owner' } = req.body || {}
    if (!email || !account_id) return res.status(400).json({ error: 'email and account_id required' })

    const accounts = await sb('GET', `accounts?id=eq.${account_id}&select=name`)
    if (!accounts?.length) return res.status(404).json({ error: 'Account not found' })
    const shopName = accounts[0].name

    const [invite] = await sb('POST', 'account_invites', { account_id, email, role })

    try {
      await authAdmin('POST', 'users', { email, email_confirm: false, user_metadata: { account_id, role } })
    } catch (e) { /* user may already exist */ }

    const inviteUrl = `${SITE_URL}/app/accept-invite.html?token=${invite.token}`
    await sendInviteEmail(email, shopName, inviteUrl)

    return res.status(201).json({ ok: true, invite_id: invite.id, invite_url: inviteUrl, email, shop: shopName })
  }

  res.status(400).json({ error: 'Unknown resource or method' })
}
