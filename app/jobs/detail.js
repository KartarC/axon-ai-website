import { requireAuth }             from '../_shared/auth.js'
import { renderNav }               from '../_shared/nav.js'
import { apiGet, apiPost, apiDelete } from '../_shared/api.js'
import { toastSuccess, toastError }   from '../_shared/toast.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')
renderNav('/app/jobs/')
document.getElementById('mobileNavBtn')?.addEventListener('click', () => document.getElementById('app-nav').classList.toggle('open'))

const jobId      = new URLSearchParams(location.search).get('id')
const hasCosting = session.account.modules.includes('job-costing')

if (!jobId) { document.getElementById('pageContent').innerHTML = '<div class="empty-state"><h3>No job ID</h3><p>Go back to the jobs list.</p></div>'; }
else        { loadAll() }

let jobData, costData

async function loadAll() {
  try {
    const [job, costing] = await Promise.all([
      apiGet(`/api/jobs?id=${jobId}`),
      hasCosting ? apiGet(`/api/costing?job_id=${jobId}`) : Promise.resolve(null),
    ])
    jobData  = job
    costData = costing
    render()
  } catch (e) {
    document.getElementById('pageContent').innerHTML = `<div class="empty-state"><h3>Failed to load</h3><p>${esc(e.message)}</p></div>`
  }
}

function render() {
  const j     = jobData
  const quote = costData?.quote
  const entries = costData?.entries || []

  const totalActual = entries.reduce((s, e) => s + parseFloat(e.total_cost || 0), 0)
  const quotedPrice = parseFloat(quote?.quoted_price || 0)
  const targetMgn   = parseFloat(quote?.target_margin || 40)
  const actualMargin = quotedPrice > 0 ? ((quotedPrice - totalActual) / quotedPrice) * 100 : null
  const marginCls   = actualMargin === null ? '' : actualMargin >= targetMgn ? 'cs-margin--green' : actualMargin >= targetMgn - 10 ? 'cs-margin--amber' : 'cs-margin--red'

  const costByType = {
    labor:    entries.filter(e => e.type === 'labor').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
    material: entries.filter(e => e.type === 'material').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
    outside:  entries.filter(e => e.type === 'outside').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
    overhead: entries.filter(e => e.type === 'overhead').reduce((s, e) => s + parseFloat(e.total_cost || 0), 0),
  }

  const priorityColors = { rush:'#FFF1F2', high:'#FFF7ED', normal:'var(--gray-100)', low:'var(--gray-50)' }
  const priorityText   = { rush:'#DC2626',  high:'#D97706',  normal:'var(--gray-600)', low:'var(--gray-400)' }

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${esc(j.job_number)} — ${esc(j.part_name)}</h1>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
          <span style="padding:2px 10px;border-radius:100px;font-size:.72rem;font-weight:700;background:${priorityColors[j.priority]};color:${priorityText[j.priority]}">${j.priority}</span>
          <span style="font-size:.82rem;color:var(--gray-400)">Qty: ${j.quantity}${j.material ? ' · ' + esc(j.material) : ''}${j.due_date ? ' · Due ' + fmtDate(j.due_date) : ''}</span>
        </div>
      </div>
      <a href="/app/modules/production-board/" class="btn-app btn-app--secondary btn-app--sm">View on Board</a>
    </div>

    <div class="job-detail-grid">
      <div>
        <!-- Job info -->
        <div class="job-info-card">
          <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--gray-400);margin-bottom:12px">Job Information</div>
          <div class="job-info-grid">
            <div class="ji-field"><label>Customer</label><span>${esc(j.customers?.name || '—')}</span></div>
            <div class="ji-field"><label>Quantity</label><span>${j.quantity} pieces</span></div>
            <div class="ji-field"><label>Material</label><span>${esc(j.material || '—')}</span></div>
            <div class="ji-field"><label>Revision</label><span>${esc(j.revision || '—')}</span></div>
            <div class="ji-field"><label>Due Date</label><span>${j.due_date ? fmtDate(j.due_date) : '—'}</span></div>
            <div class="ji-field"><label>Status</label><span style="text-transform:capitalize">${j.status.replace('_',' ')}</span></div>
          </div>
          ${j.notes ? `<div style="margin-top:14px;padding:10px 14px;background:var(--gray-50);border-radius:var(--radius);font-size:.85rem;color:var(--gray-600);line-height:1.6">${esc(j.notes)}</div>` : ''}
        </div>

        <!-- Cost entries -->
        ${hasCosting ? `
        <div class="entries-card">
          <div class="entries-header">
            <div class="entries-title">Cost Breakdown</div>
            ${!quote ? `<button class="btn-app btn-app--secondary btn-app--sm" id="setQuoteTopBtn">Set Quote</button>` : ''}
          </div>

          ${entries.length ? `
          <table class="costs">
            <thead><tr><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Total</th><th></th></tr></thead>
            <tbody>
              ${entries.map(e => `
                <tr>
                  <td><span class="type-pill type-${e.type}">${e.type}</span></td>
                  <td>${esc(e.description)}${e.source === 'auto' ? '<span class="auto-badge">auto</span>' : ''}</td>
                  <td class="num">${parseFloat(e.quantity).toFixed(2)}</td>
                  <td class="num">${fmt$(e.unit_cost)}</td>
                  <td class="num" style="font-weight:700">${fmt$(e.total_cost)}</td>
                  <td>${e.source !== 'auto' ? `<button class="del-btn" data-entry-id="${e.id}" title="Delete">x</button>` : ''}</td>
                </tr>
              `).join('')}
              <tr style="background:var(--gray-50)">
                <td colspan="4" style="font-weight:800;font-size:.82rem;color:var(--gray-500)">TOTAL ACTUAL COST</td>
                <td class="num" style="font-weight:900;color:var(--gray-900)">${fmt$(totalActual)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          ` : `<div class="empty-state" style="padding:30px"><p>No cost entries yet. Add a cost below or complete an operation on the board to auto-log labor.</p></div>`}

          <div class="add-cost-section">
            <div class="add-cost-title">Add Cost Entry</div>
            <form id="addCostForm" novalidate>
              <div class="add-cost-grid">
                <div>
                  <label class="form-label">Type</label>
                  <select class="form-select" id="acType">
                    <option value="labor">Labor</option>
                    <option value="material">Material</option>
                    <option value="outside">Outside Service</option>
                    <option value="overhead">Overhead</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Description *</label>
                  <input class="form-input" id="acDesc" placeholder="e.g. 6061-T6 Aluminum bar stock" required/>
                </div>
                <div>
                  <label class="form-label">Qty</label>
                  <input class="form-input" type="number" id="acQty" step="0.01" value="1" min="0.01"/>
                </div>
                <div>
                  <label class="form-label">Unit Cost ($) *</label>
                  <input class="form-input" type="number" id="acUnitCost" step="0.01" min="0" placeholder="95.00" required/>
                </div>
                <div style="padding-bottom:1px">
                  <button type="submit" class="btn-app btn-app--primary" id="addCostBtn" style="width:100%">Add</button>
                </div>
              </div>
              <div id="addCostError" style="display:none;margin-top:8px;font-size:.78rem;color:#DC2626"></div>
            </form>
          </div>
        </div>
        ` : '<div class="acard"><p style="color:var(--gray-400);font-size:.875rem">Enable the Job Costing module to track costs for this job.</p></div>'}
      </div>

      <!-- Sidebar -->
      ${hasCosting ? `
      <div>
        <div class="cost-summary">
          <div class="cs-title">Cost Summary</div>

          ${quote ? `
          <div class="cs-row"><span class="cs-row-label">Quoted Price</span><span class="cs-row-val" style="color:var(--blue-700)">${fmt$(quotedPrice)}</span></div>
          <div class="cs-row"><span class="cs-row-label">Target Margin</span><span class="cs-row-val">${targetMgn}%</span></div>
          <div class="cs-row"><span class="cs-row-label">Target Cost</span><span class="cs-row-val">${fmt$(quotedPrice * (1 - targetMgn / 100))}</span></div>
          <div style="height:1px;background:var(--gray-200);margin:4px 0"></div>
          ` : `<div style="padding:12px;background:var(--blue-50);border-radius:var(--radius);margin-bottom:16px;font-size:.82rem;color:var(--blue-700);font-weight:600">No quote set yet. Set a quoted price to track margin.</div>`}

          <div class="cs-row"><span class="cs-row-label">Labor</span><span class="cs-row-val">${fmt$(costByType.labor)}</span></div>
          <div class="cs-row"><span class="cs-row-label">Material</span><span class="cs-row-val">${fmt$(costByType.material)}</span></div>
          <div class="cs-row"><span class="cs-row-label">Outside</span><span class="cs-row-val">${fmt$(costByType.outside)}</span></div>
          <div class="cs-row"><span class="cs-row-label">Overhead</span><span class="cs-row-val">${fmt$(costByType.overhead)}</span></div>
          <div class="cs-row cs-total"><span class="cs-row-label">Total Actual</span><span class="cs-row-val">${fmt$(totalActual)}</span></div>

          ${actualMargin !== null ? `
          <div class="cs-margin ${marginCls}">
            <div class="cs-margin-pct">${actualMargin.toFixed(1)}%</div>
            <div class="cs-margin-label">Current Margin</div>
          </div>
          <div class="cs-target">Target: ${targetMgn}% · ${actualMargin >= targetMgn ? 'On track' : (actualMargin - targetMgn).toFixed(1) + '% below target'}</div>
          ` : ''}

          <div style="margin-top:16px">
            <button class="btn-app btn-app--secondary" style="width:100%" id="setQuoteSideBtn">
              ${quote ? 'Edit Quote' : 'Set Quote'}
            </button>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `

  // Delete entry
  document.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this cost entry?')) return
      try {
        await apiDelete(`/api/costing?id=${btn.dataset.entryId}`)
        toastSuccess('Entry deleted')
        await loadAll()
      } catch (e) { toastError(e.message) }
    })
  })

  // Add cost form
  document.getElementById('addCostForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('addCostBtn')
    btn.disabled = true; btn.textContent = '...'
    try {
      await apiPost('/api/costing', {
        job_id:    jobId,
        type:      document.getElementById('acType').value,
        description: document.getElementById('acDesc').value.trim(),
        quantity:  parseFloat(document.getElementById('acQty').value),
        unit_cost: parseFloat(document.getElementById('acUnitCost').value),
      })
      toastSuccess('Cost entry added')
      document.getElementById('acDesc').value = ''
      document.getElementById('acUnitCost').value = ''
      await loadAll()
    } catch (err) {
      const el = document.getElementById('addCostError')
      el.textContent = err.message; el.style.display = 'block'
    } finally { btn.disabled = false; btn.textContent = 'Add' }
  })

  // Set quote buttons
  const openQuote = () => {
    const price = quote?.quoted_price || ''
    const mgn   = quote?.target_margin || 40
    const qp    = prompt(`Set quoted price for ${j.job_number}:`, price)
    if (qp === null) return
    const qm    = prompt('Target margin % (e.g. 40):', mgn)
    if (qm === null) return
    apiPost('/api/costing?action=quote', { job_id: jobId, quoted_price: parseFloat(qp), target_margin: parseFloat(qm) })
      .then(() => { toastSuccess('Quote saved'); loadAll() })
      .catch(e => toastError(e.message))
  }
  document.getElementById('setQuoteTopBtn')?.addEventListener('click', openQuote)
  document.getElementById('setQuoteSideBtn')?.addEventListener('click', openQuote)
}

function fmt$(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }
function esc(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) }
