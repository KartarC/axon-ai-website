// api/billing.js — Stripe billing (Checkout + Portal + webhook) and lifecycle cron
//
// POST ?action=checkout  { plan }  → Stripe Checkout session URL (auth required)
// POST ?action=portal              → Stripe Billing Portal URL (auth required)
// POST ?action=webhook             → Stripe webhook (signature-verified, raw body)
// GET  ?action=cron                → daily lifecycle sweep (trial reminders/expiry; Vercel Cron)
//
// Stripe is called via its REST API with fetch (form-encoded) — no SDK dependency.
// Checkout uses inline price_data, so no products need to be created in the
// Stripe dashboard. Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
const crypto = require('crypto')
const { sb, requireAuth, cors } = require('./_lib/supabase')
const { sendEmail, getOwnerEmail, trialReminderEmail, trialExpiredEmail } = require('./_lib/email')

// Raw body needed for webhook signature verification
export const config = { api: { bodyParser: false } }

const STRIPE_KEY    = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

const PLANS = {
  starter: { name: 'Billet Starter', amount: 9900,  modules_limit: 1 },
  growth:  { name: 'Billet Growth',  amount: 19900, modules_limit: 3 },
  suite:   { name: 'Billet Suite',   amount: 34900, modules_limit: 9 },
}
const ALL_MODULES = ['production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service']

function siteUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host  = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

// Stripe REST call with form encoding (supports nested keys passed pre-flattened)
async function stripe(path, params) {
  const body = new URLSearchParams(params).toString()
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${path} failed (${res.status})`)
  return data
}

function verifyStripeSignature(rawBody, sigHeader) {
  if (!sigHeader) return false
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
  const t = parts.t, v1 = parts.v1
  if (!t || !v1) return false
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) } catch { return false }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const { action } = req.query

  const raw = req.method === 'POST' ? await readRawBody(req) : null
  const body = raw && action !== 'webhook' ? (() => { try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return {} } })() : {}

  // ── WEBHOOK ──────────────────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    if (!STRIPE_KEY || !WEBHOOK_SECRET) return res.status(503).json({ error: 'Billing not configured' })
    if (!verifyStripeSignature(raw.toString('utf8'), req.headers['stripe-signature']))
      return res.status(400).json({ error: 'Invalid signature' })

    let event
    try { event = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ error: 'Bad payload' }) }

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object
      const accountId = s.metadata?.account_id
      const plan      = s.metadata?.plan
      if (accountId && PLANS[plan]) {
        // Set plan + trim modules to the plan's entitlement (production-board kept first)
        const [acc] = await sb('GET', `accounts?id=eq.${accountId}&select=modules`) || []
        const current = acc?.modules?.length ? acc.modules : ALL_MODULES
        const ordered = ['production-board', ...current.filter(m => m !== 'production-board')]
        const modules = plan === 'suite' ? ALL_MODULES : ordered.slice(0, PLANS[plan].modules_limit)
        await sb('PATCH', `accounts?id=eq.${accountId}`, {
          plan, modules, status: 'active',
          stripe_customer_id:     s.customer || null,
          stripe_subscription_id: s.subscription || null,
          trial_ends_at: null,
        })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const rows = await sb('GET', `accounts?stripe_subscription_id=eq.${sub.id}&select=id`)
      if (rows?.length) {
        await sb('PATCH', `accounts?id=eq.${rows[0].id}`, { status: 'suspended' })
      }
    }

    return res.status(200).json({ received: true })
  }

  // ── CRON: daily trial lifecycle ──────────────────────────
  if (action === 'cron' && req.method === 'GET') {
    if (process.env.CRON_SECRET) {
      const auth = req.headers['authorization'] || ''
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
    }
    const base = process.env.SITE_URL || siteUrl(req)
    const today = new Date().toISOString().slice(0, 10)
    const soon  = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    let reminded = 0, expired = 0

    // 3-day reminders — flags only burn when the email actually sends,
    // so reminders start flowing once RESEND_API_KEY is configured.
    const dueSoon = await sb('GET',
      `accounts?plan=eq.trial&status=eq.active&trial_reminder_sent=eq.false&trial_ends_at=lte.${soon}&trial_ends_at=gte.${today}&select=id,name,trial_ends_at`)
    for (const a of dueSoon || []) {
      const email = await getOwnerEmail(a.id)
      if (!email) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_reminder_sent: true }); continue }
      const daysLeft = Math.max(1, Math.ceil((new Date(a.trial_ends_at) - Date.now()) / 86400000))
      const r = await sendEmail({ to: email, ...trialReminderEmail(a.name, daysLeft, base) })
      if (r?.ok) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_reminder_sent: true }); reminded++ }
    }

    // Expiry notices
    const done = await sb('GET',
      `accounts?plan=eq.trial&status=eq.active&trial_expired_email_sent=eq.false&trial_ends_at=lt.${today}&select=id,name`)
    for (const a of done || []) {
      const email = await getOwnerEmail(a.id)
      if (!email) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_expired_email_sent: true }); continue }
      const r = await sendEmail({ to: email, ...trialExpiredEmail(a.name, base) })
      if (r?.ok) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_expired_email_sent: true }); expired++ }
    }

    return res.status(200).json({ ok: true, reminded, expired })
  }

  // ── Authenticated actions (allow expired trials — they're here to pay) ──
  const ctx = await requireAuth(req, res, { allowExpired: true })
  if (!ctx) return

  // ── CHECKOUT ─────────────────────────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    if (!STRIPE_KEY) return res.status(503).json({ error: 'Billing is not configured yet — contact hello@billet.app' })
    const plan = body?.plan
    if (!PLANS[plan]) return res.status(400).json({ error: 'plan must be starter, growth, or suite' })
    if (!['owner','admin'].includes(ctx.role)) return res.status(403).json({ error: 'Only owners and admins can manage billing' })

    const base = siteUrl(req)
    const p = PLANS[plan]
    const params = {
      mode: 'subscription',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(p.amount),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': p.name,
      'line_items[0][price_data][product_data][description]': 'Flat rate · unlimited users',
      success_url: `${base}/app/billing.html?success=1`,
      cancel_url:  `${base}/app/billing.html?canceled=1`,
      customer_email: ctx.user.email,
      'metadata[account_id]': ctx.account.id,
      'metadata[plan]': plan,
      'subscription_data[metadata][account_id]': ctx.account.id,
    }
    if (ctx.account.stripe_customer_id) {
      delete params.customer_email
      params.customer = ctx.account.stripe_customer_id
    }
    try {
      const session = await stripe('checkout/sessions', params)
      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(502).json({ error: e.message })
    }
  }

  // ── PORTAL ───────────────────────────────────────────────
  if (action === 'portal' && req.method === 'POST') {
    if (!STRIPE_KEY) return res.status(503).json({ error: 'Billing is not configured yet' })
    if (!ctx.account.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet — subscribe to a plan first' })
    try {
      const session = await stripe('billing_portal/sessions', {
        customer: ctx.account.stripe_customer_id,
        return_url: `${siteUrl(req)}/app/billing.html`,
      })
      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(502).json({ error: e.message })
    }
  }

  res.status(400).json({ error: 'Unknown action or method' })
}
