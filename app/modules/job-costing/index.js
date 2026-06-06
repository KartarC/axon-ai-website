import { requireModule }              from '../../_shared/auth.js'
import { renderNav }                  from '../../_shared/nav.js'
import { apiGet, apiPost }            from '../../_shared/api.js'
import { toastSuccess, toastError }   from '../../_shared/toast.js'

const session = requireModule('job-costing')
if (!session) throw new Error('Access denied')
renderNav('/app/modules/job-costing/')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => document.getElementById('app-nav').classList.toggle('open'))

let allJobs  = []
let activeFilter = 'all'

// ── Load data ──────────────────────────────────────────────
async function loadData() {
  try {
    allJobs = await apiGet('/api/costing?action=summary')
    renderStats()
    renderTable()
  } catch (e) {
    toastError('Failed to load costing data: ' + e.message)
  }
}

// ── Stats ──────────────────────────────────────────────────
function renderStats() {
  const withQuote   = allJobs.filter(j => j.has_quote)
  const totalQuoted = withQuote.reduce((s, j) => s + j.quoted_price, 0)
  const totalActual = allJobs.reduce((s, j) => s + j.actual_cost, 0)
  const margins     = withQuote.filter(j => j.margin_pct !== null).map(j => j.margin_pct)
  const avgMargin   = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null

  // "At Risk" = at_risk OR over (any job that needs attention)
  const alertCount  = allJobs.filter(j => j.budget_alert === 'at_risk' || j.budget_alert === 'over').length

  document.getElementById('sQuoted').textContent = totalQuoted > 0 ? fmt$(totalQuoted) : '—'
  document.getElementById('sActual').textContent = totalActual > 0 ? fmt$(totalActual) : '—'
  document.getElementById('sMargin').textContent = avgMargin !== null ? avgMargin.toFixed(1) + '%' : '—'
  document.getElementById('sOver').textContent   = alertCount

  // Colour cards
  const marginCard = document.getElementById('sMargin').closest('.cstat')
  marginCard.classList.toggle('cstat--red',   avgMargin !== null && avgMargin < 20)
  marginCard.classList.toggle('cstat--green', avgMargin !== null && avgMargin >= 20)

  const alertCard = document.getElementById('sOver').closest('.cstat')
  alertCard.classList.toggle('cstat--red', alertCount > 0)
}

// ── Table ──────────────────────────────────────────────────
function renderTable() {
  const q = document.getElementById('searchInput').value.toLowerCase()

  let jobs = allJobs.filter(j => {
    if (q) {
      const match = j.job_number.toLowerCase().includes(q) ||
        j.part_name.toLowerCase().includes(q) ||
        (j.customer || '').toLowerCase().includes(q)
      if (!match) return false
    }
    if (activeFilter === 'at-risk')  return j.budget_alert === 'at_risk' || j.budget_alert === 'over'
    if (activeFilter === 'over')     return j.has_quote && j.margin_pct !== null && j.margin_pct < j.target_margin
    if (activeFilter === 'on')       return j.has_quote && j.margin_pct !== null && j.margin_pct >= j.target_margin
    if (activeFilter === 'no-quote') return !j.has_quote
    return true
  })

  const statusColors = {
    open:        'var(--gray-100)',  in_progress: '#EFF6FF',
    complete:    '#F0FDF4',         shipped:     '#F0FDF4',
    on_hold:     '#FFFBEB',         cancelled:   '#FFF1F2',
  }
  const statusText = {
    open: 'Open', in_progress: 'In Progress', complete: 'Complete',
    shipped: 'Shipped', on_hold: 'On Hold', cancelled: 'Cancelled',
  }

  const tbody = document.getElementById('jobsTbody')
  if (!jobs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400)">No jobs match this filter.</td></tr>`
    return
  }

  tbody.innerHTML = jobs.map(j => {
    const quotedStr   = j.has_quote ? fmt$(j.quoted_price) : '—'
    const actualStr   = j.actual_cost > 0 ? fmt$(j.actual_cost) : '—'
    const sc          = statusColors[j.status] || statusColors.open
    const stLabel     = statusText[j.status]   || j.status

    // Budget alert icon + row class
    const alertIcon = j.budget_alert === 'over'
      ? `<span class="budget-icon" title="Over budget — costs have exceeded the quoted price">🔴</span>`
      : j.budget_alert === 'at_risk'
      ? `<span class="budget-icon" title="At risk — costs are tracking toward the budget limit">⚠️</span>`
      : ''
    const rowCls = j.budget_alert === 'over' ? 'row--over' : j.budget_alert === 'at_risk' ? 'row--at-risk' : ''

    let varianceStr = '—', marginStr = '—'
    if (j.has_quote && j.margin_pct !== null) {
      const cost_target = j.quoted_price * (1 - j.target_margin / 100)
      const variance    = j.actual_cost - cost_target
      const over        = variance > 0
      varianceStr = `<span class="${over ? 'variance-over' : 'variance-ok'}">${over ? '+' : '-'}${fmt$(Math.abs(variance))}</span>`

      const mp    = j.margin_pct
      const cls   = mp >= j.target_margin ? 'green' : mp >= j.target_margin - 10 ? 'amber' : 'red'
      marginStr   = `<span class="margin-pill margin-pill--${cls}">${mp.toFixed(1)}%</span>`
    }

    const actionCell = j.has_quote
      ? `<button class="set-quote-btn" data-id="${j.id}" data-num="${esc(j.job_number)}" data-part="${esc(j.part_name)}" data-price="${j.quoted_price}" data-margin="${j.target_margin}">Edit quote</button>`
      : `<button class="set-quote-btn" data-id="${j.id}" data-num="${esc(j.job_number)}" data-part="${esc(j.part_name)}">Set quote</button>`

    return `<tr class="clickable ${rowCls}" data-job-id="${j.id}">
      <td><span class="job-num">${esc(j.job_number)}${alertIcon}</span><span class="job-part">${esc(j.part_name)}</span></td>
      <td style="color:var(--gray-500)">${esc(j.customer || '—')}</td>
      <td class="num-cell">${quotedStr}</td>
      <td class="num-cell">${actualStr}</td>
      <td class="num-cell">${varianceStr}</td>
      <td class="num-cell">${marginStr}</td>
      <td><span style="padding:2px 9px;border-radius:100px;font-size:.68rem;font-weight:700;background:${sc};color:var(--gray-700)">${stLabel}</span></td>
      <td>${actionCell}</td>
    </tr>`
  }).join('')

  // Row click → job detail
  tbody.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.set-quote-btn')) return
      window.location.href = `/app/jobs/detail.html?id=${row.dataset.jobId}`
    })
  })

  // Set quote button
  tbody.querySelectorAll('.set-quote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openQuoteModal(btn.dataset.id, btn.dataset.num, btn.dataset.part, btn.dataset.price, btn.dataset.margin)
    })
  })
}

// ── Quote Modal ────────────────────────────────────────────
function openQuoteModal(jobId, jobNum, partName, price, margin) {
  document.getElementById('quoteJobId').value    = jobId
  document.getElementById('quoteJobLabel').textContent = `${jobNum} — ${partName}`
  document.getElementById('qPrice').value        = price || ''
  document.getElementById('qMargin').value       = margin || 40
  document.getElementById('qNotes').value        = ''
  document.getElementById('quoteError').style.display = 'none'
  document.getElementById('quoteModal').style.display = 'flex'
}

document.getElementById('closeQuote').addEventListener('click',  () => { document.getElementById('quoteModal').style.display = 'none' })
document.getElementById('cancelQuote').addEventListener('click', () => { document.getElementById('quoteModal').style.display = 'none' })
document.getElementById('quoteModal').addEventListener('click',  (e) => { if (e.target === document.getElementById('quoteModal')) document.getElementById('quoteModal').style.display = 'none' })

document.getElementById('quoteForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('saveQuoteBtn')
  btn.disabled = true; btn.textContent = 'Saving...'

  try {
    await apiPost('/api/costing?action=quote', {
      job_id:       document.getElementById('quoteJobId').value,
      quoted_price: parseFloat(document.getElementById('qPrice').value),
      target_margin: parseFloat(document.getElementById('qMargin').value),
      notes:        document.getElementById('qNotes').value || null,
    })
    document.getElementById('quoteModal').style.display = 'none'
    toastSuccess('Quote saved')
    await loadData()
  } catch (err) {
    const el = document.getElementById('quoteError')
    el.textContent = err.message; el.style.display = 'block'
  } finally {
    btn.disabled = false; btn.textContent = 'Save Quote'
  }
})

// ── Filters ────────────────────────────────────────────────
document.getElementById('filterTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-filter]')
  if (!tab) return
  activeFilter = tab.dataset.filter
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t === tab))
  renderTable()
})
document.getElementById('searchInput').addEventListener('input', renderTable)
document.getElementById('refreshBtn').addEventListener('click', loadData)

// ── Utils ──────────────────────────────────────────────────
function fmt$(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

loadData()
