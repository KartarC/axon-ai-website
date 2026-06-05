// api/operator.js — public QR operator endpoint (no auth required)
// GET  ?token=X → return job + board entry data + traveler steps
// POST ?token=X → { action: 'start'|'pause'|'complete'|'complete_step' }
const { sb, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Token required' })

  const jobs = await sb('GET',
    `jobs?public_token=eq.${token}&select=id,job_number,part_name,quantity,material,due_date,priority,status,notes,revision,customers(name),account_id`
  )
  if (!jobs?.length) return res.status(404).json({ error: 'Job not found. This QR code may be invalid or expired.' })
  const job = jobs[0]

  const entries = await sb('GET',
    `board_entries?job_id=eq.${job.id}&order=op_sequence.asc&select=id,operation,op_sequence,status,board_col,est_hours,notes,machines(name,machine_no)`
  )
  const currentEntry = entries?.find(e => ['queue','setup','running','paused'].includes(e.status)) || entries?.[entries.length - 1]

  // Fetch traveler steps (if any)
  const travelerSteps = await sb('GET',
    `traveler_steps?job_id=eq.${job.id}&order=sort_order.asc,step_number.asc` +
    `&select=id,step_number,title,instructions,status,requires_dimension,dimension_label,dimension_unit,dimension_value,flag_note,completed_at`
  )
  const currentTravelerStep = travelerSteps?.find(s => ['pending','in_progress'].includes(s.status)) || null

  // ── GET: return sanitized job data ───────────────────────
  if (req.method === 'GET') {
    return res.status(200).json({
      job: {
        job_number: job.job_number, part_name:  job.part_name,
        quantity:   job.quantity,   material:   job.material,
        due_date:   job.due_date,   priority:   job.priority,
        status:     job.status,     notes:      job.notes,
        revision:   job.revision,   customer:   job.customers?.name || null,
      },
      current_entry: currentEntry ? {
        id:        currentEntry.id,  operation: currentEntry.operation,
        status:    currentEntry.status, est_hours: currentEntry.est_hours,
        notes:     currentEntry.notes,
        machine:   currentEntry.machines ? `${currentEntry.machines.name}${currentEntry.machines.machine_no ? ` (${currentEntry.machines.machine_no})` : ''}` : null,
      } : null,
      all_steps: (entries || []).map(e => ({
        op_sequence: e.op_sequence, operation: e.operation,
        status:      e.status,      machine:   e.machines?.name || null,
      })),
      traveler: {
        steps:        (travelerSteps || []),
        current_step: currentTravelerStep,
        total:        (travelerSteps || []).length,
        done:         (travelerSteps || []).filter(s => s.status === 'complete').length,
      },
    })
  }

  // ── POST: operator status update ─────────────────────────
  if (req.method === 'POST') {
    const { action, entry_id } = req.body || {}
    // ── Traveler step completion (no board action needed) ────
    if (action === 'complete_step') {
      const { step_id, dimension_value, flag_note, flag } = req.body || {}
      if (!step_id) return res.status(400).json({ error: 'step_id required' })

      const stepRows = await sb('GET', `traveler_steps?id=eq.${step_id}&job_id=eq.${job.id}`)
      if (!stepRows?.length) return res.status(404).json({ error: 'Step not found' })

      const updates = {
        status:          flag ? 'flagged' : 'complete',
        completed_at:    new Date().toISOString(),
        dimension_value: dimension_value || null,
        flag_note:       flag_note || null,
      }
      await sb('PATCH', `traveler_steps?id=eq.${step_id}`, updates)
      return res.status(200).json({ ok: true, status: updates.status })
    }

    const validActions = ['start','pause','complete']
    if (!action || !validActions.includes(action)) return res.status(400).json({ error: 'action must be start, pause, complete, or complete_step' })

    const targetId = entry_id || currentEntry?.id
    if (!targetId) return res.status(404).json({ error: 'No active board entry found for this job' })

    const statusMap = { start: 'running', pause: 'paused', complete: 'complete' }
    const newStatus = statusMap[action]
    const updates = { status: newStatus, board_col: newStatus === 'paused' ? 'running' : newStatus }
    if (action === 'start')    updates.started_at    = new Date().toISOString()
    if (action === 'complete') updates.completed_at  = new Date().toISOString()

    await sb('PATCH', `board_entries?id=eq.${targetId}&account_id=eq.${job.account_id}`, updates)

    if (action === 'complete') {
      const remaining = (entries || []).filter(e => e.id !== targetId && e.status !== 'complete')
      if (remaining.length === 0) await sb('PATCH', `jobs?id=eq.${job.id}`, { status: 'complete' })
    }

    return res.status(200).json({ ok: true, new_status: newStatus })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
