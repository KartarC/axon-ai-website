import { requireModule }          from '../../_shared/auth.js'
import { renderNav }              from '../../_shared/nav.js'
import { apiGet, apiPost, apiPatch } from '../../_shared/api.js'
import { toastSuccess, toastError }  from '../../_shared/toast.js'

const session = requireModule('production-board')
if (!session) throw new Error('Access denied')

renderNav('/app/modules/production-board/')

document.getElementById('mobileNavBtn')?.addEventListener('click', () => {
  document.getElementById('app-nav').classList.toggle('open')
})

// ── State ────────────────────────────────────────────────────
let entries  = []
let machines = []
let filterMachine = ''

const COLS = [
  { id: 'queue',    label: 'Queue' },
  { id: 'setup',    label: 'Setup' },
  { id: 'running',  label: 'Running' },
  { id: 'complete', label: 'Complete' },
]

const SITE_URL = window.location.origin

// ── Load data ─────────────────────────────────────────────────
async function loadBoard() {
  try {
    ;[entries, machines] = await Promise.all([
      apiGet('/api/board'),
      apiGet('/api/machines'),  // uses flat /api/machines route
    ])
    populateMachineFilter()
    populateMachineSelect()
    renderBoard()
  } catch (e) {
    document.getElementById('boardCanvas').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><h3>Failed to load board</h3><p>${e.message}</p></div>`
  }
}

// ── Render board ──────────────────────────────────────────────
function renderBoard() {
  const filtered = filterMachine
    ? entries.filter(e => e.machine_id === filterMachine)
    : entries

  const byCol = {}
  COLS.forEach(c => { byCol[c.id] = [] })
  filtered.forEach(e => {
    if (byCol[e.board_col]) byCol[e.board_col].push(e)
  })

  // Stats
  const today = new Date().toISOString().slice(0, 10)
  const active  = entries.filter(e => e.board_col !== 'complete')
  document.getElementById('statTotal').textContent   = active.length
  document.getElementById('statRunning').textContent = entries.filter(e => e.board_col === 'running').length
  document.getElementById('statOverdue').textContent = active.filter(e => e.jobs?.due_date && e.jobs.due_date < today).length
  document.getElementById('statRush').textContent    = active.filter(e => e.jobs?.priority === 'rush').length

  const canvas = document.getElementById('boardCanvas')
  canvas.innerHTML = COLS.map(col => {
    const cards = byCol[col.id]
    return `
      <div class="board-col board-col--${col.id}" data-col="${col.id}">
        <div class="board-col-head board-col-head--${col.id}">
          <span class="col-label">${col.label}</span>
          <span class="col-count">${cards.length}</span>
        </div>
        <div class="board-col-cards" data-drop-col="${col.id}">
          ${cards.length === 0
            ? `<div style="text-align:center;padding:20px 8px;font-size:.78rem;color:var(--gray-300)">No jobs</div>`
            : cards.map(e => renderCard(e)).join('')}
        </div>
      </div>`
  }).join('')

  attachDragListeners()
  attachCardListeners()
}

// ── Render a job card ────────────────────────────────────────
function renderCard(entry) {
  const job    = entry.jobs || {}
  const mach   = entry.machines
  const due    = job.due_date
  const today  = new Date().toISOString().slice(0, 10)
  const isLate = due && due < today && entry.board_col !== 'complete'
  const pri    = job.priority || 'normal'

  const dueStr = due
    ? `<span style="color:${isLate ? '#DC2626' : '#9CA3AF'};font-weight:${isLate ? '700' : '500'}">
        Due ${fmtDate(due)}${isLate ? ' — OVERDUE' : ''}
       </span>`
    : ''

  const statusColors = {
    queue:    { bg:'var(--gray-100)', color:'var(--gray-600)' },
    setup:    { bg:'#FFF7ED',         color:'#C2410C' },
    running:  { bg:'var(--blue-50)',   color:'var(--blue-700)' },
    paused:   { bg:'#FFFBEB',         color:'#D97706' },
    complete: { bg:'#F0FDF4',         color:'#15803D' },
  }
  const sc = statusColors[entry.status] || statusColors.queue

  return `
    <div class="job-card job-card--${pri}"
         draggable="true"
         data-entry-id="${entry.id}"
         data-job-id="${job.id}"
         data-token="${job.public_token || ''}"
         data-job-num="${escHtml(job.job_number || '')}"
         data-part="${escHtml(job.part_name || '')}">

      <div class="jc-top">
        <div>
          <div class="jc-job-num">${escHtml(job.job_number || '—')}</div>
          ${pri === 'rush' ? `<span class="badge badge--rush" style="margin-top:4px">RUSH</span>` : ''}
          ${pri === 'high' ? `<span class="badge badge--high" style="margin-top:4px">High</span>` : ''}
        </div>
        <div style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:.68rem;font-weight:700;background:${sc.bg};color:${sc.color}">
          ${entry.status}
        </div>
      </div>

      <div class="jc-part">${escHtml(job.part_name || '—')}</div>

      <div class="jc-meta">
        ${job.customers?.name ? `<div>${escHtml(job.customers.name)}</div>` : ''}
        <div>Qty: ${job.quantity || 1}${job.material ? ` · ${escHtml(job.material)}` : ''}</div>
        ${mach ? `<div>${escHtml(mach.name)}${mach.machine_no ? ` (${escHtml(mach.machine_no)})` : ''}</div>` : ''}
        ${dueStr}
      </div>

      <div class="jc-actions">
        ${entry.board_col !== 'complete'
          ? getNextActionBtn(entry)
          : ''}
        <button class="jc-btn" data-action="qr" data-entry-id="${entry.id}">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="4" height="4" rx=".5" stroke="currentColor" stroke-width="1"/><rect x="7" y="1" width="4" height="4" rx=".5" stroke="currentColor" stroke-width="1"/><rect x="1" y="7" width="4" height="4" rx=".5" stroke="currentColor" stroke-width="1"/><rect x="8" y="8" width="1.5" height="1.5" fill="currentColor"/><rect x="10" y="8" width="1.5" height="1.5" fill="currentColor"/><rect x="8" y="10" width="1.5" height="1.5" fill="currentColor"/><rect x="10" y="10" width="1.5" height="1.5" fill="currentColor"/></svg>
          QR
        </button>
      </div>
    </div>`
}

function getNextActionBtn(entry) {
  const map = {
    queue:   { label:'→ Setup',    action:'setup',    cls:'jc-btn' },
    setup:   { label:'▶ Start',    action:'running',  cls:'jc-btn' },
    running: { label:'⏸ Pause',   action:'paused',   cls:'jc-btn' },
    paused:  { label:'▶ Resume',   action:'running',  cls:'jc-btn' },
  }
  const next = map[entry.status]
  if (!next) return ''

  const complete = entry.board_col !== 'complete'
    ? `<button class="jc-btn jc-btn--green" data-action="complete" data-entry-id="${entry.id}">✓ Done</button>`
    : ''

  return `
    <button class="jc-btn ${next.cls}" data-action="${next.action}" data-entry-id="${entry.id}">
      ${next.label}
    </button>
    ${complete}`
}

// ── Card action listeners ────────────────────────────────────
function attachCardListeners() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const action  = btn.dataset.action
      const entryId = btn.dataset.entryId

      if (action === 'qr') {
        showQr(entryId)
        return
      }

      const colMap = { setup:'setup', running:'running', paused:'running', complete:'complete' }
      const newCol = colMap[action] || action

      try {
        await apiPatch(`/api/board?id=${entryId}`, { status: action, board_col: newCol })
        const idx = entries.findIndex(e => e.id === entryId)
        if (idx !== -1) {
          entries[idx].status    = action
          entries[idx].board_col = newCol
        }
        renderBoard()
        toastSuccess(`Job updated — ${action}`)
      } catch (err) {
        toastError('Failed to update: ' + err.message)
      }
    })
  })
}

// ── Drag and drop ────────────────────────────────────────────
let dragId = null

function attachDragListeners() {
  document.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId = card.dataset.entryId
      setTimeout(() => card.classList.add('dragging'), 0)
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging')
      dragId = null
    })
  })

  document.querySelectorAll('[data-drop-col]').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault()
      zone.classList.add('drag-over')
    })
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
    zone.addEventListener('drop', async (e) => {
      e.preventDefault()
      zone.classList.remove('drag-over')
      if (!dragId) return

      const newCol = zone.dataset.dropCol
      const entry  = entries.find(e => e.id === dragId)
      if (!entry || entry.board_col === newCol) return

      // Optimistic update
      entry.board_col = newCol
      entry.status    = newCol
      renderBoard()

      try {
        await apiPost('/api/board?action=move', { id: dragId, board_col: newCol })
        toastSuccess(`Moved to ${newCol}`)
      } catch (err) {
        toastError('Move failed: ' + err.message)
        loadBoard() // Re-sync on error
      }
    })
  })
}

// ── QR Modal ──────────────────────────────────────────────────
function showQr(entryId) {
  const entry = entries.find(e => e.id === entryId)
  if (!entry) return
  const job = entry.jobs
  const token = job?.public_token

  if (!token) { toastError('No QR token for this job'); return }

  const url = `${SITE_URL}/app/operator/job.html?token=${token}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(url)}`

  document.getElementById('qrJobLabel').textContent = `${job.job_number} — ${job.part_name}`
  document.getElementById('qrImg').src  = qrUrl
  document.getElementById('qrUrl').textContent = url
  document.getElementById('qrModal').style.display = 'flex'
}

document.getElementById('closeQr').addEventListener('click', () => { document.getElementById('qrModal').style.display = 'none' })
document.getElementById('closeQrBtn').addEventListener('click', () => { document.getElementById('qrModal').style.display = 'none' })
document.getElementById('qrModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('qrModal')) document.getElementById('qrModal').style.display = 'none'
})

// ── New Job Modal ─────────────────────────────────────────────
document.getElementById('newJobBtn').addEventListener('click', () => { document.getElementById('newJobModal').style.display = 'flex' })
document.getElementById('closeNewJob').addEventListener('click', closeNewJobModal)
document.getElementById('cancelNewJob').addEventListener('click', closeNewJobModal)
document.getElementById('newJobModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('newJobModal')) closeNewJobModal()
})

function closeNewJobModal() {
  document.getElementById('newJobModal').style.display = 'none'
  document.getElementById('newJobForm').reset()
  document.getElementById('jobFormError').style.display = 'none'
}

document.getElementById('newJobForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('saveJobBtn')
  btn.disabled    = true
  btn.textContent = 'Adding…'

  const jobNum   = document.getElementById('fJobNum').value.trim()
  const partName = document.getElementById('fPartName').value.trim()

  if (!jobNum || !partName) {
    showJobError('Job number and part name are required.')
    btn.disabled = false; btn.textContent = 'Add to Board'
    return
  }

  try {
    // Create job
    const job = await apiPost('/api/jobs', {  // POST /api/jobs (flat route)
      job_number: jobNum,
      part_name:  partName,
      quantity:   parseInt(document.getElementById('fQty').value) || 1,
      material:   document.getElementById('fMaterial').value.trim() || null,
      due_date:   document.getElementById('fDue').value || null,
      priority:   document.getElementById('fPriority').value,
    })

    // Create board entry
    const machineId = document.getElementById('fMachine').value || null
    const entry = await apiPost('/api/board', {  // POST /api/board (flat route)
      job_id:     job.id,
      machine_id: machineId,
      operation:  document.getElementById('fOperation').value.trim() || 'Machining',
      est_hours:  parseFloat(document.getElementById('fHours').value) || null,
      notes:      document.getElementById('fNotes').value.trim() || null,
      board_col:  'queue',
    })

    // Merge for local state
    entry.jobs     = { ...job, customers: null }
    entry.machines = machines.find(m => m.id === machineId) || null
    entries.unshift(entry)

    closeNewJobModal()
    renderBoard()
    toastSuccess(`Job ${job.job_number} added to board`)
  } catch (err) {
    showJobError(err.message)
  } finally {
    btn.disabled = false; btn.textContent = 'Add to Board'
  }
})

function showJobError(msg) {
  const el = document.getElementById('jobFormError')
  el.textContent = msg; el.style.display = 'block'
}

// ── Machine filter + select population ───────────────────────
function populateMachineFilter() {
  const sel = document.getElementById('machineFilter')
  sel.innerHTML = '<option value="">All machines</option>'
  machines.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.name + (m.machine_no ? ` (${m.machine_no})` : '')
    sel.appendChild(opt)
  })
  sel.addEventListener('change', () => {
    filterMachine = sel.value
    renderBoard()
  })
}

function populateMachineSelect() {
  const sel = document.getElementById('fMachine')
  sel.innerHTML = '<option value="">Unassigned</option>'
  machines.forEach(m => {
    const opt = document.createElement('option')
    opt.value = m.id
    opt.textContent = m.name + (m.machine_no ? ` (${m.machine_no})` : '')
    sel.appendChild(opt)
  })
}

// ── Refresh ───────────────────────────────────────────────────
document.getElementById('refreshBtn').addEventListener('click', loadBoard)

// Auto-refresh every 60 seconds
setInterval(loadBoard, 60_000)

// ── Utils ─────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

// ── Init ──────────────────────────────────────────────────────
loadBoard()
