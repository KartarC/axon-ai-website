// Shared Supabase helpers for Vercel serverless functions
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  if (method === 'POST' || method === 'PUT') {
    headers['Prefer'] = 'return=representation'
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${err}`)
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
    `account_users?user_id=eq.${userId}&select=role,full_name,account_id,accounts(id,name,slug,plan,modules,status,timezone)`,
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
// Returns { user, role, account } or sends 401 and returns null
async function requireAuth(req, res) {
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

// ── Require Axon admin (ADMIN_SECRET header) ─────────────────
function requireAxonAdmin(req, res) {
  const secret = req.headers['x-admin-secret'] || req.query?.secret
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Axon admin access required' })
    return false
  }
  return true
}

// ── CORS helper ───────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Secret')
}

module.exports = { sb, authAdmin, validateToken, getAccountContext, requireAuth, requireModule, requireRole, requireAxonAdmin, cors }
