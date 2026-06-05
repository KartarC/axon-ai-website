// api/jobs.js — consolidated job handler
// GET    (no id)  → list jobs
// POST   (no id)  → create job
// GET    ?id=X    → single job
// PATCH  ?id=X    → update job
// DELETE ?id=X    → delete job
const { sb, requireAuth, requireModule, requireRole, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  const { id, status, search } = req.query

  // ── Single job routes (?id=X) ────────────────────────────
  if (id) {
    const rows = await sb('GET', `jobs?id=eq.${id}&account_id=eq.${ctx.account.id}&select=*,customers(id,name)`)
    if (!rows?.length) return res.status(404).json({ error: 'Job not found' })
    const job = rows[0]

    if (req.method === 'GET') return res.status(200).json(job)

    if (req.method === 'PATCH') {
      if (!requireRole(ctx, ['owner','admin','manager'], res)) return
      const allowed = ['job_number','part_name','quantity','customer_id','material','due_date','priority','status','notes','revision']
      const updates = {}
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
      const [updated] = await sb('PATCH', `jobs?id=eq.${id}`, updates)
      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      if (!requireRole(ctx, ['owner','admin'], res)) return
      await sb('DELETE', `jobs?id=eq.${id}`)
      return res.status(200).json({ ok: true })
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── List / create ────────────────────────────────────────
  if (req.method === 'GET') {
    let query = `jobs?account_id=eq.${ctx.account.id}&order=created_at.desc&select=*,customers(id,name)`
    if (status && status !== 'all') query += `&status=eq.${status}`
    let jobs = await sb('GET', query)
    if (search) {
      const q = search.toLowerCase()
      jobs = (jobs || []).filter(j =>
        j.job_number.toLowerCase().includes(q) ||
        j.part_name.toLowerCase().includes(q) ||
        j.customers?.name?.toLowerCase().includes(q)
      )
    }
    return res.status(200).json(jobs || [])
  }

  if (req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { job_number, part_name, quantity = 1, customer_id, material, due_date, priority = 'normal', notes, revision } = req.body || {}
    if (!job_number) return res.status(400).json({ error: 'job_number required' })
    if (!part_name)  return res.status(400).json({ error: 'part_name required' })
    const [job] = await sb('POST', 'jobs', {
      account_id: ctx.account.id,
      job_number: job_number.trim(), part_name: part_name.trim(),
      quantity, customer_id: customer_id || null,
      material: material || null, due_date: due_date || null,
      priority, notes: notes || null, revision: revision || null,
      created_by: ctx.user.id,
    })
    return res.status(201).json(job)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
