/* ── NAV SCROLL ─────────────────────────────────────────────────────────── */
const nav = document.getElementById('nav')
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10)
}, { passive: true })

/* ── MOBILE NAV ─────────────────────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger')
const mobileMenu = document.getElementById('mobileMenu')
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'))
window.closeMobile = () => mobileMenu.classList.remove('open')
document.addEventListener('click', (e) => {
  if (!nav.contains(e.target) && !mobileMenu.contains(e.target)) {
    mobileMenu.classList.remove('open')
  }
})

/* ── SCROLL REVEAL ──────────────────────────────────────────────────────── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return
    const siblings = [...(entry.target.parentElement?.querySelectorAll('.reveal') || [])]
    const idx = siblings.indexOf(entry.target)
    setTimeout(() => entry.target.classList.add('visible'), Math.min(idx * 70, 280))
    revealObs.unobserve(entry.target)
  })
}, { threshold: 0.07, rootMargin: '0px 0px -30px 0px' })

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el))

/* ── AGENT ROW CYCLE ────────────────────────────────────────────────────── */
const agentRows = document.querySelectorAll('.ops-row')
let activeIdx = 0
setInterval(() => {
  agentRows.forEach(r => r.classList.remove('ops-row--active'))
  agentRows[activeIdx % agentRows.length]?.classList.add('ops-row--active')
  activeIdx++
}, 2400)

/* ── DEMO FORM ──────────────────────────────────────────────────────────── */
document.getElementById('demoForm')?.addEventListener('submit', e => {
  e.preventDefault()
  const btn = e.target.querySelector('.btn-submit')
  btn.textContent = 'Submitting...'
  btn.disabled = true
  btn.style.opacity = '.75'
  setTimeout(() => {
    btn.textContent = 'Request received — we\'ll be in touch within 1 business day'
    btn.style.opacity = '1'
    btn.style.background = '#16A34A'
    btn.style.boxShadow = '0 4px 16px rgba(22,163,74,.25)'
  }, 900)
})

/* ── ACTIVE NAV LINK ────────────────────────────────────────────────────── */
const sections = document.querySelectorAll('section[id]')
const navLinks = document.querySelectorAll('.nav-links a')
const linkObs = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => {
        const active = l.getAttribute('href') === '#' + entry.target.id
        l.style.color = active ? 'var(--gray-900)' : ''
        l.style.background = active ? 'var(--gray-100)' : ''
      })
    }
  })
}, { rootMargin: '-35% 0px -60% 0px' })
sections.forEach(s => linkObs.observe(s))
