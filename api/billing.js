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
const { sb, requireAuth, requireRole, cors } = require('./_lib/supabase')
const { siteUrl, secretMatches } = require('./_lib/security')
const { sendEmail, getOwnerEmail, trialReminderEmail, trialExpiredEmail } = require('./_lib/email')

// Raw body needed for webhook signature verification
export const config = { api: { bodyParser: false } }

const STRIPE_KEY    = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

const PLANS = {
  starter: { name: 'Ovrendi Starter', amount: 9900,  modules_limit: 1 },
  growth:  { name: 'Ovrendi Growth',  amount: 19900, modules_limit: 3 },
  suite:   { name: 'Ovrendi Suite',   amount: 34900, modules_limit: 9 },
}
const ALL_MODULES = ['production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service']

async function readRawBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += data.length
    if (size > 1024 * 1024) throw new Error('Request too large')
    chunks.push(data)
  }
  return Buffer.concat(chunks)
}

// Stripe REST call with form encoding (supports nested keys passed pre-flattened)
async function stripe(path, params, idempotencyKey) {
  const body = new URLSearchParams(params).toString()
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {}) },
    ...(params ? {body} : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${path} failed (${res.status})`)
  return data
}

function verifyStripeSignature(rawBody, sigHeader) {
  if (typeof sigHeader !== 'string' || !WEBHOOK_SECRET) return false
  const parts = sigHeader.split(',').map(part => part.trim().split('='))
  const t = parts.find(([key]) => key === 't')?.[1]
  if (!/^\d+$/.test(t || '') || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex')
  return parts.some(([key,value]) => key === 'v1' && /^[0-9a-f]{64}$/i.test(value || '') && secretMatches(value.toLowerCase(), expected))
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const { action } = req.query

  let raw
  try { raw = req.method === 'POST' ? await readRawBody(req) : null }
  catch (_) { return res.status(413).json({ error: 'Request too large' }) }
  const body = raw && action !== 'webhook' ? (() => { try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return {} } })() : {}

  // ── WEBHOOK ──────────────────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    if (!STRIPE_KEY || !WEBHOOK_SECRET) return res.status(503).json({ error: 'Billing not configured' })
    if (!verifyStripeSignature(raw.toString('utf8'), req.headers['stripe-signature']))
      return res.status(400).json({ error: 'Invalid signature' })

    let event
    try { event = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ error: 'Bad payload' }) }

    if (typeof event.id !== 'string' || !Number.isSafeInteger(event.created) || !event.data?.object)
      return res.status(400).json({ error: 'Invalid event' })
    const supported = ['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required'];
    if (supported.includes(event.type)) {
      try {
        const obj = event.data.object;
        const subId = event.type.startsWith('customer.subscription.') ? obj.id :
          (obj.subscription?.id || obj.subscription || obj.parent?.subscription_details?.subscription);
        if (!subId) return res.status(200).json({ received: true });
        if (typeof subId !== 'string' || !/^sub_[a-zA-Z0-9]+$/.test(subId)) throw new Error('Invalid subscription');
        // Fetch current Stripe state: delayed payment events cannot resurrect a canceled subscription.
        const sub = await stripe('subscriptions/' + encodeURIComponent(subId));
        const plan = sub.metadata?.plan;
        const price = sub.items?.data?.[0]?.price;
        if (!PLANS[plan] || sub.items?.data?.length !== 1 || sub.items.data[0].quantity !== 1 ||
            price?.unit_amount !== PLANS[plan].amount || price.currency !== 'usd' ||
            price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1)
          throw new Error('Unrecognized subscription price');
        if (typeof sub.customer !== 'string') throw new Error('Invalid customer');
        await sb('POST', 'rpc/billet_sync_subscription', {
          p_event: {id:event.id,type:event.type,created:event.created},
          p_subscription: {...sub, current_period_end: sub.current_period_end || sub.items.data[0].current_period_end},
        });
      } catch (_) { return res.status(500).json({ error: 'Could not process billing event; retry later' }) }
    }

    return res.status(200).json({ received: true })
  }

  // ── CRON: daily trial lifecycle ──────────────────────────
  if (action === 'cron' && req.method === 'GET') {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'Cron not configured' })
    if (!secretMatches(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`))
      return res.status(401).json({ error: 'Unauthorized' })
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

  if (action === 'status' && req.method === 'GET') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    return res.status(200).json({
      checkout_ready: !!(STRIPE_KEY && WEBHOOK_SECRET),
      portal_ready: !!(STRIPE_KEY && ctx.account.stripe_customer_id),
      test_mode: !!STRIPE_KEY && !STRIPE_KEY.startsWith('sk_live_') && !STRIPE_KEY.startsWith('rk_live_'),
      currency: 'USD',
    })
  }

  // ── CHECKOUT ─────────────────────────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    if (!STRIPE_KEY || !WEBHOOK_SECRET) return res.status(503).json({ error: 'Subscription payments are not available yet — contact info@ovrendi.com' })
    if (ctx.account.stripe_subscription_id && !['canceled','incomplete_expired'].includes(ctx.account.billing_status))
      return res.status(409).json({ error: 'You already have a subscription. Use Manage billing instead of creating another subscription.' })
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
      client_reference_id: ctx.account.id,
      'metadata[account_id]': ctx.account.id,
      'metadata[plan]': plan,
      'subscription_data[metadata][account_id]': ctx.account.id,
      'subscription_data[metadata][plan]': plan,
    }
    if (ctx.account.stripe_customer_id) {
      delete params.customer_email
      params.customer = ctx.account.stripe_customer_id
    }
    try {
      const session = await stripe('checkout/sessions', params, `ovrendi-${ctx.account.id}-${plan}-${Math.floor(Date.now()/1800000)}`)
      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(502).json({ error: 'Payment service unavailable. Please try again or contact info@ovrendi.com.' })
    }
  }

  // ── PORTAL ───────────────────────────────────────────────
  if (action === 'portal' && req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    if (!STRIPE_KEY) return res.status(503).json({ error: 'Billing is not configured yet' })
    if (!ctx.account.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet — subscribe to a plan first' })
    try {
      const session = await stripe('billing_portal/sessions', {
        customer: ctx.account.stripe_customer_id,
        return_url: `${siteUrl(req)}/app/billing.html`,
      })
      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(502).json({ error: 'Payment service unavailable. Please try again or contact info@ovrendi.com.' })
    }
  }

  res.status(400).json({ error: 'Unknown action or method' })
}
