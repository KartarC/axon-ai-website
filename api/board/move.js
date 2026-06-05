// POST /api/board/move
// Atomically move a card: update board_col + machine_id + sort_order
const { sb, requireAuth, requireModule, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  const { id, board_col, machine_id, sort_order } = req.body || {}
  if (!id || !board_col) return res.status(400).json({ error: 'id and board_col required' })

  const validCols = ['queue','setup','running','complete']
  if (!validCols.includes(board_col)) return res.status(400).json({ error: 'Invalid board_col' })

  // Verify ownership
  const rows = await sb('GET', `board_entries?id=eq.${id}&account_id=eq.${ctx.account.id}`)
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Entry not found' })

  const updates = {
    board_col,
    status: board_col,
    machine_id: machine_id !== undefined ? machine_id : rows[0].machine_id,
    sort_order: sort_order !== undefined ? sort_order : rows[0].sort_order,
  }

  // Auto-set timestamps
  if (board_col === 'running' && !rows[0].started_at) {
    updates.started_at = new Date().toISOString()
  }
  if (board_col === 'complete') {
    updates.completed_at = new Date().toISOString()
  }

  const [updated] = await sb('PATCH', `board_entries?id=eq.${id}`, updates)
  res.status(200).json(updated)
}
