// api/axon-admin.js — consolidated Ovrendi internal admin
// Internal staff only. The admin credential is accepted in a header, never in URLs.
// ?resource=accounts → GET list / POST create / PATCH ?id=X
// ?resource=invite   → POST send invite
const { sb, requireAxonAdmin, cors } = require('./_lib/supabase')

const { siteUrl } = require('./_lib/security')
const { sendEmail, emailStatus, invitationEmail, welcomeEmail } = require('./_lib/email')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.query.resource === 'staff-setup' && req.method === 'POST') {
    return require('./_lib/staff-setup').setupStaff(req, res)
  }
  const staff = await requireAxonAdmin(req, res)
  if (!staff) return
  if (req.query.resource === 'session' && req.method === 'GET') return res.status(200).json({email:staff.email})

  res.setHeader('Cache-Control','no-store')
  const { resource, id } = req.query
  if(['bugs','customer-activity','web-analytics'].includes(resource)){try{return await require('./_lib/engagement').staffEngagement(req,res)}catch(_){return res.status(503).json({error:'Could not load reporting'})}}
  if(resource === 'mailbox') return require('./_lib/zoho-mail').zohoMail(req,res)
  if (['company-team','company-user','company-invite','user-reset'].includes(resource)) {try{return await require('./_lib/company-users').companyUsers(req,res)}catch(_){return res.status(503).json({error:'Could not complete the company user request. Please try again.'})}}
  if (resource === 'email' && req.method === 'GET') return res.status(200).json(emailStatus())
  if (resource === 'email-test' && req.method === 'POST') {
    const { email } = req.body || {}
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Enter a valid test recipient'})
    if (!emailStatus().notifications_ready) return res.status(409).json({error:'Notification sender is not configured'})
    const result = await sendEmail({to:email,...welcomeEmail('Test workspace',siteUrl()),subject:'Ovrendi email delivery test',kind:'test'})
    return res.status(result.ok ? 200 : 502).json(result.ok ? {ok:true,message:'Resend accepted the test email. Check the recipient inbox and Resend delivery log.'} : {error:'Resend did not accept the test. Check the key permissions and verified sender domain.'})
  }
  const modules = ['laser-quoting','production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service']
  const limits = {starter:1,growth:3,suite:9,trial:9}
  if (resource === 'catalog' && req.method === 'GET') return res.status(200).json({modules,limits})
  const tables = {contacts:'ovrendi_crm_contacts',tasks:'ovrendi_crm_tasks',workflows:'ovrendi_crm_workflows',activity:'ovrendi_crm_activity'}
  if (tables[resource]) {
    const table=tables[resource]
    if (req.method==='GET') return res.status(200).json(await sb('GET',table+'?select=*&order=created_at.desc&limit=1000') || [])
    if (resource==='activity' || !['POST','PATCH'].includes(req.method)) return res.status(405).json({error:'Method not allowed'})
    if(req.method==='PATCH'&&!id) return res.status(400).json({error:'Record ID required'})
    const fields={contacts:['account_id','name','email','phone','notes'],tasks:['account_id','title','owner_name','due_date','status','notes'],workflows:['account_id','stage','owner_name','next_step','target_date']}[resource]
    const data={};for(const key of fields)if(req.body?.[key]!==undefined)data[key]=req.body[key]
    for(const [key,value] of Object.entries(data)) if(value!==null && (typeof value!=='string'||value.length>4000)) return res.status(400).json({error:'Invalid field: '+key})
    if(req.method==='POST' && ((resource==='contacts'&&!data.name?.trim())||(resource==='tasks'&&!data.title?.trim())||(resource==='workflows'&&!data.account_id))) return res.status(400).json({error:'Complete the required fields'})
    if(data.status && !['todo','doing','blocked','done'].includes(data.status))return res.status(400).json({error:'Invalid task status'})
    if(data.stage && !['discovery','setup','invited','training','pilot','live'].includes(data.stage))return res.status(400).json({error:'Invalid stage'})
    if(data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))return res.status(400).json({error:'Invalid email'})
    try {const rows=await sb(req.method,table+(req.method==='PATCH'?'?id=eq.'+id:''),data);if(!rows?.length)return res.status(404).json({error:'Record not found'});return res.status(req.method==='POST'?201:200).json(rows[0])}
    catch(_){return res.status(409).json({error:'Could not save. Check the company, dates and whether this company already has an onboarding workflow.'})}
  }

  // ── ACCOUNTS ─────────────────────────────────────────────
  if (resource === 'accounts') {
    if (req.method === 'GET') {
      const accounts = await sb('GET', 'accounts?select=*&order=created_at.desc')
      return res.status(200).json(accounts || [])
    }
    if (req.method === 'POST') {
      const { name, plan = 'starter', modules = [], timezone = 'America/Toronto', notes } = req.body || {}
      if (typeof name!=='string'||!name.trim()||name.length>120) return res.status(400).json({ error: 'Company name required (maximum 120 characters)' })
      if(!Object.hasOwn(limits,plan)||!Array.isArray(modules)||new Set(modules).size!==modules.length||modules.length>limits[plan]||modules.some(m=>!['laser-quoting','production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service'].includes(m))) return res.status(400).json({error:'Select valid modules within the plan limit'})
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      const existing = await sb('GET', `accounts?slug=eq.${slug}`)
      const finalSlug = (existing?.length > 0) ? `${slug}-${Math.random().toString(36).slice(2,6)}` : slug
      const [account] = await sb('POST', 'accounts', { name, slug: finalSlug, plan, modules, timezone, notes: notes || null, ...(plan==='trial'?{trial_ends_at:new Date(Date.now()+14*86400000).toISOString().slice(0,10)}:{}) })
      return res.status(201).json(account)
    }
    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id required' })
      const allowed = ['name','plan','modules','status','timezone','notes']
      const updates = {}
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k] }
      if(updates.name!==undefined){if(typeof updates.name!=='string'||!updates.name.trim()||updates.name.length>120)return res.status(400).json({error:'Company name is required (maximum 120 characters)'});updates.name=updates.name.trim()}
      const [existing] = await sb('GET', 'accounts?id=eq.'+id+'&select=plan,modules,stripe_subscription_id') || []
      if(!existing)return res.status(404).json({error:'Company not found'})
      if(updates.plan && existing.stripe_subscription_id && updates.plan!==existing.plan)return res.status(409).json({error:'Change paid plans through billing first'})
      const plan=updates.plan||existing.plan, selected=updates.modules||existing.modules
      if(!Object.hasOwn(limits,plan)||!Array.isArray(selected)||selected.length>limits[plan]||new Set(selected).size!==selected.length||selected.some(m=>!modules.includes(m)))return res.status(400).json({error:'Modules exceed the selected plan or contain an unknown module'})
      if(updates.status&&!['active','suspended','cancelled'].includes(updates.status))return res.status(400).json({error:'Invalid account status'})
      const [updated] = await sb('PATCH', `accounts?id=eq.${id}`, updates)
      return res.status(200).json(updated)
    }
  }

  // ── INVITE ───────────────────────────────────────────────
  if (resource === 'invite' && req.method === 'POST') {
    const { email, account_id, role = 'owner', send_email = false } = req.body || {}
    if (typeof email!=='string'|| !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['owner','admin','manager','operator','viewer'].includes(role)||!account_id) return res.status(400).json({ error: 'email and account_id required' })

    if (send_email && !emailStatus().invitations_ready) return res.status(409).json({error:'Secure invitation email is not configured. Create a private link instead, or finish the untracked auth sender setup.'})
    const accounts = await sb('GET', `accounts?id=eq.${account_id}&select=name`)
    if (!accounts?.length) return res.status(404).json({ error: 'Account not found' })
    const shopName = accounts[0].name

    const [invite] = await sb('POST', 'account_invites', { account_id, email, role })


    const inviteUrl = `${siteUrl()}/app/accept-invite.html?token=${invite.token}`
    const delivery = send_email ? await sendEmail({to:email,...invitationEmail(shopName,inviteUrl),idempotencyKey:`invite-${invite.id}`}) : null

    return res.status(201).json({ ok: true, invite_id: invite.id, invite_url: inviteUrl, email, shop: shopName, email_status: !send_email ? 'not_requested' : delivery?.ok ? 'accepted' : 'failed' })
  }

  res.status(400).json({ error: 'Unknown resource or method' })
}
