// PATCH /api/board/:id  → update board entry (status, notes, machine, hours)
const { sb, requireAuth, requireModule, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'production-board', res)) return

  const { id } = req.query

  // Verify entry belongs to this account
  const rows = await sb('GET', `board_entries?id=eq.${id}&account_id=eq.${ctx.account.id}`)
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Entry not found' })

  const allowed = ['status','board_col','machine_id','operation','est_hours','actual_hours','notes','sort_order']
  const updates = {}
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k]
  }

  // Sync status/board_col
  if (updates.board_col && !updates.status) updates.status = updates.board_col
  if (updates.status && !updates.board_col) updates.board_col = updates.status === 'paused' ? 'running' : updates.status

  // Set timestamps
  if (updates.status === 'running' && !rows[0].started_at) {
    updates.started_at = new Date().toISOString()
  }
  if (updates.status === 'complete') {
    updates.completed_at = new Date().toISOString()
  }

  const [updated] = await sb('PATCH', `board_entries?id=eq.${id}`, updates)
  res.status(200).json(updated)
}
