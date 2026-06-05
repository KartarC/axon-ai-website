// GET  /api/jobs          → list jobs for account
// POST /api/jobs          → create job
const { sb, requireAuth, requireModule, requireRole, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  // ── GET: list jobs ───────────────────────────────────────
  if (req.method === 'GET') {
    const { status, search } = req.query
    let query = `jobs?account_id=eq.${ctx.account.id}&order=created_at.desc&select=*,customers(id,name)`

    if (status && status !== 'all') query += `&status=eq.${status}`

    let jobs = await sb('GET', query)

    // Client-side search filter
    if (search) {
      const q = search.toLowerCase()
      jobs = jobs.filter(j =>
        j.job_number.toLowerCase().includes(q) ||
        j.part_name.toLowerCase().includes(q) ||
        j.customers?.name?.toLowerCase().includes(q)
      )
    }

    return res.status(200).json(jobs || [])
  }

  // ── POST: create job ─────────────────────────────────────
  if (req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return

    const {
      job_number, part_name, quantity = 1,
      customer_id, material, due_date,
      priority = 'normal', notes, revision,
    } = req.body || {}

    if (!job_number) return res.status(400).json({ error: 'job_number is required' })
    if (!part_name)  return res.status(400).json({ error: 'part_name is required' })

    const [job] = await sb('POST', 'jobs', {
      account_id:  ctx.account.id,
      job_number:  job_number.trim(),
      part_name:   part_name.trim(),
      quantity,
      customer_id: customer_id || null,
      material:    material || null,
      due_date:    due_date || null,
      priority,
      notes:       notes || null,
      revision:    revision || null,
      created_by:  ctx.user.id,
    })

    return res.status(201).json(job)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
