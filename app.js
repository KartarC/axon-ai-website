/* ── NAV SCROLL ─────────────────────────────────────────────────────────── */
const nav = document.getElementById('nav')
if (nav) window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 10)
}, { passive: true })

/* ── MOBILE NAV ─────────────────────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger')
const mobileMenu = document.getElementById('mobileMenu')
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'))
  document.addEventListener('click', (e) => {
    if (nav && !nav.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open')
    }
  })
}
window.closeMobile = () => mobileMenu && mobileMenu.classList.remove('open')

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

/* ── DEMO FORM ──────────────────────────────────────────────────────────── */
document.getElementById('demoForm')?.addEventListener('submit', async e => {
  e.preventDefault()
  const form = e.target
  const btn  = form.querySelector('.btn-submit')

  btn.textContent = 'Submitting...'
  btn.disabled    = true
  btn.style.opacity = '.7'

  const data = {
    name:    form.name.value.trim(),
    email:   form.email.value.trim(),
    company: form.company?.value?.trim() || '',
    volume:  form.volume?.value?.trim()  || '',
  }

  try {
    const res = await fetch('/api/submit-demo', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })

    const json = await res.json()

    if (!res.ok) throw new Error(json.error || 'Submission failed')

    btn.textContent       = 'Request received — we\'ll be in touch within 1 business day'
    btn.style.opacity     = '1'
    btn.style.background  = '#16A34A'
    btn.style.boxShadow   = '0 4px 16px rgba(22,163,74,.25)'
    form.reset()

  } catch (err) {
    console.error('Form submit error:', err)
    btn.textContent  = 'Something went wrong — please email us directly'
    btn.style.background = '#DC2626'
    btn.style.opacity    = '1'
    btn.disabled         = false
  }
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
