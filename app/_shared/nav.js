import { getSession, logout } from './auth.js'
import { getVisibleModules } from './modules.js'
let cleanupNav = () => {}
const icon = paths => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>'
const icons = {
 overview:icon('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
 jobs:icon('<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M9 5V3h6v2M8 11h8M8 16h5"/>'),
 billing:icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>'),
 settings:icon('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>'),
 logout:icon('<path d="M9 4H5v16h4M13 8l4 4-4 4M9 12h12"/>'),
 collapse:icon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M16 9l-3 3 3 3"/>'),
 light:icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>'),
 dark:icon('<path d="M20 15A9 9 0 019 4a9 9 0 1011 11Z"/>')
}
export function renderNav(activePath = '') {
  const session = getSession(), navEl = document.getElementById('app-nav')
  if (!session || !navEl) return
  cleanupNav()
  const modules = getVisibleModules(session.account).filter(m => !m.roles || m.roles.includes(session.role))
  const accountName = session.account.name
  const canBill = ['owner','admin'].includes(session.role)
  const link = (name, href, glyph, active) => '<a href="'+href+'" class="anav-link '+(active?'active':'')+'" title="'+name+'" aria-label="'+name+'"'+(active?' aria-current="page"':'')+'>'+glyph+'<span>'+name+'</span></a>'
  navEl.innerHTML = '<div class="anav-inner">'+
    '<div class="anav-top"><a href="/app/dashboard.html" class="anav-logo" aria-label="Ovrendi overview"><img src="/assets/ovrendi-mark.svg" width="32" height="32" alt=""><span class="anav-logo-text">Ovrendi</span></a><button class="anav-collapse" id="sidebarCollapse" type="button">'+icons.collapse+'</button></div>'+
    '<div class="anav-account"><span class="anav-shop-name">'+escHtml(accountName)+'</span><span class="anav-plan-badge">'+escHtml(session.account.plan)+' workspace</span></div>'+
    '<div class="anav-scroll"><section class="anav-group" aria-label="Account"><h2 class="anav-section-label">Account</h2>'+link('Overview','/app/dashboard.html',icons.overview,activePath.includes('/dashboard'))+(canBill?link('Plan & billing','/app/billing.html',icons.billing,activePath.includes('/billing')):'')+'</section>'+
    '<section class="anav-group" aria-label="Workspace"><h2 class="anav-section-label">Workspace</h2>'+link('All jobs','/app/jobs/',icons.jobs,activePath.includes('/jobs/'))+modules.map(m=>link(m.name,m.path,m.icon,activePath.includes(m.slug))).join('')+'</section>'+
    '<section class="anav-group" aria-label="Administration"><h2 class="anav-section-label">Administration</h2>'+link('Settings','/app/settings.html',icons.settings,activePath.includes('/settings'))+'</section></div>'+
    '<div class="anav-footer"><div class="anav-theme" role="group" aria-label="Appearance"><button type="button" data-theme-choice="light" title="Light mode" aria-label="Light mode">'+icons.light+'<span>Light</span></button><button type="button" data-theme-choice="dark" title="Dark mode" aria-label="Dark mode">'+icons.dark+'<span>Dark</span></button></div><button class="anav-link anav-logout" id="logoutBtn" title="Sign out" aria-label="Sign out">'+icons.logout+'<span>Sign out</span></button></div></div>'
  const collapse = document.getElementById('sidebarCollapse')
  const syncCollapse = () => {
    const collapsed = document.documentElement.dataset.sidebar === 'collapsed'
    collapse.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    collapse.setAttribute('aria-label', collapse.title)
    collapse.setAttribute('aria-expanded', String(!collapsed))
  }
  collapse.addEventListener('click', () => {
    document.documentElement.dataset.sidebar = document.documentElement.dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed'
    try { localStorage.setItem('ovrendi_sidebar', document.documentElement.dataset.sidebar) } catch (_) {}
    syncCollapse()
  })
  syncCollapse()
  const syncTheme = () => navEl.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === document.documentElement.dataset.appTheme)))
  navEl.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
    document.documentElement.dataset.appTheme = button.dataset.themeChoice
    try { localStorage.setItem('ovrendi_app_theme', button.dataset.themeChoice) } catch (_) {}
    syncTheme()
  }))
  syncTheme()
  document.getElementById('logoutBtn').addEventListener('click', logout)
  const opener = document.getElementById('mobileNavBtn')
  if (opener) {
    const mobile = matchMedia('(max-width: 768px)')
    const main = document.querySelector('.app-main')
    const closeButton = document.createElement('button')
    closeButton.className = 'anav-close'
    closeButton.type = 'button'
    closeButton.textContent = '×'
    closeButton.setAttribute('aria-label', 'Close menu')
    navEl.prepend(closeButton)
    const backdrop = document.createElement('button')
    backdrop.className = 'anav-backdrop'
    backdrop.type = 'button'
    backdrop.setAttribute('aria-label', 'Close navigation')
    backdrop.tabIndex = -1
    backdrop.hidden = true
    document.body.append(backdrop)
    const close = () => { navEl.classList.remove('open'); sync(); opener.focus() }
    const sync = () => {
      const open = mobile.matches && navEl.classList.contains('open')
      navEl.inert = mobile.matches && !open
      if (main) main.inert = open
      backdrop.hidden = !open
      opener.setAttribute('aria-expanded', String(open))
      opener.setAttribute('aria-controls', 'app-nav')
      if (open && !navEl.contains(document.activeElement)) closeButton.focus()
    }
    closeButton.addEventListener('click', close)
    backdrop.addEventListener('click', close)
    const onNavKeydown = event => {
      if (!mobile.matches || !navEl.classList.contains('open')) return
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const items = [...navEl.querySelectorAll('a[href],button:not(:disabled)')].filter(e => e.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    navEl.addEventListener('keydown', onNavKeydown)
    const observer = new MutationObserver(sync)
    observer.observe(navEl, {attributes:true, attributeFilter:['class']})
    mobile.addEventListener('change', sync)
    sync()
    cleanupNav = () => { observer.disconnect(); mobile.removeEventListener('change', sync); navEl.removeEventListener('keydown', onNavKeydown); backdrop.remove(); if (main) main.inert = false }
  }
}

function escHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
