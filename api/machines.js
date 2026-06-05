// api/machines.js — consolidated machine handler
// GET    → list machines
// POST   → create machine
// PATCH  ?id=X → update
// DELETE ?id=X → delete
const { sb, requireAuth, requireRole, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const ctx = await requireAuth(req, res)
  if (!ctx) return

  const { id } = req.query

  if (req.method === 'GET') {
    const machines = await sb('GET', `machines?account_id=eq.${ctx.account.id}&order=sort_order.asc,name.asc`)
    return res.status(200).json(machines || [])
  }

  if (req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { name, machine_no, type = 'mill', sort_order = 0 } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const [machine] = await sb('POST', 'machines', { account_id: ctx.account.id, name: name.trim(), machine_no: machine_no || null, type, sort_order })
    return res.status(201).json(machine)
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'id required' })
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const allowed = ['name','machine_no','type','status','sort_order']
    const updates = {}
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
    const [updated] = await sb('PATCH', `machines?id=eq.${id}&account_id=eq.${ctx.account.id}`, updates)
    return res.status(200).json(updated)
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' })
    if (!requireRole(ctx, ['owner','admin'], res)) return
    await sb('DELETE', `machines?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
