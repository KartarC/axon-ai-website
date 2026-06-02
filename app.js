/* ── NAV SCROLL ─────────────────────────────────────────────────────────── */
const nav = document.getElementById('nav')
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 20)
}, { passive: true })

/* ── MOBILE NAV ─────────────────────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger')
let mobileNav = null

hamburger.addEventListener('click', () => {
  if (!mobileNav) {
    mobileNav = document.createElement('div')
    mobileNav.className = 'mobile-nav'
    mobileNav.innerHTML = `
      <a href="#product" onclick="closeMobile()">Product</a>
      <a href="#results" onclick="closeMobile()">Results</a>
      <a href="#pricing" onclick="closeMobile()">Pricing</a>
      <a href="#faq" onclick="closeMobile()">FAQ</a>
      <a href="#demo" class="mobile-cta" onclick="closeMobile()">Book Demo →</a>
    `
    document.body.appendChild(mobileNav)
  }
  mobileNav.classList.toggle('open')
})

window.closeMobile = () => mobileNav?.classList.remove('open')

/* ── SCROLL REVEAL ──────────────────────────────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      // Stagger siblings in the same parent
      const siblings = [...entry.target.parentElement.querySelectorAll('.reveal')]
      const idx = siblings.indexOf(entry.target)
      setTimeout(() => {
        entry.target.classList.add('visible')
      }, Math.min(idx * 80, 320))
      revealObserver.unobserve(entry.target)
    }
  })
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el))

/* ── AGENT PULSE ANIMATION ──────────────────────────────────────────────── */
const agentRows = document.querySelectorAll('.agent-row')
let activeIdx = 0
setInterval(() => {
  agentRows.forEach(r => r.classList.remove('agent-row--active'))
  agentRows[activeIdx]?.classList.add('agent-row--active')
  activeIdx = (activeIdx + 1) % agentRows.length
}, 2200)

/* ── COUNTER ANIMATION ──────────────────────────────────────────────────── */
function animateCounter(el, target, suffix = '', duration = 1400) {
  const start = performance.now()
  const isFloat = target % 1 !== 0

  const frame = (now) => {
    const progress = Math.min((now - start) / duration, 1)
    const ease = 1 - Math.pow(1 - progress, 3)
    const val = target * ease
    el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + suffix
    if (progress < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return
    const el = entry.target
    const raw = el.dataset.count
    const suffix = el.dataset.suffix || ''
    if (raw) animateCounter(el, parseFloat(raw), suffix)
    counterObserver.unobserve(el)
  })
}, { threshold: 0.5 })

document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el))

/* ── DEMO FORM ──────────────────────────────────────────────────────────── */
document.getElementById('demoForm')?.addEventListener('submit', (e) => {
  e.preventDefault()
  const btn = e.target.querySelector('.btn-submit')
  const original = btn.textContent

  btn.textContent = 'Sending...'
  btn.style.opacity = '.7'
  btn.disabled = true

  setTimeout(() => {
    btn.textContent = '✓ Request received — we\'ll be in touch within 1 business day'
    btn.style.opacity = '1'
    btn.style.background = '#10B981'
    btn.style.boxShadow = '0 4px 20px rgba(16,185,129,.3)'
  }, 800)
})

/* ── SMOOTH ACTIVE NAV LINKS ────────────────────────────────────────────── */
const sections = document.querySelectorAll('section[id]')
const navLinks = document.querySelectorAll('.nav-links a')

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => {
        link.style.color = ''
        if (link.getAttribute('href') === '#' + entry.target.id) {
          link.style.color = 'white'
        }
      })
    }
  })
}, { rootMargin: '-40% 0px -55% 0px' })

sections.forEach(s => sectionObserver.observe(s))
