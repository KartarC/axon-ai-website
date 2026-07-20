// api/settings.js — shop self-service settings (12th and FINAL serverless function on Hobby)
// All further endpoints must consolidate into existing files.
//
// ?resource=account   PATCH  → update shop name/timezone (owner/admin)
// ?resource=team      GET    → members + pending invites
// ?resource=invite    POST   → create invite, return shareable link (owner/admin)
// ?resource=invite    DELETE → revoke pending invite ?id=X (owner/admin)
// ?resource=member    DELETE → remove a member ?id=X (owner/admin; not self, not owners)
// ?resource=member    PATCH  → change a member's role ?id=X (owner only)
// ?resource=customers GET/POST/PATCH/DELETE → customers CRUD (write: owner/admin/manager)
const { sb, requireAuth, requireRole, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return

  const { resource, id } = req.query
  const accId = ctx.account.id

  // ── ACCOUNT ──────────────────────────────────────────────
  if (resource === 'account' && req.method === 'PATCH') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    const allowed = ['name','timezone']
    const updates = {}
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
    if (updates.name !== undefined && !String(updates.name).trim()) return res.status(400).json({ error: 'Shop name cannot be empty' })
    const [updated] = await sb('PATCH', `accounts?id=eq.${accId}`, updates)
    return res.status(200).json(updated)
  }

  // ── TEAM ─────────────────────────────────────────────────
  if (resource === 'team' && req.method === 'GET') {
    const members = await sb('GET',
      `account_users?account_id=eq.${accId}&select=id,user_id,role,full_name,created_at&order=created_at.asc`)
    const invites = await sb('GET',
      `account_invites?account_id=eq.${accId}&accepted_at=is.null&select=id,email,role,token,expires_at,created_at&order=created_at.desc`)
    // Only surface unexpired invites
    const now = new Date()
    const pending = (invites || []).filter(i => !i.expires_at || new Date(i.expires_at) > now)
    return res.status(200).json({ members: members || [], invites: pending, my_user_id: ctx.user.id })
  }

  // ── INVITE: create (returns link — owner shares it) ──────
  if (resource === 'invite' && req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    const { email, role = 'operator' } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email required' })
    const validRoles = ['admin','manager','operator','viewer']
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'role must be admin, manager, operator, or viewer' })
    const cleanEmail = String(email).trim().toLowerCase()

    // Already a member?
    const existing = await sb('GET',
      `account_users?account_id=eq.${accId}&select=id,user_id`)
    // (membership is keyed by user_id; cheap check via invites instead)
    const dupInvite = await sb('GET',
      `account_invites?account_id=eq.${accId}&email=eq.${encodeURIComponent(cleanEmail)}&accepted_at=is.null&select=id,token,expires_at`)
    let invite = (dupInvite || []).find(i => !i.expires_at || new Date(i.expires_at) > new Date())
    if (!invite) {
      ;[invite] = await sb('POST', 'account_invites', { account_id: accId, email: cleanEmail, role })
    }

    const proto = req.headers['x-forwarded-proto'] || 'https'
    const host  = req.headers['x-forwarded-host'] || req.headers.host
    const invite_url = `${proto}://${host}/app/accept-invite.html?token=${invite.token}`
    return res.status(201).json({ ok: true, invite_url, email: cleanEmail, role })
  }

  // ── INVITE: revoke ───────────────────────────────────────
  if (resource === 'invite' && req.method === 'DELETE' && id) {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    await sb('DELETE', `account_invites?id=eq.${id}&account_id=eq.${accId}`)
    return res.status(200).json({ ok: true })
  }

  // ── MEMBER: change role ──────────────────────────────────
  if (resource === 'member' && req.method === 'PATCH' && id) {
    if (!requireRole(ctx, ['owner'], res)) return
    const { role } = req.body || {}
    const validRoles = ['admin','manager','operator','viewer']
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    const rows = await sb('GET', `account_users?id=eq.${id}&account_id=eq.${accId}`)
    if (!rows?.length) return res.status(404).json({ error: 'Member not found' })
    if (rows[0].role === 'owner') return res.status(400).json({ error: 'Cannot change the owner role' })
    const [updated] = await sb('PATCH', `account_users?id=eq.${id}`, { role })
    return res.status(200).json(updated)
  }

  // ── MEMBER: remove ───────────────────────────────────────
  if (resource === 'member' && req.method === 'DELETE' && id) {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    const rows = await sb('GET', `account_users?id=eq.${id}&account_id=eq.${accId}`)
    if (!rows?.length) return res.status(404).json({ error: 'Member not found' })
    if (rows[0].user_id === ctx.user.id) return res.status(400).json({ error: 'You cannot remove yourself' })
    if (rows[0].role === 'owner')        return res.status(400).json({ error: 'Cannot remove the shop owner' })
    await sb('DELETE', `account_users?id=eq.${id}&account_id=eq.${accId}`)
    return res.status(200).json({ ok: true })
  }

  // ── CUSTOMERS CRUD ───────────────────────────────────────
  if (resource === 'customers') {
    if (req.method === 'GET') {
      const customers = await sb('GET',
        `customers?account_id=eq.${accId}&order=name.asc&select=*,jobs(id)`)
      return res.status(200).json((customers || []).map(c => ({
        id: c.id, name: c.name, contact_name: c.contact_name,
        email: c.email, phone: c.phone, notes: c.notes,
        job_count: (c.jobs || []).length,
      })))
    }
    if (req.method === 'POST') {
      if (!requireRole(ctx, ['owner','admin','manager'], res)) return
      const { name, contact_name, email, phone, notes } = req.body || {}
      if (!name?.trim()) return res.status(400).json({ error: 'Customer name required' })
      const [customer] = await sb('POST', 'customers', {
        account_id: accId, name: name.trim(),
        contact_name: contact_name || null, email: email || null,
        phone: phone || null, notes: notes || null,
      })
      return res.status(201).json(customer)
    }
    if (req.method === 'PATCH' && id) {
      if (!requireRole(ctx, ['owner','admin','manager'], res)) return
      const allowed = ['name','contact_name','email','phone','notes']
      const updates = {}
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
      const [updated] = await sb('PATCH', `customers?id=eq.${id}&account_id=eq.${accId}`, updates)
      return res.status(200).json(updated)
    }
    if (req.method === 'DELETE' && id) {
      if (!requireRole(ctx, ['owner','admin'], res)) return
      const jobs = await sb('GET', `jobs?customer_id=eq.${id}&account_id=eq.${accId}&select=id&limit=1`)
      if (jobs?.length) return res.status(409).json({ error: 'This customer has jobs — reassign or delete those first.' })
      await sb('DELETE', `customers?id=eq.${id}&account_id=eq.${accId}`)
      return res.status(200).json({ ok: true })
    }
  }

  res.status(400).json({ error: 'Unknown resource or method' })
}
