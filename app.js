// ── NAV SCROLL ────────────────────────────────────────────────────────────
const nav = document.getElementById('nav')
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40)
})

// ── MOBILE MENU ───────────────────────────────────────────────────────────
const burger = document.getElementById('burger')
burger.addEventListener('click', () => {
  const links = document.querySelector('.nav__links')
  const actions = document.querySelector('.nav__actions')
  const open = links.style.display === 'flex'
  links.style.cssText = open ? '' : 'display:flex;flex-direction:column;position:absolute;top:70px;left:0;right:0;background:rgba(10,15,30,.96);padding:20px 24px;gap:16px;backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,.08)'
  actions.style.cssText = open ? '' : 'display:flex;position:absolute;top:140px;left:24px;right:24px;flex-direction:column;gap:8px'
})

// ── OPS DIAGRAM ANIMATION ─────────────────────────────────────────────────
const cards = document.querySelectorAll('.ops-card:not(.ops-card--center)')
let i = 0
function highlightCard() {
  cards.forEach(c => c.style.borderColor = '')
  if (cards[i]) {
    cards[i].style.borderColor = 'rgba(0,212,255,0.8)'
    cards[i].style.boxShadow = '0 0 20px rgba(0,212,255,0.3)'
    setTimeout(() => {
      if (cards[i]) {
        cards[i].style.borderColor = ''
        cards[i].style.boxShadow = ''
      }
    }, 1200)
  }
  i = (i + 1) % cards.length
}
setInterval(highlightCard, 1800)

// ── SCROLL REVEAL ─────────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1'
      e.target.style.transform = 'translateY(0)'
    }
  })
}, { threshold: 0.1 })

document.querySelectorAll('.step, .feature-card, .result-card, .pricing-card').forEach(el => {
  el.style.opacity = '0'
  el.style.transform = 'translateY(24px)'
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease'
  observer.observe(el)
})

// ── DEMO FORM ─────────────────────────────────────────────────────────────
document.getElementById('demoForm').addEventListener('submit', (e) => {
  e.preventDefault()
  const btn = e.target.querySelector('button')
  btn.textContent = '✓ Request received — we\'ll be in touch!'
  btn.style.background = '#10B981'
  btn.disabled = true
})
