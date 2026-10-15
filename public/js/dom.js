// Drobné pomocníky pro DOM: tvorba prvků, toasty, modální okna, konfety.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'html') el.innerHTML = v
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val)
        else el.style[prop] = val
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
  }
  return el
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

let toastHost = null
export function toast(message, kind = 'info', ms = 2800) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' })
    document.body.appendChild(toastHost)
  }
  const t = h('div', { class: `toast ${kind}` }, message)
  toastHost.appendChild(t)
  requestAnimationFrame(() => t.classList.add('show'))
  setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => t.remove(), 300)
  }, ms)
  while (toastHost.children.length > 4) toastHost.firstChild.remove()
}

const openModals = []
export function openModal({ title, body, wide = false, className = '', onClose } = {}) {
  const close = () => {
    if (!root.isConnected) return
    root.classList.remove('show')
    const i = openModals.indexOf(api)
    if (i >= 0) openModals.splice(i, 1)
    setTimeout(() => root.remove(), 200)
    onClose?.()
  }
  const closeBtn = h('button', { class: 'modal-close', 'aria-label': 'Zavřít', onClick: close }, '×')
  const panel = h(
    'div',
    { class: `modal ${wide ? 'wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h2', {}, title || ''), closeBtn),
    h('div', { class: 'modal-body' }, body),
  )
  const root = h('div', { class: 'modal-backdrop', onClick: (e) => e.target === root && close() }, panel)
  document.body.appendChild(root)
  requestAnimationFrame(() => root.classList.add('show'))
  const api = { close, root, panel }
  openModals.push(api)
  return api
}

export function closeTopModal() {
  const m = openModals[openModals.length - 1]
  if (m) {
    m.close()
    return true
  }
  return false
}

export function hasOpenModal() {
  return openModals.length > 0
}

/** Krátká oslava – konfety na celou obrazovku. */
export function confetti(duration = 2600) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const c = h('canvas', { class: 'confetti' })
  document.body.appendChild(c)
  const ctx = c.getContext('2d')
  const dpr = Math.min(2, devicePixelRatio || 1)
  c.width = innerWidth * dpr
  c.height = innerHeight * dpr
  const colors = ['#ff0055', '#fbb03b', '#5c00d3', '#61dbef', '#77d807', '#ffffff']
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * c.width,
    y: -Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 4 * dpr,
    vy: (2 + Math.random() * 4) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    s: (5 + Math.random() * 7) * dpr,
    c: colors[Math.floor(Math.random() * colors.length)],
  }))
  const start = performance.now()
  const frame = (now) => {
    ctx.clearRect(0, 0, c.width, c.height)
    for (const p of parts) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.05 * dpr
      p.r += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.r)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2)
      ctx.restore()
    }
    if (now - start < duration) requestAnimationFrame(frame)
    else c.remove()
  }
  requestAnimationFrame(frame)
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase()
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'teď'
  const m = Math.round(s / 60)
  if (m < 60) return `před ${m} min`
  const hh = Math.round(m / 60)
  if (hh < 24) return `před ${hh} h`
  return new Date(ts).toLocaleDateString('cs-CZ')
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } })
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}
