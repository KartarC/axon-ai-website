import { requireAuth } from './_shared/auth.js'
import { apiPost }     from './_shared/api.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')

// ── Machine presets (mill/lathe + fabrication equipment) ──────
const PRESETS = [
  { label: 'VMC Mill',     name: 'VMC Mill',     type: 'mill',        rate: 95  },
  { label: 'CNC Lathe',    name: 'CNC Lathe',    type: 'lathe',       rate: 85  },
  { label: 'Fiber Laser',  name: 'Fiber Laser',  type: 'laser',       rate: 110 },
  { label: 'Waterjet',     name: 'Waterjet',     type: 'waterjet',    rate: 75  },
  { label: 'Press Brake',  name: 'Press Brake',  type: 'press_brake', rate: 70  },
  { label: 'Weld Station', name: 'Weld Station', type: 'weld',        rate: 60  },
]
const TYPES = [
  ['mill','Mill'], ['lathe','Lathe'], ['laser','Laser'], ['waterjet','Waterjet'],
  ['plasma','Plasma'], ['press_brake','Press Brake'], ['weld','Weld'],
  ['grinder','Grinder'], ['inspection','Inspection'], ['other','Other'],
]

const rowsEl  = document.getElementById('machineRows')
const emptyEl = document.getElementById('mEmpty')

function typeOptions(sel) {
  return TYPES.map(([v,l]) => `<option value="${v}"${v===sel?' selected':''}>${l}</option>`).join('')
}
function addRow(name='', type='mill', rate='') {
  const div = document.createElement('div')
  div.className = 'mrow'
  div.innerHTML =
    `<input class="m-name" placeholder="e.g. Haas VF-2" value="${name.replace(/"/g,'&quot;')}"/>` +
    `<select class="m-type">${typeOptions(type)}</select>` +
    `<input class="m-rate" type="number" min="0" step="1" placeholder="0" value="${rate}"/>` +
    `<button class="rm" title="Remove" type="button">×</button>`
  div.querySelector('.rm').addEventListener('click', () => { div.remove(); refreshEmpty() })
  rowsEl.appendChild(div)
  refreshEmpty()
}
function refreshEmpty() { emptyEl.classList.toggle('hidden', rowsEl.children.length > 0) }

// Preset chips
const presetsEl = document.getElementById('presets')
PRESETS.forEach(p => {
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'ob-chip'
  b.innerHTML = `<span>+</span> ${p.label}`
  b.addEventListener('click', () => addRow(p.name, p.type, p.rate))
  presetsEl.appendChild(b)
})
const custom = document.createElement('button')
custom.type = 'button'; custom.className = 'ob-chip'
custom.innerHTML = `<span>+</span> Custom`
custom.addEventListener('click', () => addRow())
presetsEl.appendChild(custom)
refreshEmpty()

// ── Step navigation ───────────────────────────────────────────
function goStep(n) {
  document.querySelectorAll('[data-step]').forEach(s => s.classList.toggle('hidden', +s.dataset.step !== n))
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('dot' + i)
    dot.classList.toggle('active', i === n)
    dot.classList.toggle('done', i < n)
    if (i < n) dot.innerHTML = '✓'
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function showErr(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.style.display = 'block' }
function hideErr(id) { document.getElementById(id).style.display = 'none' }

// ── Step 1 → save machines ────────────────────────────────────
document.getElementById('next1').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  hideErr('err1')
  const rows = [...rowsEl.querySelectorAll('.mrow')].map(r => ({
    name: r.querySelector('.m-name').value.trim(),
    type: r.querySelector('.m-type').value,
    hourly_rate: r.querySelector('.m-rate').value,
  })).filter(m => m.name)

  btn.disabled = true; btn.textContent = 'Saving…'
  try {
    for (let i = 0; i < rows.length; i++) {
      await apiPost('/api/machines', { ...rows[i], sort_order: i })
    }
    goStep(2)
  } catch (err) {
    showErr('err1', 'Could not save machines: ' + err.message)
  } finally {
    btn.disabled = false
    btn.innerHTML = 'Continue <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M8 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
})
document.getElementById('skip1').addEventListener('click', () => goStep(2))
document.getElementById('back2').addEventListener('click', () => goStep(1))

// ── Step 2 → sample data or blank ─────────────────────────────
const SAMPLE_JOBS = [
  { job_number: 'J-101', part_name: 'Sample — Aluminum Bracket', material: '6061-T6 Aluminum', quantity: 10, priority: 'normal', status: 'open' },
  { job_number: 'J-102', part_name: 'Sample — Stainless Flange', material: '304 Stainless',    quantity: 6,  priority: 'high',   status: 'in_progress' },
  { job_number: 'J-103', part_name: 'Sample — Steel Shaft',      material: '4140 Steel',       quantity: 20, priority: 'normal', status: 'open' },
]
document.getElementById('optSample').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  hideErr('err2'); btn.style.opacity = '.6'; btn.style.pointerEvents = 'none'
  try {
    for (const j of SAMPLE_JOBS) await apiPost('/api/jobs', j)
    document.getElementById('doneMsg').textContent = 'We added 3 sample jobs to your board. Open the Production Board to see them.'
    goStep(3)
  } catch (err) {
    showErr('err2', 'Could not add samples: ' + err.message)
    btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'
  }
})
document.getElementById('optBlank').addEventListener('click', () => goStep(3))

// ── Step 3 → mark onboarded + go to app ───────────────────────
document.getElementById('finish').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  btn.disabled = true; btn.textContent = 'Opening…'
  try { await apiPost('/api/auth?action=complete-onboarding', {}) } catch (_) { /* non-blocking */ }
  window.location.href = '/app/dashboard.html'
})
