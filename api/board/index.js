// GET  /api/board  → all board entries for account (with job + machine data)
// POST /api/board  → create board entry for a job
const { sb, requireAuth, requireModule, requireRole, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  // ── GET: full board state ────────────────────────────────
  if (req.method === 'GET') {
    const entries = await sb('GET',
      `board_entries?account_id=eq.${ctx.account.id}` +
      `&select=*,jobs(id,job_number,part_name,quantity,due_date,priority,status,public_token,customers(id,name)),machines(id,name,machine_no)` +
      `&order=sort_order.asc`
    )
    return res.status(200).json(entries || [])
  }

  // ── POST: add job to board ───────────────────────────────
  if (req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return

    const {
      job_id, machine_id, operation = 'Machining',
      op_sequence = 1, board_col = 'queue',
      est_hours, notes,
    } = req.body || {}

    if (!job_id) return res.status(400).json({ error: 'job_id is required' })

    // Verify job belongs to this account
    const jobs = await sb('GET', `jobs?id=eq.${job_id}&account_id=eq.${ctx.account.id}`)
    if (!jobs || jobs.length === 0) return res.status(404).json({ error: 'Job not found' })

    const [entry] = await sb('POST', 'board_entries', {
      account_id:  ctx.account.id,
      job_id,
      machine_id:  machine_id || null,
      operation:   operation.trim(),
      op_sequence,
      board_col,
      status:      board_col,
      sort_order:  Date.now(),
      est_hours:   est_hours || null,
      notes:       notes || null,
    })

    return res.status(201).json(entry)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
