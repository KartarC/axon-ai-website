// api/traveler.js — Shop Traveler module (10th serverless function)
// GET  ?job_id=X               → all steps for a job
// GET  ?action=templates        → list templates for account
// POST ?action=template         → create template + steps
// POST ?action=apply            → apply template to job { template_id, job_id }
// POST (no action)              → create single step { job_id, title, ... }
// PATCH ?id=X                   → update step (status, dimension_value, notes, flag)
// DELETE ?id=X                  → delete step
// POST ?action=reorder          → { job_id, order: [id, id, ...] }
const { sb, requireAuth, requireModule, requireRole, cors } = require('./_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'shop-traveler', res)) return

  const { action, id, job_id } = req.query

  // ── GET steps for a job ─────────────────────────────────
  if (req.method === 'GET' && job_id) {
    const steps = await sb('GET',
      `traveler_steps?job_id=eq.${job_id}&account_id=eq.${ctx.account.id}&order=sort_order.asc,step_number.asc`
    )
    // Also get job info
    const jobs = await sb('GET', `jobs?id=eq.${job_id}&account_id=eq.${ctx.account.id}&select=*,customers(name)`)
    return res.status(200).json({ job: jobs?.[0] || null, steps: steps || [] })
  }

  // ── GET templates ────────────────────────────────────────
  if (req.method === 'GET' && action === 'templates') {
    const templates = await sb('GET',
      `traveler_templates?account_id=eq.${ctx.account.id}&order=created_at.desc` +
      `&select=*,traveler_template_steps(*)`
    )
    return res.status(200).json(templates || [])
  }

  // ── GET jobs with traveler summary ──────────────────────
  if (req.method === 'GET' && !job_id && !action) {
    const jobs = await sb('GET',
      `jobs?account_id=eq.${ctx.account.id}&status=not.eq.cancelled&order=created_at.desc` +
      `&select=id,job_number,part_name,due_date,priority,status,customers(name),` +
      `traveler_steps(id,status)`
    )
    const result = (jobs || []).map(j => {
      const steps    = j.traveler_steps || []
      const total    = steps.length
      const done     = steps.filter(s => s.status === 'complete').length
      const flagged  = steps.filter(s => s.status === 'flagged').length
      return {
        id: j.id, job_number: j.job_number, part_name: j.part_name,
        due_date: j.due_date, priority: j.priority, status: j.status,
        customer: j.customers?.name || null,
        traveler: { total, done, flagged, has_traveler: total > 0 },
      }
    })
    return res.status(200).json(result)
  }

  // ── POST create template ─────────────────────────────────
  if (req.method === 'POST' && action === 'template') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { name, description, steps = [] } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })

    const [tmpl] = await sb('POST', 'traveler_templates', { account_id: ctx.account.id, name, description: description || null })

    if (steps.length) {
      const stepRows = steps.map((s, i) => ({
        template_id:        tmpl.id,
        step_number:        i + 1,
        title:              s.title,
        instructions:       s.instructions || null,
        requires_dimension: s.requires_dimension || false,
        dimension_label:    s.dimension_label || null,
        dimension_unit:     s.dimension_unit || 'in',
        requires_sign_off:  s.requires_sign_off || false,
        sort_order:         i + 1,
      }))
      await sb('POST', 'traveler_template_steps', stepRows)
    }
    return res.status(201).json(tmpl)
  }

  // ── POST apply template to job ───────────────────────────
  if (req.method === 'POST' && action === 'apply') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { template_id, job_id: jid } = req.body || {}
    if (!template_id || !jid) return res.status(400).json({ error: 'template_id and job_id required' })

    // Verify job belongs to account
    const jobs = await sb('GET', `jobs?id=eq.${jid}&account_id=eq.${ctx.account.id}`)
    if (!jobs?.length) return res.status(404).json({ error: 'Job not found' })

    // Get template steps
    const tSteps = await sb('GET', `traveler_template_steps?template_id=eq.${template_id}&order=sort_order.asc`)
    if (!tSteps?.length) return res.status(400).json({ error: 'Template has no steps' })

    // Get current max step number for this job
    const existing = await sb('GET', `traveler_steps?job_id=eq.${jid}&account_id=eq.${ctx.account.id}&select=step_number&order=step_number.desc&limit=1`)
    const offset = existing?.[0]?.step_number || 0

    const stepRows = tSteps.map((s, i) => ({
      account_id:         ctx.account.id,
      job_id:             jid,
      step_number:        offset + i + 1,
      title:              s.title,
      instructions:       s.instructions,
      requires_dimension: s.requires_dimension,
      dimension_label:    s.dimension_label,
      dimension_unit:     s.dimension_unit,
      requires_sign_off:  s.requires_sign_off,
      sort_order:         offset + i + 1,
    }))

    const created = await sb('POST', 'traveler_steps', stepRows)
    return res.status(201).json(created)
  }

  // ── POST create single step ──────────────────────────────
  if (req.method === 'POST' && !action) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { job_id: jid, title, instructions, requires_dimension, dimension_label, dimension_unit = 'in', requires_sign_off, sort_order } = req.body || {}
    if (!jid || !title) return res.status(400).json({ error: 'job_id and title required' })

    const existing = await sb('GET', `traveler_steps?job_id=eq.${jid}&account_id=eq.${ctx.account.id}&select=step_number&order=step_number.desc&limit=1`)
    const nextNum  = (existing?.[0]?.step_number || 0) + 1

    const [step] = await sb('POST', 'traveler_steps', {
      account_id: ctx.account.id,
      job_id:     jid,
      step_number: sort_order || nextNum,
      title, instructions: instructions || null,
      requires_dimension: requires_dimension || false,
      dimension_label:    dimension_label || null,
      dimension_unit,
      requires_sign_off:  requires_sign_off || false,
      sort_order:         sort_order || nextNum,
    })
    return res.status(201).json(step)
  }

  // ── PATCH update step ────────────────────────────────────
  if (req.method === 'PATCH' && id) {
    const rows = await sb('GET', `traveler_steps?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    if (!rows?.length) return res.status(404).json({ error: 'Step not found' })

    const allowed = ['status','dimension_value','notes','flag_note','title','instructions',
                     'requires_dimension','dimension_label','requires_sign_off']
    const updates = {}
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }

    if (updates.status === 'complete' && !rows[0].completed_at) {
      updates.completed_at = new Date().toISOString()
    }
    if (updates.status === 'complete' && req.body.sign_off) {
      updates.signed_off_by = ctx.user.id
      updates.signed_off_at = new Date().toISOString()
    }

    const [updated] = await sb('PATCH', `traveler_steps?id=eq.${id}`, updates)
    return res.status(200).json(updated)
  }

  // ── DELETE step ──────────────────────────────────────────
  if (req.method === 'DELETE' && id) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    await sb('DELETE', `traveler_steps?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
