// GET  /api/axon-admin/accounts         → list all accounts
// POST /api/axon-admin/accounts         → create new account
// PATCH /api/axon-admin/accounts?id=X   → update account (plan, modules, status)
const { sb, requireAxonAdmin, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!requireAxonAdmin(req, res)) return

  // ── GET: list all accounts ───────────────────────────────
  if (req.method === 'GET') {
    const accounts = await sb('GET',
      'accounts?select=*,account_users(count)&order=created_at.desc'
    )
    return res.status(200).json(accounts || [])
  }

  // ── POST: create account ─────────────────────────────────
  if (req.method === 'POST') {
    const { name, plan = 'starter', modules = [], timezone = 'America/Toronto', notes } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name is required' })

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)

    // Check slug uniqueness, append random suffix if needed
    const existing = await sb('GET', `accounts?slug=eq.${slug}`)
    const finalSlug = (existing && existing.length > 0)
      ? `${slug}-${Math.random().toString(36).slice(2, 6)}`
      : slug

    const [account] = await sb('POST', 'accounts', {
      name,
      slug:     finalSlug,
      plan,
      modules,
      timezone,
      notes: notes || null,
    })

    return res.status(201).json(account)
  }

  // ── PATCH: update account ────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id query param required' })

    const allowed = ['name','plan','modules','status','timezone','notes']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' })

    const [updated] = await sb('PATCH', `accounts?id=eq.${id}`, updates)
    return res.status(200).json(updated)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
