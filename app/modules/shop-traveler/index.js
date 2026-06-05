import { requireModule }              from '../../_shared/auth.js'
import { renderNav }                  from '../../_shared/nav.js'
import { apiGet, apiPost, apiPatch, apiDelete } from '../../_shared/api.js'
import { toastSuccess, toastError }   from '../../_shared/toast.js'

const session = requireModule('shop-traveler')
if (!session) throw new Error('Access denied')
renderNav('/app/modules/shop-traveler/')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => document.getElementById('app-nav').classList.toggle('open'))

// ── State ──────────────────────────────────────────────────
let allJobs   = []
let templates = []
let activeJobId  = null
let activeSteps  = []
let activeJobData = null

// ── Init ───────────────────────────────────────────────────
async function init() {
  const [jobs, tmpls] = await Promise.all([
    apiGet('/api/traveler'),
    apiGet('/api/traveler?action=templates'),
  ])
  allJobs   = jobs   || []
  templates = tmpls  || []
  renderJobList(allJobs)
  document.getElementById('jobCountBadge').textContent = allJobs.length + ' jobs'
}

// ── Job list ───────────────────────────────────────────────
function renderJobList(jobs) {
  const list = document.getElementById('jobListItems')
  if (!jobs.length) {
    list.innerHTML = '<div style="padding:32px;text-align:center;color:var(--gray-300);font-size:.875rem">No jobs found</div>'
    return
  }
  list.innerHTML = jobs.map(j => {
    const t      = j.traveler
    const pct    = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0
    const fillCls = pct === 100 ? 'progress-fill--done' : ''
    const dot    = t.flagged > 0
      ? `<div class="jli-flag" title="${t.flagged} flagged"></div>`
      : t.has_traveler ? '' : `<div class="no-traveler-dot" title="No traveler"></div>`

    return `<div class="job-list-item ${j.id === activeJobId ? 'active' : ''}" data-id="${j.id}">
      ${dot}
      <div class="jli-info">
        <div class="jli-num">${esc(j.job_number)}</div>
        <div class="jli-part">${esc(j.part_name)}</div>
      </div>
      <div class="jli-progress">
        <div class="jli-frac">${t.has_traveler ? `${t.done}/${t.total}` : '—'}</div>
        ${t.has_traveler ? `<div class="progress-bar"><div class="progress-fill ${fillCls}" style="width:${pct}%"></div></div>` : ''}
      </div>
    </div>`
  }).join('')

  list.querySelectorAll('.job-list-item').forEach(el => {
    el.addEventListener('click', () => selectJob(el.dataset.id))
  })
}

// ── Select job ─────────────────────────────────────────────
async function selectJob(jobId) {
  activeJobId = jobId
  renderJobList(allJobs)  // re-render to highlight

  document.getElementById('stepsPanel').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;min-height:200px"><div class="spinner"></div></div>'

  try {
    const data = await apiGet(`/api/traveler?job_id=${jobId}`)
    activeSteps   = data.steps || []
    activeJobData = data.job
    renderSteps()
  } catch (e) { toastError('Failed to load traveler: ' + e.message) }
}

// ── Render steps ───────────────────────────────────────────
function renderSteps() {
  const j    = activeJobData
  const done = activeSteps.filter(s => s.status === 'complete').length
  const pct  = activeSteps.length > 0 ? Math.round((done / activeSteps.length) * 100) : 0

  const progressBar = activeSteps.length > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <div style="flex:1;height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct===100?'#16A34A':'var(--blue-700)'};border-radius:3px;transition:width .3s"></div>
      </div>
      <span style="font-size:.75rem;font-weight:700;color:${pct===100?'#16A34A':'var(--gray-500)'}">${done}/${activeSteps.length} done</span>
    </div>` : ''

  document.getElementById('stepsPanel').innerHTML = `
    <div class="steps-header">
      <div>
        <div class="steps-job-title">${esc(j?.job_number || '')} — ${esc(j?.part_name || '')}</div>
        <div class="steps-job-sub">${esc(j?.customers?.name || '')}${j?.material ? ' · ' + esc(j.material) : ''}${j?.quantity ? ' · Qty ' + j.quantity : ''}</div>
        ${progressBar}
      </div>
      <div class="steps-actions">
        <button class="btn-app btn-app--secondary btn-app--sm" id="applyTmplBtn">Apply Template</button>
        <button class="btn-app btn-app--secondary btn-app--sm" id="addStepBtn">+ Add Step</button>
      </div>
    </div>

    ${activeSteps.length === 0 ? `
      <div class="empty-state" style="padding:48px">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="color:#D1D5DB"><rect x="8" y="4" width="32" height="40" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M16 18h16M16 26h12M16 34h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <h3>No traveler yet</h3>
        <p>Apply a template or add steps manually to create a work order for this job.</p>
        <button class="btn-app btn-app--primary" id="emptyApplyTmpl">Apply Template</button>
      </div>
    ` : `
      <div class="step-list" id="stepList">
        ${activeSteps.map((s, i) => renderStep(s, i)).join('')}
      </div>
    `}
  `

  document.getElementById('applyTmplBtn')?.addEventListener('click',  () => openTemplateModal())
  document.getElementById('emptyApplyTmpl')?.addEventListener('click', () => openTemplateModal())
  document.getElementById('addStepBtn')?.addEventListener('click',    () => openAddStepModal())
  attachStepListeners()
}

function renderStep(s, idx) {
  const statusIcon = { pending:'', in_progress:'▶', complete:'✓', flagged:'!' }[s.status] || ''
  const dimValue = s.dimension_value
    ? `<div class="step-dim"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${s.dimension_label || 'Measured'}: <strong>${esc(s.dimension_value)} ${esc(s.dimension_unit || '')}</strong></div>`
    : (s.requires_dimension ? `<div style="font-size:.75rem;color:var(--gray-300);font-style:italic;margin-bottom:4px">${esc(s.dimension_label || 'Dimension')} — not yet recorded</div>` : '')

  const completedInfo = s.completed_at
    ? `<div class="step-done-info">Completed ${fmtTime(s.completed_at)}</div>` : ''

  const flagNote = s.flag_note
    ? `<div class="step-flag-note">⚠ ${esc(s.flag_note)}</div>` : ''

  const actions = s.status !== 'complete' ? `
    <div class="step-actions">
      ${s.status === 'pending' ? `<button class="step-btn" data-step-action="start" data-step-id="${s.id}">▶ Start</button>` : ''}
      ${s.status === 'in_progress' ? `<button class="step-btn step-btn--complete" data-step-action="complete" data-step-id="${s.id}">✓ Complete</button>` : ''}
      <button class="step-btn step-btn--flag" data-step-action="flag" data-step-id="${s.id}" data-step-title="${esc(s.title)}">Flag Issue</button>
      <button class="step-btn step-btn--del"  data-step-action="delete" data-step-id="${s.id}">Delete</button>
    </div>` : `
    <div class="step-actions">
      <button class="step-btn step-btn--del" data-step-action="delete" data-step-id="${s.id}">Delete</button>
    </div>`

  return `<div class="step-row step-row--${s.status}">
    <div class="step-num step-num--${s.status}">${statusIcon || (idx + 1)}</div>
    <div class="step-body">
      <div class="step-title">
        ${esc(s.title)}
        ${s.requires_dimension ? `<span style="font-size:.65rem;font-weight:700;background:var(--blue-50);color:var(--blue-700);padding:1px 7px;border-radius:100px;border:1px solid var(--blue-100)">DIM</span>` : ''}
      </div>
      ${s.instructions ? `<div class="step-instructions">${esc(s.instructions)}</div>` : ''}
      ${dimValue}
      ${flagNote}
      ${completedInfo}
      ${actions}
    </div>
  </div>`
}

function attachStepListeners() {
  document.querySelectorAll('[data-step-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.stepAction
      const stepId = btn.dataset.stepId

      if (action === 'start') {
        await patchStep(stepId, { status: 'in_progress' })
      } else if (action === 'complete') {
        const step = activeSteps.find(s => s.id === stepId)
        if (step?.requires_dimension) {
          const val = prompt(`Record ${step.dimension_label || 'dimension'} (${step.dimension_unit || 'in'}):`)
          if (val === null) return
          await patchStep(stepId, { status: 'complete', dimension_value: val.trim() })
        } else {
          await patchStep(stepId, { status: 'complete' })
        }
      } else if (action === 'flag') {
        openFlagModal(stepId, btn.dataset.stepTitle)
      } else if (action === 'delete') {
        if (!confirm('Delete this step?')) return
        try {
          await apiDelete(`/api/traveler?id=${stepId}`)
          toastSuccess('Step deleted')
          await refreshSteps()
        } catch (e) { toastError(e.message) }
      }
    })
  })
}

async function patchStep(stepId, updates) {
  try {
    await apiPatch(`/api/traveler?id=${stepId}`, updates)
    toastSuccess('Step updated')
    await refreshSteps()
  } catch (e) { toastError(e.message) }
}

async function refreshSteps() {
  const data = await apiGet(`/api/traveler?job_id=${activeJobId}`)
  activeSteps   = data.steps || []
  activeJobData = data.job
  renderSteps()
  // Refresh job list progress
  const jobs = await apiGet('/api/traveler')
  allJobs = jobs || []
  renderJobList(allJobs)
}

// ── Template Modal ─────────────────────────────────────────
function openTemplateModal() {
  const list = document.getElementById('tmplList')
  document.getElementById('tmplJobLabel').textContent = `Apply to: ${activeJobData?.job_number} — ${activeJobData?.part_name}`

  if (!templates.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--gray-400);font-size:.875rem;padding:20px">No templates yet.<br/>Create one in the template manager.</div>'
  } else {
    list.innerHTML = templates.map(t => `
      <div style="padding:14px 16px;border:var(--border);border-radius:var(--radius-lg);cursor:pointer;transition:all .15s" data-tmpl-id="${t.id}" class="tmpl-item">
        <div style="font-weight:700;color:var(--gray-900);font-size:.9rem">${esc(t.name)}</div>
        <div style="font-size:.75rem;color:var(--gray-500);margin-top:2px">${t.traveler_template_steps?.length || 0} steps${t.description ? ' · ' + esc(t.description) : ''}</div>
      </div>`).join('')
    list.querySelectorAll('.tmpl-item').forEach(el => {
      el.style.cssText += 'cursor:pointer'
      el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--blue-700)'; el.style.background = 'var(--blue-50)' })
      el.addEventListener('mouseleave', () => { el.style.borderColor = ''; el.style.background = '' })
      el.addEventListener('click', async () => {
        try {
          await apiPost('/api/traveler?action=apply', { template_id: el.dataset.tmplId, job_id: activeJobId })
          document.getElementById('templateModal').style.display = 'none'
          toastSuccess('Template applied')
          await refreshSteps()
        } catch (e) { toastError(e.message) }
      })
    })
  }
  document.getElementById('templateModal').style.display = 'flex'
}
document.getElementById('closeTmpl').addEventListener('click',   () => { document.getElementById('templateModal').style.display = 'none' })
document.getElementById('cancelTmpl').addEventListener('click',  () => { document.getElementById('templateModal').style.display = 'none' })
document.getElementById('templateModal').addEventListener('click', e => { if (e.target === document.getElementById('templateModal')) document.getElementById('templateModal').style.display = 'none' })

// ── Add Step Modal ─────────────────────────────────────────
function openAddStepModal() {
  document.getElementById('asJobId').value = activeJobId
  document.getElementById('asTitle').value = ''
  document.getElementById('asInstructions').value = ''
  document.getElementById('asReqDim').checked = false
  document.getElementById('asDimFields').style.display = 'none'
  document.getElementById('addStepModal').style.display = 'flex'
}
document.getElementById('closeAddStep').addEventListener('click',  () => { document.getElementById('addStepModal').style.display = 'none' })
document.getElementById('cancelAddStep').addEventListener('click', () => { document.getElementById('addStepModal').style.display = 'none' })
document.getElementById('addStepModal').addEventListener('click', e => { if (e.target === document.getElementById('addStepModal')) document.getElementById('addStepModal').style.display = 'none' })
document.getElementById('asReqDim').addEventListener('change', e => {
  document.getElementById('asDimFields').style.display = e.target.checked ? 'block' : 'none'
})

document.getElementById('addStepForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('saveStepBtn')
  btn.disabled = true; btn.textContent = 'Adding...'
  try {
    await apiPost('/api/traveler', {
      job_id:             activeJobId,
      title:              document.getElementById('asTitle').value.trim(),
      instructions:       document.getElementById('asInstructions').value.trim() || null,
      requires_dimension: document.getElementById('asReqDim').checked,
      dimension_label:    document.getElementById('asDimLabel')?.value.trim() || null,
      dimension_unit:     document.getElementById('asDimUnit')?.value || 'in',
    })
    document.getElementById('addStepModal').style.display = 'none'
    toastSuccess('Step added')
    await refreshSteps()
  } catch (err) {
    const el = document.getElementById('addStepError')
    el.textContent = err.message; el.style.display = 'block'
  } finally { btn.disabled = false; btn.textContent = 'Add Step' }
})

// ── Flag Modal ─────────────────────────────────────────────
let flaggingStepId = null
function openFlagModal(stepId, stepTitle) {
  flaggingStepId = stepId
  document.getElementById('flagStepLabel').textContent = `Step: ${stepTitle}`
  document.getElementById('flagNoteInput').value = ''
  document.getElementById('flagModal').style.display = 'flex'
}
document.getElementById('closeFlagModal').addEventListener('click', () => { document.getElementById('flagModal').style.display = 'none' })
document.getElementById('cancelFlag').addEventListener('click',     () => { document.getElementById('flagModal').style.display = 'none' })
document.getElementById('flagModal').addEventListener('click', e => { if (e.target === document.getElementById('flagModal')) document.getElementById('flagModal').style.display = 'none' })
document.getElementById('submitFlag').addEventListener('click', async () => {
  const note = document.getElementById('flagNoteInput').value.trim()
  if (!note) { alert('Please describe the issue.'); return }
  try {
    await apiPatch(`/api/traveler?id=${flaggingStepId}`, { status: 'flagged', flag_note: note })
    document.getElementById('flagModal').style.display = 'none'
    toastSuccess('Step flagged')
    await refreshSteps()
  } catch (e) { toastError(e.message) }
})

// ── Templates manager link ─────────────────────────────────
document.getElementById('manageTemplatesBtn').addEventListener('click', () => {
  alert('Template manager: create reusable step sets from here.\n\nFor now, the Demo Shop already has a "Standard CNC Part" template with 5 steps. Select any job → Apply Template to try it.')
})

// ── Job search ─────────────────────────────────────────────
document.getElementById('jobSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase()
  renderJobList(allJobs.filter(j =>
    j.job_number.toLowerCase().includes(q) || j.part_name.toLowerCase().includes(q)
  ))
})

// ── Utils ──────────────────────────────────────────────────
function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmtTime(d) { return new Date(d).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) }

init()
