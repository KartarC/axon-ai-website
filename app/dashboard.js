import { requireAuth } from './_shared/auth.js'
import { renderNav }   from './_shared/nav.js'
import { MODULES, getAllModules, getVisibleModules } from './_shared/modules.js'

const session = requireAuth()
if (!session) throw new Error('Not authenticated')

renderNav('/app/dashboard.html')

// Mobile nav toggle
document.getElementById('mobileNavBtn')?.addEventListener('click', () => {
  document.getElementById('app-nav').classList.toggle('open')
})

const visibleModules = getVisibleModules(session.account)
const allModules     = getAllModules()
const lockedModules  = allModules.filter(m => !visibleModules.find(v => v.slug === m.slug))

const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
const firstName = (session.fullName || session.user?.email || 'there').split(' ')[0]

const content = document.getElementById('dashContent')
content.innerHTML = `
  <div class="dash-greeting">${greeting}, ${escHtml(firstName)}</div>
  <div class="dash-sub">${escHtml(session.account.name)} · ${visibleModules.length} module${visibleModules.length !== 1 ? 's' : ''} active</div>

  ${visibleModules.length > 0 ? `
    <div class="dash-section-label">Your modules</div>
    <div class="modules-grid">
      ${visibleModules.map(m => `
        <a href="${m.path}" class="module-tile">
          <div class="module-tile-icon">${m.icon}</div>
          <div>
            <div class="module-tile-name">${m.name}</div>
            <div class="module-tile-desc">${m.desc}</div>
          </div>
          <div class="module-tile-roi">${m.roi}</div>
          <div class="module-tile-arrow">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </a>
      `).join('')}
    </div>
  ` : `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="8" width="36" height="32" rx="4" stroke="#D1D5DB" stroke-width="2"/><path d="M16 24h16M24 16v16" stroke="#D1D5DB" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <h3>No modules enabled yet</h3>
      <p>Contact your Billet account manager to activate your modules.</p>
    </div>
  `}

  ${lockedModules.length > 0 ? `
    <div class="dash-section-label">Also available</div>
    <div class="modules-grid">
      ${lockedModules.map(m => `
        <div class="module-tile module-tile--locked">
          <div class="module-tile-icon" style="background:var(--gray-100);border-color:var(--gray-200);color:var(--gray-400)">${m.icon}</div>
          <div>
            <div class="module-tile-name" style="color:var(--gray-500)">${m.name}</div>
            <div class="module-tile-desc">${m.desc}</div>
          </div>
          <div class="lock-badge">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1.5" y="4.5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M3.5 4.5V3a2 2 0 0 1 4 0v1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
            Add module
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''}
`

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
