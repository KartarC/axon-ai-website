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
  starter: { name: 'Ovrendi Starter', amount: 4900,  modules_limit: 1 },
  growth:  { name: 'Ovrendi Growth',  amount: 9900, modules_limit: 3 },
  suite:   { name: 'Ovrendi Suite',   amount: 34900, modules_limit: 9 },
}
const PRICE_VERSION = 'launch-2026-10';
const LEGACY_AMOUNTS = {starter:9900,growth:19900,suite:34900};
// Existing date-only trials run through that UTC date. Never charge before it ends.
function checkoutTrialEnd(account, now=Date.now()) {
  if(account.plan!=='trial'||account.stripe_subscription_id||!/^\d{4}-\d{2}-\d{2}$/.test(account.trial_ends_at||''))return null;
  const end=Date.parse(account.trial_ends_at+'T00:00:00Z')+86400000;
  if(!Number.isFinite(end)||end<=now)return null;
  // Checkout needs at least 48 hours: allow a short extension for late signups, never shorten a trial.
  return Math.max(Math.floor(end/1000),Math.ceil(now/86400000)*86400+3*86400);
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
            price?.unit_amount !== (sub.metadata?.price_version===PRICE_VERSION ? PLANS[plan].amount : LEGACY_AMOUNTS[plan]) || price.currency !== 'usd' ||
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
      `accounts?or=(plan.eq.trial,billing_status.eq.trialing)&status=eq.active&trial_reminder_sent=eq.false&trial_ends_at=lte.${soon}&trial_ends_at=gte.${today}&select=id,name,trial_ends_at,billing_status,billing_cancel_at_period_end`)
    for (const a of dueSoon || []) {
      const email = await getOwnerEmail(a.id)
      if (!email) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_reminder_sent: true }); continue }
      const daysLeft = Math.max(1, Math.ceil((new Date(a.trial_ends_at) - Date.now()) / 86400000))
      const r = await sendEmail({ to: email, ...trialReminderEmail(a.name, daysLeft, base, a.billing_status==='trialing', a.billing_cancel_at_period_end) })
      if (r?.ok) { await sb('PATCH', `accounts?id=eq.${a.id}`, { trial_reminder_sent: true }); reminded++ }
    }

    // Expiry notices
    const done = await sb('GET',
      `accounts?plan=eq.trial&stripe_subscription_id=is.null&status=eq.active&trial_expired_email_sent=eq.false&trial_ends_at=lt.${today}&select=id,name`)
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
      trial_end: checkoutTrialEnd(ctx.account),
      subscription_status: ctx.account.billing_status || null,
      subscription_period_end: ctx.account.billing_period_end || null,
      cancel_at_period_end: !!ctx.account.billing_cancel_at_period_end,
    })
  }

  // ── CHECKOUT ─────────────────────────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    if (!requireRole(ctx, ['owner','admin'], res)) return
    if (!STRIPE_KEY || !WEBHOOK_SECRET) return res.status(503).json({ error: 'Subscription payments are not available yet — contact hello@getovrendi.com' })
    if (ctx.account.stripe_subscription_id && !['canceled','incomplete_expired'].includes(ctx.account.billing_status))
      return res.status(409).json({ error: 'You already have a subscription. Use Manage billing instead of creating another subscription.' })
    const plan = body?.plan
    if (plan==='suite') return res.status(400).json({error:'Contact Ovrendi about Suite availability. New Suite subscriptions are not available online.'})
    if (!PLANS[plan]) return res.status(400).json({ error: 'plan must be starter, growth, or suite' })
    if (!['owner','admin'].includes(ctx.role)) return res.status(403).json({ error: 'Only owners and admins can manage billing' })

    if(body.accept_recurring!==true)return res.status(400).json({error:'Please confirm the USD monthly subscription and automatic billing terms.'})
    const trialEnd=checkoutTrialEnd(ctx.account)
    const base = siteUrl(req)
    const p = PLANS[plan]
    const params = {
      mode: 'subscription',
      payment_method_collection: 'always',
      'adaptive_pricing[enabled]': 'false',
      'payment_method_types[0]': 'card',
      'custom_text[submit][message]': `Billed in USD: $${p.amount/100} per month${trialEnd ? ' after your free trial' : ', starting today'}. Renews automatically until canceled. Cancel in Manage billing before the next charge.`,
      ...(trialEnd ? {'subscription_data[trial_end]':String(trialEnd),'subscription_data[trial_settings][end_behavior][missing_payment_method]':'cancel'} : {}),
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
      'subscription_data[metadata][price_version]': PRICE_VERSION,
      'subscription_data[metadata][recurring_consent]': 'checkout-2026-10',
    }
    if (ctx.account.stripe_customer_id) {
      delete params.customer_email
      params.customer = ctx.account.stripe_customer_id
    }
    try {
      const session = await stripe('checkout/sessions', params, `ovrendi-${PRICE_VERSION}-${ctx.account.id}-${plan}-${trialEnd||'paid'}-${Math.floor(Date.now()/1800000)}`)
      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(502).json({ error: 'Payment service unavailable. Please try again or contact hello@getovrendi.com.' })
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
      return res.status(502).json({ error: 'Payment service unavailable. Please try again or contact hello@getovrendi.com.' })
    }
  }

  res.status(400).json({ error: 'Unknown action or method' })
}
