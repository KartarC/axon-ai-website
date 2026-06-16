// Billet — Toast notification utility

let container = null

function getContainer() {
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      display:flex;flex-direction:column;gap:10px;pointer-events:none;
    `
    document.body.appendChild(container)
  }
  return container
}

export function toast(message, type = 'info', duration = 3500) {
  const c = getContainer()

  const colors = {
    success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', icon: '✓' },
    error:   { bg: '#FFF1F2', border: '#FECACA', text: '#DC2626', icon: '✕' },
    warn:    { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', icon: '!' },
    info:    { bg: '#EFF6FF', border: '#DBEAFE', text: '#1D4ED8', icon: 'i' },
  }
  const c_ = colors[type] || colors.info

  const el = document.createElement('div')
  el.style.cssText = `
    display:flex;align-items:center;gap:10px;
    padding:12px 16px;border-radius:10px;
    background:${c_.bg};border:1px solid ${c_.border};
    box-shadow:0 4px 16px rgba(0,0,0,.08);
    font-family:Inter,sans-serif;font-size:.875rem;font-weight:500;
    color:${c_.text};max-width:340px;
    pointer-events:auto;cursor:pointer;
    animation:toast-in .2s ease;
    transition:opacity .3s ease, transform .3s ease;
  `
  el.innerHTML = `
    <span style="font-weight:800;font-size:.9rem;flex-shrink:0">${c_.icon}</span>
    <span style="flex:1;line-height:1.4">${message}</span>
  `

  // Inject keyframes once
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style')
    style.id = 'toast-styles'
    style.textContent = `
      @keyframes toast-in {
        from { opacity:0; transform:translateY(8px); }
        to   { opacity:1; transform:translateY(0); }
      }
    `
    document.head.appendChild(style)
  }

  c.appendChild(el)

  const dismiss = () => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px)'
    setTimeout(() => el.remove(), 300)
  }

  el.addEventListener('click', dismiss)
  const timer = setTimeout(dismiss, duration)
  el.addEventListener('click', () => clearTimeout(timer))

  return { dismiss }
}

export const toastSuccess = (msg) => toast(msg, 'success')
export const toastError   = (msg) => toast(msg, 'error', 5000)
export const toastWarn    = (msg) => toast(msg, 'warn')
export const toastInfo    = (msg) => toast(msg, 'info')
