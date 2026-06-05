import { requireAuth }   from '../_shared/auth.js'
import { renderNav }     from '../_shared/nav.js'
import { apiGet }        from '../_shared/api.js'
import { toastError }    from '../_shared/toast.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')
renderNav('/app/jobs/')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => { document.getElementById('app-nav').classList.toggle('open') })

let allJobs = []
let activeStatus = 'all'

async function loadJobs() {
  try {
    allJobs = await apiGet('/api/jobs')
    renderTable()
  } catch (e) {
    toastError('Failed to load jobs: ' + e.message)
  }
}

function renderTable() {
  const q = document.getElementById('jobSearch').value.toLowerCase()
  const today = new Date().toISOString().slice(0, 10)

  let jobs = allJobs
  if (activeStatus !== 'all') jobs = jobs.filter(j => j.status === activeStatus)
  if (q) jobs = jobs.filter(j =>
    j.job_number.toLowerCase().includes(q) ||
    j.part_name.toLowerCase().includes(q) ||
    j.customers?.name?.toLowerCase().includes(q)
  )

  const tbody = document.getElementById('jobsTbody')
  if (!jobs.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:40px">No jobs found</td></tr>`
    return
  }

  const priorityColors = {
    rush:   { bg:'#FFF1F2', color:'#DC2626' },
    high:   { bg:'#FFF7ED', color:'#D97706' },
    normal: { bg:'var(--gray-100)', color:'var(--gray-600)' },
    low:    { bg:'var(--gray-50)',  color:'var(--gray-400)' },
  }
  const statusColors = {
    open:        { bg:'var(--gray-100)', color:'var(--gray-600)' },
    in_progress: { bg:'#EFF6FF', color:'var(--blue-700)' },
    on_hold:     { bg:'#FFFBEB', color:'#D97706' },
    complete:    { bg:'#F0FDF4', color:'#15803D' },
    shipped:     { bg:'#F0FDF4', color:'#15803D' },
    cancelled:   { bg:'#FFF1F2', color:'#DC2626' },
  }

  tbody.innerHTML = jobs.map(j => {
    const pc = priorityColors[j.priority] || priorityColors.normal
    const sc = statusColors[j.status] || statusColors.open
    const isLate = j.due_date && j.due_date < today && !['complete','shipped','cancelled'].includes(j.status)

    return `<tr onclick="window.location='/app/modules/production-board/'">
      <td><span class="job-num">${esc(j.job_number)}</span></td>
      <td><span class="job-part">${esc(j.part_name)}</span>${j.revision ? `<span style="font-size:.72rem;color:var(--gray-400);margin-left:6px">Rev ${esc(j.revision)}</span>` : ''}</td>
      <td style="color:var(--gray-500)">${esc(j.customers?.name || '—')}</td>
      <td style="color:var(--gray-600)">${j.quantity}</td>
      <td><span style="padding:2px 9px;border-radius:100px;font-size:.68rem;font-weight:700;background:${pc.bg};color:${pc.color}">${j.priority}</span></td>
      <td><span style="padding:2px 9px;border-radius:100px;font-size:.68rem;font-weight:700;background:${sc.bg};color:${sc.color}">${j.status.replace('_',' ')}</span></td>
      <td class="${isLate ? 'due-late' : ''}" style="font-size:.82rem">${j.due_date ? fmtDate(j.due_date) + (isLate ? ' — late' : '') : '—'}</td>
    </tr>`
  }).join('')
}

document.getElementById('jobSearch').addEventListener('input', renderTable)

document.getElementById('statusTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-status]')
  if (!tab) return
  activeStatus = tab.dataset.status
  document.querySelectorAll('.status-tab').forEach(t => t.classList.toggle('active', t === tab))
  renderTable()
})

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) }

loadJobs()
