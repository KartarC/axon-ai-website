// GET    /api/jobs/:id  → single job
// PATCH  /api/jobs/:id  → update job
// DELETE /api/jobs/:id  → delete job
const { sb, requireAuth, requireModule, requireRole, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  const { id } = req.query

  // Verify job belongs to this account
  const rows = await sb('GET', `jobs?id=eq.${id}&account_id=eq.${ctx.account.id}&select=*,customers(id,name)`)
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Job not found' })
  const job = rows[0]

  // ── GET ──────────────────────────────────────────────────
  if (req.method === 'GET') return res.status(200).json(job)

  // ── PATCH ────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return

    const allowed = ['job_number','part_name','quantity','customer_id','material',
                     'due_date','priority','status','notes','revision']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' })

    const [updated] = await sb('PATCH', `jobs?id=eq.${id}`, updates)
    return res.status(200).json(updated)
  }

  // ── DELETE ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    await sb('DELETE', `jobs?id=eq.${id}`)
    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
