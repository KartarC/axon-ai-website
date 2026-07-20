import { requireAuth, getSession }    from './_shared/auth.js'
import { renderNav }                  from './_shared/nav.js'
import { apiGet, apiPost, apiPatch, apiDelete } from './_shared/api.js'
import { toastSuccess, toastError }   from './_shared/toast.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')
renderNav('/app/settings')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => document.getElementById('app-nav').classList.toggle('open'))

const isAdmin = ['owner','admin'].includes(session.role)

// ── Tabs ───────────────────────────────────────────────────
document.getElementById('setTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]')
  if (!tab) return
  document.querySelectorAll('.set-tab').forEach(t => t.classList.toggle('active', t === tab))
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab))
})

// ── SHOP ───────────────────────────────────────────────────
function loadShop() {
  document.getElementById('shopName').value = session.account.name || ''
  const tz = document.getElementById('shopTz')
  if (session.account.timezone) tz.value = session.account.timezone
  const plan = session.account.plan
  const trial = session.account.trial_ends_at
  document.getElementById('planLine').textContent =
    `Plan: ${plan}${plan === 'trial' && trial ? ` · trial ends ${trial}` : ''} — contact hello@billet.app to change plans.`
  if (!isAdmin) {
    document.getElementById('shopName').disabled = true
    document.getElementById('shopTz').disabled = true
    document.getElementById('saveShopBtn').style.display = 'none'
  }
}
document.getElementById('saveShopBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  btn.disabled = true; btn.textContent = 'Saving…'
  try {
    const updated = await apiPatch('/api/settings?resource=account', {
      name:     document.getElementById('shopName').value.trim(),
      timezone: document.getElementById('shopTz').value,
    })
    // refresh cached session account
    const s = getSession()
    if (s) {
      s.account.name = updated.name; s.account.timezone = updated.timezone
      sessionStorage.setItem('axon_account', JSON.stringify(s.account))
    }
    toastSuccess('Shop updated')
    renderNav('/app/settings')
  } catch (err) { toastError(err.message) }
  finally { btn.disabled = false; btn.textContent = 'Save changes' }
})

// ── MACHINES ───────────────────────────────────────────────
const TYPES = [['mill','Mill'],['lathe','Lathe'],['laser','Laser'],['waterjet','Waterjet'],['plasma','Plasma'],['press_brake','Press Brake'],['weld','Weld'],['grinder','Grinder'],['inspection','Inspection'],['other','Other']]
let machines = []

async function loadMachines() {
  try { machines = await apiGet('/api/machines') } catch (e) { toastError(e.message); return }
  const tbody = document.getElementById('machinesTbody')
  if (!machines.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-mini">No machines yet.</td></tr>`; return }
  tbody.innerHTML = machines.map(m => `
    <tr data-id="${m.id}">
      <td><input class="mch-name" value="${esc(m.name)}" ${isAdmin ? '' : 'disabled'}/></td>
      <td><select class="mch-type" ${isAdmin ? '' : 'disabled'}>${TYPES.map(([v,l]) => `<option value="${v}"${v===m.type?' selected':''}>${l}</option>`).join('')}</select></td>
      <td><input class="mch-rate" type="number" min="0" step="1" value="${m.hourly_rate ?? ''}" placeholder="—" ${isAdmin ? '' : 'disabled'}/></td>
      <td style="text-align:right">${isAdmin ? `<button class="act-btn mch-save">Save</button> <button class="act-btn act-btn--red mch-del">Remove</button>` : ''}</td>
    </tr>`).join('')

  tbody.querySelectorAll('.mch-save').forEach(b => b.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr')
    try {
      await apiPatch(`/api/machines?id=${tr.dataset.id}`, {
        name: tr.querySelector('.mch-name').value.trim(),
        type: tr.querySelector('.mch-type').value,
        hourly_rate: tr.querySelector('.mch-rate').value || null,
      })
      toastSuccess('Machine updated')
    } catch (err) { toastError(err.message) }
  }))
  tbody.querySelectorAll('.mch-del').forEach(b => b.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr')
    if (!confirm('Remove this machine?')) return
    try { await apiDelete(`/api/machines?id=${tr.dataset.id}`); toastSuccess('Machine removed'); loadMachines() }
    catch (err) { toastError(err.message) }
  }))
}
document.getElementById('addMachineBtn').addEventListener('click', async () => {
  if (!isAdmin) return toastError('Only owners and admins can add machines')
  const name = prompt('Machine name (e.g. Haas VF-2):')
  if (!name?.trim()) return
  try { await apiPost('/api/machines', { name: name.trim(), type: 'mill' }); toastSuccess('Machine added'); loadMachines() }
  catch (e) { toastError(e.message) }
})

// ── TEAM ───────────────────────────────────────────────────
async function loadTeam() {
  let data
  try { data = await apiGet('/api/settings?resource=team') } catch (e) { toastError(e.message); return }

  const tbody = document.getElementById('teamTbody')
  tbody.innerHTML = data.members.map(m => `
    <tr>
      <td>${esc(m.full_name || '—')}${m.user_id === data.my_user_id ? ' <span style="color:var(--gray-400);font-size:.72rem">(you)</span>' : ''}</td>
      <td><span class="role-pill ${m.role === 'owner' ? 'role-pill--owner' : ''}">${m.role}</span></td>
      <td style="text-align:right">
        ${isAdmin && m.role !== 'owner' && m.user_id !== data.my_user_id
          ? `<button class="act-btn act-btn--red mem-del" data-id="${m.id}">Remove</button>` : ''}
      </td>
    </tr>`).join('')
  tbody.querySelectorAll('.mem-del').forEach(b => b.addEventListener('click', async (e) => {
    if (!confirm('Remove this team member?')) return
    try { await apiDelete(`/api/settings?resource=member&id=${e.target.dataset.id}`); toastSuccess('Member removed'); loadTeam() }
    catch (err) { toastError(err.message) }
  }))

  const inv = document.getElementById('invitesTbody')
  if (!data.invites.length) { inv.innerHTML = `<tr><td colspan="3" class="empty-mini">None</td></tr>` }
  else {
    inv.innerHTML = data.invites.map(i => `
      <tr>
        <td>${esc(i.email)}</td>
        <td><span class="role-pill">${i.role}</span></td>
        <td style="text-align:right">
          <button class="act-btn inv-copy" data-token="${i.token}">Copy link</button>
          ${isAdmin ? `<button class="act-btn act-btn--red inv-del" data-id="${i.id}">Revoke</button>` : ''}
        </td>
      </tr>`).join('')
    inv.querySelectorAll('.inv-copy').forEach(b => b.addEventListener('click', (e) => {
      const url = `${location.origin}/app/accept-invite.html?token=${e.target.dataset.token}`
      navigator.clipboard.writeText(url).then(() => toastSuccess('Invite link copied'))
    }))
    inv.querySelectorAll('.inv-del').forEach(b => b.addEventListener('click', async (e) => {
      try { await apiDelete(`/api/settings?resource=invite&id=${e.target.dataset.id}`); toastSuccess('Invite revoked'); loadTeam() }
      catch (err) { toastError(err.message) }
    }))
  }
}
document.getElementById('invBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  const email = document.getElementById('invEmail').value.trim()
  if (!email) return toastError('Enter an email address')
  btn.disabled = true; btn.textContent = 'Creating…'
  try {
    const r = await apiPost('/api/settings?resource=invite', { email, role: document.getElementById('invRole').value })
    document.getElementById('invUrl').textContent = r.invite_url
    document.getElementById('invBox').style.display = 'block'
    document.getElementById('invEmail').value = ''
    toastSuccess('Invite created — copy the link and send it')
    loadTeam()
  } catch (err) { toastError(err.message) }
  finally { btn.disabled = false; btn.textContent = 'Create invite' }
})
document.getElementById('invCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('invUrl').textContent).then(() => toastSuccess('Copied'))
})

// ── CUSTOMERS ──────────────────────────────────────────────
async function loadCustomers() {
  let customers
  try { customers = await apiGet('/api/settings?resource=customers') } catch (e) { toastError(e.message); return }
  const tbody = document.getElementById('custTbody')
  if (!customers.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-mini">No customers yet.</td></tr>`; return }
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td style="font-weight:700">${esc(c.name)}</td>
      <td style="color:var(--gray-500)">${esc(c.contact_name || '—')}</td>
      <td style="color:var(--gray-500)">${esc(c.email || '—')}</td>
      <td>${c.job_count}</td>
      <td style="text-align:right">
        <button class="act-btn cust-edit" data-c='${esc(JSON.stringify(c))}'>Edit</button>
        <button class="act-btn act-btn--red cust-del" data-id="${c.id}">Delete</button>
      </td>
    </tr>`).join('')
  tbody.querySelectorAll('.cust-edit').forEach(b => b.addEventListener('click', (e) => {
    openCustModal(JSON.parse(e.target.dataset.c))
  }))
  tbody.querySelectorAll('.cust-del').forEach(b => b.addEventListener('click', async (e) => {
    if (!confirm('Delete this customer?')) return
    try { await apiDelete(`/api/settings?resource=customers&id=${e.target.dataset.id}`); toastSuccess('Customer deleted'); loadCustomers() }
    catch (err) { toastError(err.message) }
  }))
}
function openCustModal(c = null) {
  document.getElementById('custModalTitle').textContent = c ? 'Edit Customer' : 'Add Customer'
  document.getElementById('cId').value      = c?.id || ''
  document.getElementById('cName').value    = c?.name || ''
  document.getElementById('cContact').value = c?.contact_name || ''
  document.getElementById('cPhone').value   = c?.phone || ''
  document.getElementById('cEmail').value   = c?.email || ''
  document.getElementById('cNotes').value   = c?.notes || ''
  document.getElementById('custError').style.display = 'none'
  document.getElementById('custModal').style.display = 'flex'
}
document.getElementById('addCustBtn').addEventListener('click', () => openCustModal())
document.getElementById('closeCust').addEventListener('click',  () => document.getElementById('custModal').style.display = 'none')
document.getElementById('cancelCust').addEventListener('click', () => document.getElementById('custModal').style.display = 'none')
document.getElementById('custForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('saveCustBtn')
  btn.disabled = true; btn.textContent = 'Saving…'
  const id = document.getElementById('cId').value
  const payload = {
    name:         document.getElementById('cName').value.trim(),
    contact_name: document.getElementById('cContact').value.trim() || null,
    phone:        document.getElementById('cPhone').value.trim() || null,
    email:        document.getElementById('cEmail').value.trim() || null,
    notes:        document.getElementById('cNotes').value.trim() || null,
  }
  try {
    if (id) await apiPatch(`/api/settings?resource=customers&id=${id}`, payload)
    else    await apiPost('/api/settings?resource=customers', payload)
    document.getElementById('custModal').style.display = 'none'
    toastSuccess('Customer saved')
    loadCustomers()
  } catch (err) {
    const el = document.getElementById('custError')
    el.textContent = err.message; el.style.display = 'block'
  } finally { btn.disabled = false; btn.textContent = 'Save' }
})

// ── Utils + init ───────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;') }
loadShop(); loadMachines(); loadTeam(); loadCustomers()
