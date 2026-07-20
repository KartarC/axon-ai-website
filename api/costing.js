// api/costing.js — Job Costing module
// GET  ?action=summary            → all jobs with costing totals for account
// GET  ?job_id=X                  → quote + cost entries for one job
// POST (no action)                → create manual cost entry
// PATCH ?id=X                     → update cost entry
// DELETE ?id=X                    → delete cost entry
// POST ?action=quote              → set/update job quote
// POST ?action=auto-log           → auto-log labor from completed board entry
const { sb, requireAuth, requireModule, requireRole, cors } = require('./_lib/supabase')
const { sendEmail, getOwnerEmail, overBudgetEmail } = require('./_lib/email')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'job-costing', res)) return

  const { action, id, job_id } = req.query

  // ── GET summary: all jobs with costing totals ───────────
  if (req.method === 'GET' && action === 'summary') {
    const jobs = await sb('GET',
      `jobs?account_id=eq.${ctx.account.id}&status=not.eq.cancelled&order=created_at.desc` +
      `&select=id,job_number,part_name,due_date,priority,status,customers(name),` +
      `job_quotes(quoted_price,target_margin),` +
      `job_cost_entries(total_cost,type)`
    )
    // Aggregate cost totals per job
    const result = (jobs || []).map(j => {
      const entries  = j.job_cost_entries || []
      const actual   = entries.reduce((sum, e) => sum + parseFloat(e.total_cost || 0), 0)
      const quoted   = parseFloat(j.job_quotes?.[0]?.quoted_price || 0)
      const target   = parseFloat(j.job_quotes?.[0]?.target_margin || 0)
      const variance = quoted > 0 ? actual - (quoted * (1 - target / 100)) : null
      const margin   = quoted > 0 ? ((quoted - actual) / quoted) * 100 : null

      // ── Budget alert ────────────────────────────────────────
      // null  = no quote set
      // 'ok'  = within budget
      // 'at_risk' = actual ≥ 80% of cost allowance (still completable, but manager should act)
      // 'over'    = actual ≥ quoted price (costs have consumed the entire quote)
      let budget_alert = null
      if (j.job_quotes?.length && !['complete','cancelled','shipped'].includes(j.status)) {
        const targetCost = quoted * (1 - target / 100)   // max allowed cost
        if (actual >= quoted)                              budget_alert = 'over'
        else if (targetCost > 0 && actual >= targetCost * 0.80) budget_alert = 'at_risk'
        else                                               budget_alert = 'ok'
      }

      return {
        id:            j.id,
        job_number:    j.job_number,
        part_name:     j.part_name,
        due_date:      j.due_date,
        priority:      j.priority,
        status:        j.status,
        customer:      j.customers?.name || null,
        quoted_price:  quoted,
        actual_cost:   Math.round(actual * 100) / 100,
        variance:      variance !== null ? Math.round(variance * 100) / 100 : null,
        margin_pct:    margin   !== null ? Math.round(margin   * 100) / 100 : null,
        target_margin: target,
        has_quote:     !!j.job_quotes?.length,
        budget_alert,
        cost_by_type: {
          labor:    entries.filter(e => e.type === 'labor').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
          material: entries.filter(e => e.type === 'material').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
          outside:  entries.filter(e => e.type === 'outside').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
          overhead: entries.filter(e => e.type === 'overhead').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
        },
      }
    })
    return res.status(200).json(result)
  }

  // ── GET single job costing ───────────────────────────────
  if (req.method === 'GET' && job_id) {
    const [quote] = await sb('GET', `job_quotes?job_id=eq.${job_id}&account_id=eq.${ctx.account.id}`) || [null]
    const entries  = await sb('GET',
      `job_cost_entries?job_id=eq.${job_id}&account_id=eq.${ctx.account.id}&order=recorded_at.asc` +
      `&select=*,board_entries(operation,machines(name))`
    )
    return res.status(200).json({ quote: quote || null, entries: entries || [] })
  }

  // ── POST ?action=quote: set job quote ────────────────────
  if (req.method === 'POST' && action === 'quote') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { job_id: jid, quoted_price, target_margin = 40, notes } = req.body || {}
    if (!jid || !quoted_price) return res.status(400).json({ error: 'job_id and quoted_price required' })

    // Verify job belongs to account
    const jobs = await sb('GET', `jobs?id=eq.${jid}&account_id=eq.${ctx.account.id}`)
    if (!jobs?.length) return res.status(404).json({ error: 'Job not found' })

    // Upsert quote
    const existing = await sb('GET', `job_quotes?job_id=eq.${jid}`)
    let quote
    if (existing?.length) {
      ;[quote] = await sb('PATCH', `job_quotes?job_id=eq.${jid}`, { quoted_price, target_margin, notes: notes || null })
    } else {
      ;[quote] = await sb('POST', 'job_quotes', { account_id: ctx.account.id, job_id: jid, quoted_price, target_margin, notes: notes || null })
    }
    return res.status(200).json(quote)
  }

  // ── POST ?action=auto-log: auto cost from board entry ────
  if (req.method === 'POST' && action === 'auto-log') {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { board_entry_id } = req.body || {}
    if (!board_entry_id) return res.status(400).json({ error: 'board_entry_id required' })

    const entries = await sb('GET',
      `board_entries?id=eq.${board_entry_id}&account_id=eq.${ctx.account.id}` +
      `&select=*,machines(name,hourly_rate),jobs(id)`
    )
    if (!entries?.length) return res.status(404).json({ error: 'Board entry not found' })
    const be = entries[0]

    if (!be.started_at || !be.completed_at) return res.status(400).json({ error: 'Board entry has no time data' })
    if (!be.machines?.hourly_rate) return res.status(400).json({ error: 'Machine has no hourly rate set' })

    // Check not already auto-logged
    const existing = await sb('GET', `job_cost_entries?board_entry_id=eq.${board_entry_id}&source=eq.auto`)
    if (existing?.length) return res.status(409).json({ error: 'Cost already logged for this operation' })

    const hours = (new Date(be.completed_at) - new Date(be.started_at)) / 3_600_000
    const roundedHours = Math.round(hours * 100) / 100

    const [entry] = await sb('POST', 'job_cost_entries', {
      account_id:     ctx.account.id,
      job_id:         be.jobs.id,
      type:           'labor',
      description:    `${be.operation} — ${be.machines.name}`,
      quantity:       roundedHours,
      unit_cost:      be.machines.hourly_rate,
      board_entry_id,
      source:         'auto',
      recorded_by:    ctx.user.id,
    })
    return res.status(201).json(entry)
  }

  // ── POST: create manual cost entry ──────────────────────
  if (req.method === 'POST' && !action) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const { job_id: jid, type, description, quantity = 1, unit_cost } = req.body || {}
    if (!jid || !type || !description || unit_cost === undefined)
      return res.status(400).json({ error: 'job_id, type, description, unit_cost required' })

    const jobs = await sb('GET', `jobs?id=eq.${jid}&account_id=eq.${ctx.account.id}`)
    if (!jobs?.length) return res.status(404).json({ error: 'Job not found' })

    const [entry] = await sb('POST', 'job_cost_entries', {
      account_id:  ctx.account.id,
      job_id:      jid,
      type, description,
      quantity:    parseFloat(quantity),
      unit_cost:   parseFloat(unit_cost),
      source:      'manual',
      recorded_by: ctx.user.id,
    })

    // ── Check budget alert after insert ──────────────────────
    // Return alert status so the UI can react immediately without a full reload.
    // If THIS entry pushed the job over the quoted price, email the owner once.
    let budget_alert = null
    try {
      const [jobQuote]   = await sb('GET', `job_quotes?job_id=eq.${jid}&account_id=eq.${ctx.account.id}`) || []
      const allEntries   = await sb('GET', `job_cost_entries?job_id=eq.${jid}&account_id=eq.${ctx.account.id}&select=total_cost`)
      if (jobQuote) {
        const quoted     = parseFloat(jobQuote.quoted_price || 0)
        const target     = parseFloat(jobQuote.target_margin || 40)
        const actualNow  = (allEntries || []).reduce((s, e) => s + parseFloat(e.total_cost || 0), 0)
        const targetCost = quoted * (1 - target / 100)
        if (actualNow >= quoted)                               budget_alert = 'over'
        else if (targetCost > 0 && actualNow >= targetCost * 0.80) budget_alert = 'at_risk'
        else                                                   budget_alert = 'ok'

        // Transition detection: over now, but wasn't before this entry
        const entryTotal   = parseFloat(entry?.total_cost || 0)
        const actualBefore = actualNow - entryTotal
        if (budget_alert === 'over' && actualBefore < quoted && quoted > 0) {
          const [job] = await sb('GET', `jobs?id=eq.${jid}&select=job_number,part_name`) || []
          getOwnerEmail(ctx.account.id).then(email => {
            if (email && job) {
              const proto = req.headers['x-forwarded-proto'] || 'https'
              const host  = req.headers['x-forwarded-host'] || req.headers.host
              return sendEmail({ to: email, ...overBudgetEmail(ctx.account.name, job.job_number, job.part_name, actualNow, quoted, `${proto}://${host}`) })
            }
          }).catch(() => {})
        }
      }
    } catch (_) { /* non-critical — don't fail the POST */ }

    return res.status(201).json({ entry, budget_alert })
  }

  // ── PATCH: update entry ──────────────────────────────────
  if (req.method === 'PATCH' && id) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    const rows = await sb('GET', `job_cost_entries?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    if (!rows?.length) return res.status(404).json({ error: 'Entry not found' })
    const allowed = ['description','quantity','unit_cost','type']
    const updates = {}
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
    const [updated] = await sb('PATCH', `job_cost_entries?id=eq.${id}`, updates)
    return res.status(200).json(updated)
  }

  // ── DELETE: remove entry ─────────────────────────────────
  if (req.method === 'DELETE' && id) {
    if (!requireRole(ctx, ['owner','admin','manager'], res)) return
    await sb('DELETE', `job_cost_entries?id=eq.${id}&account_id=eq.${ctx.account.id}`)
    return res.status(200).json({ ok: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
