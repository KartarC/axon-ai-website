// api/quote-suggest.js — AI Quote Suggestor (Billet · Priority #3)
// POST { job_id }                        → suggest a price from the shop's own history
// POST { material, quantity, part_name }  → suggest from specs (no job needed)
//
// Strategy:
//   1. Pull the shop's historical jobs that have a quote + logged costs.
//   2. Rank by material family + quantity proximity → "comparables".
//   3. Ask Claude to suggest a price range + target margin + rationale,
//      grounded in those comparables. If the shop has no history yet,
//      Claude falls back to a parametric cold-start estimate and says so.
//
// Requires env ANTHROPIC_API_KEY. Model via ANTHROPIC_MODEL (default sonnet).
const { sb, requireAuth, requireModule, cors } = require('./_lib/supabase')

const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL   = 'claude-sonnet-4-6'

// Coarse material family for similarity matching
function materialFamily(m) {
  const s = (m || '').toLowerCase()
  if (/(stainless|316|304|17-4|15-5)/.test(s)) return 'stainless'
  if (/(inconel|hastelloy|monel|nickel)/.test(s)) return 'superalloy'
  if (/(ti-|titanium|6al)/.test(s))            return 'titanium'
  if (/(brass|bronze|c360|c260)/.test(s))      return 'copper-alloy'
  if (/(alum|6061|7075|2024|5052)/.test(s))    return 'aluminum'
  if (/(steel|4140|4340|1018|1045|a36|tool)/.test(s)) return 'steel'
  if (/(delrin|nylon|peek|abs|plastic|acetal)/.test(s)) return 'plastic'
  return 'other'
}

async function callClaude(apiKey, model, system, userContent) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
}

function parseJSON(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  return JSON.parse(stripped)
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const ctx = await requireAuth(req, res)
  if (!ctx) return
  if (!requireModule(ctx, 'job-costing', res)) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error:  'AI quoting is not configured',
      detail: 'Set ANTHROPIC_API_KEY in your Vercel environment variables to enable the Quote Suggestor.',
    })
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL

  // ── Resolve the target part specs ─────────────────────────
  let target
  const { job_id } = req.body || {}
  if (job_id) {
    const jobs = await sb('GET',
      `jobs?id=eq.${job_id}&account_id=eq.${ctx.account.id}` +
      `&select=id,job_number,part_name,material,quantity,revision,notes`)
    if (!jobs?.length) return res.status(404).json({ error: 'Job not found' })
    target = jobs[0]
  } else {
    const { part_name, material, quantity, notes } = req.body || {}
    if (!material || !quantity) return res.status(400).json({ error: 'Provide job_id, or material + quantity' })
    target = { part_name: part_name || 'Part', material, quantity, notes: notes || null }
  }

  // ── Pull the shop's quoted history with logged costs ──────
  const history = await sb('GET',
    `jobs?account_id=eq.${ctx.account.id}&order=created_at.desc&limit=80` +
    `&select=job_number,part_name,material,quantity,status,job_quotes(quoted_price,target_margin),job_cost_entries(total_cost)`)

  const targetFam = materialFamily(target.material)
  const priced = (history || [])
    .map(j => ({ ...j, _q: Array.isArray(j.job_quotes) ? j.job_quotes[0] : j.job_quotes }))
    .filter(j => j._q && j.job_number !== target.job_number)
    .map(j => {
      const quoted = parseFloat(j._q.quoted_price || 0)
      const actual = (j.job_cost_entries || []).reduce((s, e) => s + parseFloat(e.total_cost || 0), 0)
      return {
        job_number: j.job_number, part_name: j.part_name, material: j.material,
        quantity: j.quantity, quoted: Math.round(quoted),
        actual: Math.round(actual),
        margin_pct: quoted > 0 ? Math.round((quoted - actual) / quoted * 100) : null,
        family: materialFamily(j.material),
      }
    })
    .filter(c => c.actual > 0)

  // Rank: same family first, then closest quantity
  priced.sort((a, b) => {
    const fa = a.family === targetFam ? 0 : 1
    const fb = b.family === targetFam ? 0 : 1
    if (fa !== fb) return fa - fb
    return Math.abs(a.quantity - target.quantity) - Math.abs(b.quantity - target.quantity)
  })
  const comparables = priced.slice(0, 10)
  const basis = comparables.some(c => c.family === targetFam) ? 'history' : (comparables.length ? 'weak_history' : 'cold_start')

  // ── Build the prompt ──────────────────────────────────────
  const system =
    `You are a senior estimator at a CNC machine shop. You suggest competitive, profitable quote prices. ` +
    `You ground every number in the shop's own historical jobs when available. ` +
    `You are conservative: never suggest a price that would lose money versus comparable actual costs. ` +
    `Respond with ONLY a JSON object, no prose, no code fences.`

  const compText = comparables.length
    ? comparables.map(c =>
        `- ${c.job_number}: ${c.part_name} | ${c.material} | qty ${c.quantity} | quoted $${c.quoted} | actual cost $${c.actual} | margin ${c.margin_pct}%`
      ).join('\n')
    : '(no comparable history — use a parametric cold-start estimate from material, quantity, and typical shop rates of $75–$95/machine-hour)'

  const userContent =
    `New part to quote:\n` +
    `- Part: ${target.part_name}\n- Material: ${target.material}\n- Quantity: ${target.quantity}\n` +
    (target.notes ? `- Notes: ${target.notes}\n` : '') +
    `\nThe shop's comparable past jobs (most similar first):\n${compText}\n\n` +
    `Return JSON with exactly these keys:\n` +
    `{\n` +
    `  "suggested_low": <integer dollars, total job price>,\n` +
    `  "suggested_high": <integer dollars>,\n` +
    `  "suggested_price": <integer, your single recommended total price>,\n` +
    `  "target_margin": <integer percent>,\n` +
    `  "confidence": "high" | "medium" | "low",\n` +
    `  "rationale": "<2-3 sentences a shop owner would read, citing the comparable jobs by number when used>",\n` +
    `  "basis": "history" | "cold_start"\n` +
    `}`

  // ── Call Claude ───────────────────────────────────────────
  let suggestion
  try {
    const raw = await callClaude(apiKey, model, system, userContent)
    suggestion = parseJSON(raw)
  } catch (e) {
    return res.status(502).json({ error: 'AI suggestion failed', detail: String(e.message || e) })
  }

  return res.status(200).json({
    target: { part_name: target.part_name, material: target.material, quantity: target.quantity },
    basis_detail: basis,
    comparables,
    suggestion,
  })
}
