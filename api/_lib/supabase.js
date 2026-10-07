// Shared Supabase helpers for Vercel serverless functions
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const { validateIds, isUuid, secretMatches } = require('./security')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
}

// ── Raw REST request (service role — bypasses RLS) ──────────
async function sb(method, path, body, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const headers = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation'
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Database request failed (${res.status})`)
    throw new Error('Database request failed')
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── Auth Admin API ───────────────────────────────────────────
async function authAdmin(method, path, body) {
  const url = `${SUPABASE_URL}/auth/v1/admin/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Auth Admin ${method} ${path} → ${res.status}: ${err}`)
  }
  return res.json()
}

// ── Validate JWT and return auth.users record ────────────────
async function validateToken(token) {
  if (!token) return null
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SERVICE_KEY,
    },
  })
  if (!res.ok) return null
  return res.json()
}

// ── Get account context for a user ──────────────────────────
async function getAccountContext(userId) {
  const rows = await sb(
    'GET',
    `account_users?user_id=eq.${userId}&select=role,full_name,account_id,accounts(id,name,slug,plan,modules,status,timezone,trial_ends_at,onboarded,stripe_customer_id,stripe_subscription_id,billing_status,billing_period_end,billing_cancel_at_period_end)`,
  )
  if (!rows || rows.length === 0) return null
  const row = rows[0]
  return {
    role:      row.role,
    full_name: row.full_name,
    account:   row.accounts,
  }
}

// ── Require auth middleware ───────────────────────────────────
// Returns { user, role, account } or sends 401/402/403 and returns null.
// opts.allowExpired: skip the trial-expiry gate (used by billing + session endpoints)
async function requireAuth(req, res, opts = {}) {
  if (!validateIds(req, res)) return null
  res.setHeader('Cache-Control', 'no-store')
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return null
  }
  const user = await validateToken(token)
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  const ctx = await getAccountContext(user.id)
  if (!ctx || !ctx.account) {
    res.status(403).json({ error: 'No account found for this user' })
    return null
  }
  if (ctx.account.status !== 'active') {
    res.status(403).json({ error: 'Account suspended' })
    return null
  }
  // Billing failures restrict operations, while owners can still reach payment recovery.
  if (!opts.allowExpired && ctx.account.billing_status && !['active','trialing'].includes(ctx.account.billing_status)) {
    res.status(402).json({error:'Your subscription needs attention. Open billing to continue.',code:'billing_required'})
    return null
  }
  // Trial-expiry gate: expired trials get 402 so the frontend routes to billing
  if (!opts.allowExpired && ctx.account.plan === 'trial' && ctx.account.trial_ends_at) {
    const today = new Date().toISOString().slice(0, 10)
    if (ctx.account.trial_ends_at < today) {
      res.status(402).json({ error: 'Your free trial has ended — choose a plan to continue.', code: 'trial_expired' })
      return null
    }
  }
  return { user, role: ctx.role, account: ctx.account, full_name: ctx.full_name }
}

// ── Require module access ────────────────────────────────────
function requireModule(ctx, slug, res) {
  if (!ctx.account.modules.includes(slug)) {
    res.status(403).json({ error: `Module '${slug}' not enabled for this account` })
    return false
  }
  return true
}

// ── Require role ─────────────────────────────────────────────
function requireRole(ctx, roles, res) {
  if (!roles.includes(ctx.role)) {
    res.status(403).json({ error: `Role '${ctx.role}' cannot perform this action` })
    return false
  }
  return true
}

// Internal access requires a verified identity, a live session and an active staff record.
async function requireAxonAdmin(req, res) {
  if (!validateIds(req, res)) return null
  res.setHeader('Cache-Control', 'no-store')
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  if (!token) { res.status(401).json({error:'Sign in with your staff account'}); return null }
  try {
    const user = await validateToken(token)
    if (!user?.id || !user.email_confirmed_at) { res.status(401).json({error:'Your session has expired. Please sign in again.'}); return null }
    // The token has been verified by Auth before its session identifier is used.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    if (!isUuid(claims.session_id)) { res.status(401).json({error:'Please sign in again'}); return null }
    const active = await sb('POST', 'rpc/ovrendi_internal_session_valid', {p_user_id:user.id,p_session_id:claims.session_id})
    if (active !== true) { res.status(403).json({error:'This account is not approved for the internal workspace, or its session has ended.'}); return null }
    return user
  } catch (_) { res.status(503).json({error:'Could not verify staff access. Please try again.'}); return null }
}

// ── CORS helper ───────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Secret')
}

async function requireRecord(ctx, table, id, res) {
  if (!isUuid(id)) { res.status(400).json({ error: 'Invalid record ID' }); return null }
  const rows = await sb('GET', `${table}?id=eq.${id}&account_id=eq.${ctx.account.id}&select=*`)
  if (!rows?.length) { res.status(404).json({ error: 'Record not found' }); return null }
  return rows[0]
}

module.exports = { sb, authAdmin, validateToken, getAccountContext, requireAuth, requireModule, requireRole, requireRecord, requireAxonAdmin, cors }
