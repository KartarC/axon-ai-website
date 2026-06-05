// api/board.js — consolidated production board handler
// GET    (no id, no action) → list all board entries
// POST   (no id, no action) → create board entry
// PATCH  ?id=X              → update entry (status, machine, notes)
// POST   ?action=move       → { id, board_col, machine_id, sort_order } atomic move
const { sb, requireAuth, requireModule, requireRole, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  const { id, action } = req.query

  // ── GET: full board state ────────────────────────────────
  if (req.method === 'GET' && !id) {
    const entries = await sb('GET',
      `board_entries?account_id=eq.${ctx.account.id}` +
      `&select=*,jobs(id,job_number,part_name,quantity,due_date,priority,status,public_token,customers(id,name)),machines(id,name,machine_no)` +
      `&order=sort_order.asc`
    )
    return res.status(200).json(entries || [])
  }

  // ── POST: create entry ───────────────────────────────────
  if (req.method === 'POST' && !action) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { job_id, machine_id, operation = 'Machining', op_sequence = 1, board_col = 'queue', est_hours, notes } = req.body || {}
    if (!job_id) return res.status(400).json({ error: 'job_id required' })

    const jobs = await sb('GET', `jobs?id=eq.${job_id}&account_id=eq.${ctx.account.id}`)
    if (!jobs?.length) return res.status(404).json({ error: 'Job not found' })

    const [entry] = await sb('POST', 'board_entries', {
      account_id: ctx.account.id, job_id,
      machine_id: machine_id || null, operation: operation.trim(),
      op_sequence, board_col, status: board_col,
      sort_order: Date.now(), est_hours: est_hours || null, notes: notes || null,
    })
    return res.status(201).json(entry)
  }

  // ── PATCH: update entry (?id=X) ──────────────────────────
  if (req.method === 'PATCH' && id) {
    const rows = await sb('GET', `board_entries?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    if (!rows?.length) return res.status(404).json({ error: 'Entry not found' })

    const allowed = ['status','board_col','machine_id','operation','est_hours','actual_hours','notes','sort_order']
    const updates = {}
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }

    if (updates.board_col && !updates.status) updates.status = updates.board_col
    if (updates.status && !updates.board_col) updates.board_col = updates.status === 'paused' ? 'running' : updates.status
    if (updates.status === 'running' && !rows[0].started_at) updates.started_at = new Date().toISOString()
    if (updates.status === 'complete') updates.completed_at = new Date().toISOString()

    const [updated] = await sb('PATCH', `board_entries?id=eq.${id}`, updates)
    return res.status(200).json(updated)
  }

  // ── POST ?action=move: atomic card move ──────────────────
  if (req.method === 'POST' && action === 'move') {
    const { id: entryId, board_col, machine_id, sort_order } = req.body || {}
    if (!entryId || !board_col) return res.status(400).json({ error: 'id and board_col required' })
    if (!['queue','setup','running','complete'].includes(board_col)) return res.status(400).json({ error: 'Invalid board_col' })

    const rows = await sb('GET', `board_entries?id=eq.${entryId}&account_id=eq.${ctx.account.id}`)
    if (!rows?.length) return res.status(404).json({ error: 'Entry not found' })

    const updates = {
      board_col, status: board_col,
      machine_id: machine_id !== undefined ? machine_id : rows[0].machine_id,
      sort_order:  sort_order !== undefined ? sort_order  : rows[0].sort_order,
    }
    if (board_col === 'running' && !rows[0].started_at) updates.started_at = new Date().toISOString()
    if (board_col === 'complete') updates.completed_at = new Date().toISOString()

    const [updated] = await sb('PATCH', `board_entries?id=eq.${entryId}`, updates)
    return res.status(200).json(updated)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
