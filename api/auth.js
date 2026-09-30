// api/auth.js — consolidated auth handler
// GET  ?action=session          → validate JWT, return account context
// GET  ?action=accept-invite&token=X → validate invite token, return invite info
// POST ?action=accept-invite    → { token, password } → activate account
const { sb, authAdmin, requireAuth, validateToken, cors } = require('./_lib/supabase')
const { isToken, siteUrl } = require('./_lib/security')
const { sendEmail, welcomeEmail } = require('./_lib/email')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  res.setHeader('Cache-Control', 'no-store')
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
    if (!isToken(token, 64)) return res.status(400).json({ error: 'Invalid token' })

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

  // Existing identities must prove possession of their login. Never reset a password here.
  if (action === 'accept-invite' && req.method === 'POST') {
    const { token, password } = req.body || {}
    if (!isToken(token, 64)) return res.status(400).json({ error: 'Invalid token' })
    const [invite] = await sb('GET', `account_invites?token=eq.${token}&select=*`) || []
    if (!invite || invite.accepted_at || new Date(invite.expires_at) <= new Date())
      return res.status(410).json({ error: 'Invite is invalid, expired, or already used' })

    let user, session
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
    if (bearer) {
      user = await validateToken(bearer)
      if (!user || user.email?.toLowerCase() !== invite.email.toLowerCase())
        return res.status(403).json({ error: 'Sign in with the email address on this invitation' })
    } else {
      if (typeof password !== 'string' || password.length < 8 || password.length > 256)
        return res.status(400).json({ error: 'A password of 8–256 characters is required' })
      const login = () => fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({ email: invite.email, password }),
      })
      let response = await login()
      if (!response.ok) {
        // Creating a NEW identity fails on an existing email. No lookup/update fallback.
        try { await authAdmin('POST', 'users', { email: invite.email, password, email_confirm: true }) }
        catch (_) { return res.status(403).json({ error: 'Use your existing password, or recover your account before accepting this invite' }) }
        response = await login()
      }
      if (!response.ok) return res.status(401).json({ error: 'Please sign in and try accepting the invite again' })
      session = await response.json()
      user = session.user
      if (!user?.id || user.email?.toLowerCase() !== invite.email.toLowerCase())
        return res.status(403).json({ error: 'Invitation identity does not match' })
    }
    // This service-role-only RPC locks and consumes the invitation with membership creation.
    const result = await sb('POST', 'rpc/billet_accept_invite', {
      p_token: token, p_user_id: user.id, p_email: user.email,
    })
    if (!result?.ok) return res.status(409).json({ error: result?.error || 'Invite could not be accepted' })
    return res.status(200).json({ ok: true, auto_login: !!session,
      ...(session ? { access_token: session.access_token, refresh_token: session.refresh_token } : {}) })
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
    sendEmail({ to: cleanEmail, ...welcomeEmail(shop_name, siteUrl()) }).catch(() => {})

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
