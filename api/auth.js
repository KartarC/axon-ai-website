// api/auth.js — consolidated auth handler
// GET  ?action=session          → validate JWT, return account context
// GET  ?action=accept-invite&token=X → validate invite token, return invite info
// POST ?action=accept-invite    → { token, password } → activate account
const { sb, authAdmin, requireAuth, cors } = require('./_lib/supabase')
const { sendEmail, welcomeEmail } = require('./_lib/email')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  // ── GET session ──────────────────────────────────────────
  if (action === 'session' && req.method === 'GET') {
    const ctx = await requireAuth(req, res, { allowExpired: true })
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

  // ── POST signup: self-serve shop signup (14-day trial, all modules) ──
  if (action === 'signup' && req.method === 'POST') {
    const { shop_name, full_name, email, password } = req.body || {}
    if (!shop_name || !email || !password) return res.status(400).json({ error: 'Shop name, email, and password are required' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    const cleanEmail = String(email).trim().toLowerCase()

    // Reject if a user with this email already exists
    try {
      const usersRes = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(cleanEmail)}`,
        { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY } }
      )
      const usersData = await usersRes.json()
      if (usersData?.users?.some(u => u.email === cleanEmail))
        return res.status(409).json({ error: 'An account with this email already exists — try signing in.' })
    } catch (_) { /* continue; user creation will fail on true duplicates */ }

    // Create the auth user (auto-confirmed — frictionless trial)
    let authUserId
    try {
      const newUser = await authAdmin('POST', 'users', { email: cleanEmail, password, email_confirm: true })
      authUserId = newUser.id
    } catch (err) {
      console.error('Signup auth user error:', err)
      return res.status(500).json({ error: 'Could not create your login. Try a different email.' })
    }

    // Create the shop workspace: 14-day trial, all 9 modules unlocked
    const ALL_MODULES = ['production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service']
    const slug = String(shop_name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32) + '-' + Math.random().toString(36).slice(2,7)
    const trialEnds = new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10)
    let account
    try {
      const rows = await sb('POST', 'accounts', {
        name: shop_name, slug, plan: 'trial', modules: ALL_MODULES,
        status: 'active', trial_ends_at: trialEnds, onboarded: false,
      })
      account = rows[0]
    } catch (err) {
      console.error('Signup account error:', err)
      return res.status(500).json({ error: 'Could not create your shop workspace.' })
    }

    // Link the signer as owner
    await sb('POST', 'account_users', {
      account_id: account.id, user_id: authUserId, role: 'owner',
      full_name: full_name || cleanEmail.split('@')[0],
    })

    // Welcome email (fire-and-forget — never blocks signup)
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host  = req.headers['x-forwarded-host'] || req.headers.host
    sendEmail({ to: cleanEmail, ...welcomeEmail(shop_name, `${proto}://${host}`) }).catch(() => {})

    // Auto-login so the client can go straight into onboarding
    const loginRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ email: cleanEmail, password }),
    })
    const loginData = await loginRes.json()
    if (!loginRes.ok) return res.status(201).json({ ok: true, auto_login: false })

    return res.status(201).json({
      ok: true, auto_login: true,
      access_token: loginData.access_token, refresh_token: loginData.refresh_token,
      account, role: 'owner', full_name: full_name || cleanEmail.split('@')[0],
      user: { id: authUserId, email: cleanEmail },
    })
  }

  // ── POST complete-onboarding: mark the shop as onboarded ──
  if (action === 'complete-onboarding' && req.method === 'POST') {
    const ctx = await requireAuth(req, res)
    if (!ctx) return
    await sb('PATCH', `accounts?id=eq.${ctx.account.id}`, { onboarded: true })
    return res.status(200).json({ ok: true })
  }

  res.status(400).json({ error: 'Unknown action or method' })
}
