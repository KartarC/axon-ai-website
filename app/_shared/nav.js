// Billet — App shell nav renderer
import { getSession, logout } from './auth.js'
import { getVisibleModules } from './modules.js'

export function renderNav(activePath = '') {
  const session = getSession()
  if (!session) return

  const modules = getVisibleModules(session.account)
  const accountName = session.account.name
  const planLabel = { starter:'Starter', growth:'Growth', suite:'Suite', trial:'Trial' }[session.account.plan] || session.account.plan
  const trialDaysLeft = (session.account.plan === 'trial' && session.account.trial_ends_at)
    ? Math.max(0, Math.ceil((new Date(session.account.trial_ends_at) - new Date()) / 86400000))
    : null

  const navEl = document.getElementById('app-nav')
  if (!navEl) return

  navEl.innerHTML = `
    <div class="anav-inner">
      <a href="/app/dashboard.html" class="anav-logo">
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="24" height="24" rx="7" fill="#1F2937"/>
          <rect x="18" y="4" width="5.5" height="5.5" rx="1.4" fill="#F59E0B"/>
          <text x="14" y="20" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" fill="#FAFAF9" text-anchor="middle">B</text>
        </svg>
        <span class="anav-logo-text">Billet</span>
      </a>

      <div class="anav-account">
        <span class="anav-shop-name">${escHtml(accountName)}</span>
        <span class="anav-plan-badge">${planLabel}</span>
      </div>
      ${trialDaysLeft !== null ? `<a href="/pricing.html" style="display:block;margin:0 14px 12px;padding:8px 12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:.72rem;font-weight:700;color:#C2410C;text-decoration:none;text-align:center">${trialDaysLeft} day${trialDaysLeft===1?'':'s'} left in trial · Upgrade</a>` : ''}

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
