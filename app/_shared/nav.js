// Axon AI — App shell nav renderer
import { getSession, logout } from './auth.js'
import { getVisibleModules } from './modules.js'

export function renderNav(activePath = '') {
  const session = getSession()
  if (!session) return

  const modules = getVisibleModules(session.account)
  const accountName = session.account.name
  const planLabel = { starter:'Starter', growth:'Growth', suite:'Suite' }[session.account.plan] || session.account.plan

  const navEl = document.getElementById('app-nav')
  if (!navEl) return

  navEl.innerHTML = `
    <div class="anav-inner">
      <a href="/app/dashboard.html" class="anav-logo">
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="3" fill="#1D4ED8"/>
          <circle cx="4" cy="8" r="2" fill="#1D4ED8" opacity=".4"/>
          <circle cx="24" cy="8" r="2" fill="#1D4ED8" opacity=".4"/>
          <circle cx="4" cy="20" r="2" fill="#1D4ED8" opacity=".4"/>
          <circle cx="24" cy="20" r="2" fill="#1D4ED8" opacity=".4"/>
          <line x1="14" y1="11" x2="5.2" y2="9.2" stroke="#1D4ED8" stroke-width="1.1" opacity=".5"/>
          <line x1="14" y1="11" x2="22.8" y2="9.2" stroke="#1D4ED8" stroke-width="1.1" opacity=".5"/>
          <line x1="14" y1="17" x2="5.2" y2="18.8" stroke="#1D4ED8" stroke-width="1.1" opacity=".5"/>
          <line x1="14" y1="17" x2="22.8" y2="18.8" stroke="#1D4ED8" stroke-width="1.1" opacity=".5"/>
        </svg>
        <span class="anav-logo-text"><strong>Axon</strong> AI</span>
      </a>

      <div class="anav-account">
        <span class="anav-shop-name">${escHtml(accountName)}</span>
        <span class="anav-plan-badge">${planLabel}</span>
      </div>

      <ul class="anav-modules">
        <li class="anav-section-label">Modules</li>
        ${modules.map(m => `
          <li>
            <a href="${m.path}" class="anav-link ${activePath.includes(m.slug) ? 'active' : ''}">
              ${m.icon}
              <span>${m.name}</span>
            </a>
          </li>
        `).join('')}
        <li>
          <a href="/app/jobs/" class="anav-link ${activePath.includes('/jobs/') ? 'active' : ''}">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="2" width="16" height="18" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M7 7h8M7 11h6M7 15h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span>All Jobs</span>
          </a>
        </li>
      </ul>

      <div class="anav-footer">
        <a href="/app/settings.html" class="anav-link ${activePath.includes('/settings') ? 'active' : ''}">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.3"/>
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <span>Settings</span>
        </a>
        <button class="anav-link anav-logout" id="logoutBtn">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M13 14l4-4-4-4M17 10H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  `

  document.getElementById('logoutBtn')?.addEventListener('click', logout)
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
