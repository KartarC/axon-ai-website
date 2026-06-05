// api/auth.js — consolidated auth handler
// GET  ?action=session          → validate JWT, return account context
// GET  ?action=accept-invite&token=X → validate invite token, return invite info
// POST ?action=accept-invite    → { token, password } → activate account
const { sb, authAdmin, requireAuth, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  // ── GET session ──────────────────────────────────────────
  if (action === 'session' && req.method === 'GET') {
    const ctx = await requireAuth(req, res)
    if (!ctx) return
    return res.status(200).json({
      user:      { id: ctx.user.id, email: ctx.user.email },
      role:      ctx.role,
      full_name: ctx.full_name,
      account:   ctx.account,
    })
  }

  // ── GET accept-invite: validate token ────────────────────
  if (action === 'accept-invite' && req.method === 'GET') {
    const { token } = req.query
    if (!token) return res.status(400).json({ error: 'Token required' })

    const rows = await sb('GET',
      `account_invites?token=eq.${token}&select=email,role,expires_at,accepted_at,account_id,accounts(name,plan)`
    )
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Invite not found' })
    const invite = rows[0]
    if (invite.accepted_at) return res.status(410).json({ error: 'Invite already used' })
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' })

    return res.status(200).json({
      email:        invite.email,
      role:         invite.role,
      account_name: invite.accounts?.name,
      plan:         invite.accounts?.plan,
    })
  }

  // ── POST accept-invite: set password + onboard ───────────
  if (action === 'accept-invite' && req.method === 'POST') {
    const { token, password } = req.body || {}
    if (!token || !password) return res.status(400).json({ error: 'token and password required' })
    if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const rows = await sb('GET', `account_invites?token=eq.${token}&select=*`)
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Invite not found' })
    const invite = rows[0]
    if (invite.accepted_at) return res.status(410).json({ error: 'Invite already used' })
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' })

    let authUserId
    try {
      const usersRes = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(invite.email)}`,
        { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY } }
      )
      const usersData = await usersRes.json()
      const existing  = usersData?.users?.find(u => u.email === invite.email)

      if (existing) {
        authUserId = existing.id
        await authAdmin('PUT', `users/${authUserId}`, { password, email_confirm: true })
      } else {
        const newUser = await authAdmin('POST', 'users', { email: invite.email, password, email_confirm: true })
        authUserId = newUser.id
      }
    } catch (err) {
      console.error('Auth user error:', err)
      return res.status(500).json({ error: 'Failed to set up user account' })
    }

    await sb('POST', 'account_users', {
      account_id: invite.account_id,
      user_id:    authUserId,
      role:       invite.role,
      full_name:  invite.email.split('@')[0],
    })
    await sb('PATCH', `account_invites?token=eq.${token}`, { accepted_at: new Date().toISOString() })

    // Auto-login
    const loginRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
      body:    JSON.stringify({ email: invite.email, password }),
    })
    const loginData = await loginRes.json()
    if (!loginRes.ok) return res.status(200).json({ ok: true, auto_login: false })

    return res.status(200).json({ ok: true, auto_login: true, access_token: loginData.access_token, refresh_token: loginData.refresh_token })
  }

  res.status(400).json({ error: 'Unknown action or method' })
}
