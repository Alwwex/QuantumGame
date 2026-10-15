// Vykreslení desky: mřížka, dílky, laserové paprsky, procenta pohlcení, fotony,
// kurzory ostatních hráčů a ovládání myší / dotykem.

import { DX, DY } from './qt.js'
import { elementSvg, iconSvg, ELEMENTS } from './elements.js'
import { parseKey, key as cellKey } from './room-core.js'
import { drawPhoton } from './photon.js'

const NS = 'http://www.w3.org/2000/svg'
const T = 64 // velikost dlaždice ve „světových“ pixelech

function s(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (parent) parent.appendChild(e)
  return e
}

let uid = 0

export class BoardView {
  /**
   * @param host prvek, do kterého se deska vykreslí
   * @param opts { interactive, mini, maxHeight(), onIntent(intent) }
   */
  constructor(host, opts = {}) {
    this.id = ++uid
    this.opts = { interactive: false, mini: false, labels: true, ...opts }
    this.host = host
    this.content = { cols: 13, rows: 10, cells: {} }
    this.sim = null
    this.mode = 'laser'
    this.time = 0
    this.experimentCounts = null
    this.pieceEls = new Map()
    this.displayRot = new Map()
    this.cursors = new Map()
    this.armed = null
    this.canEdit = true
    this.hoverCell = null
    this.goalInfo = null

    this.wrap = document.createElement('div')
    this.wrap.className = 'board-wrap' + (this.opts.mini ? ' mini' : '')
    host.appendChild(this.wrap)

    this.svg = s('svg', { class: 'board-svg', xmlns: NS })
    this.wrap.appendChild(this.svg)
    const defs = s('defs', {}, this.svg)
    this.clip = s('clipPath', { id: `bclip${this.id}` }, defs)
    this.clipRect = s('rect', { x: 0, y: 0 }, this.clip)

    this.gBg = s('g', { class: 'g-bg' }, this.svg)
    this.gHints = s('g', { class: 'g-hints' }, this.svg)
    this.gLasers = s('g', { class: 'g-lasers', 'clip-path': `url(#bclip${this.id})` }, this.svg)
    this.gTarget = s('g', { class: 'g-target' }, this.svg)
    this.gPieces = s('g', { class: 'g-pieces' }, this.svg)
    this.gLabels = s('g', { class: 'g-labels' }, this.svg)
    this.gFlash = s('g', { class: 'g-flash' }, this.svg)
    this.gCursors = s('g', { class: 'g-cursors' }, this.svg)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'photon-canvas'
    this.wrap.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')

    this.overlay = document.createElement('div')
    this.overlay.className = 'board-overlay'
    this.wrap.appendChild(this.overlay)

    this.resizeObserver = new ResizeObserver(() => this.fit())
    this.resizeObserver.observe(host)
    if (this.opts.interactive) this.attachInput()
    this.renderGrid()
  }

  destroy() {
    this.resizeObserver.disconnect()
    this.detachInput?.()
    this.wrap.remove()
  }

  // -------------------------------------------------------------------------
  // velikost
  // -------------------------------------------------------------------------

  fit() {
    const { cols, rows } = this.content
    const W = this.host.clientWidth
    let H = this.opts.maxHeight ? this.opts.maxHeight() : this.host.clientHeight || Infinity
    if (!H || H < 50) H = Infinity
    const scale = Math.max(0.05, Math.min(W / (cols * T), H / (rows * T)))
    const w = Math.floor(cols * T * scale)
    const h = Math.floor(rows * T * scale)
    if (w === this.pxW && h === this.pxH) return
    this.pxW = w
    this.pxH = h
    this.scale = scale
    this.wrap.style.width = `${w}px`
    this.wrap.style.height = `${h}px`
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.dpr = dpr
    this.drawPhotons()
  }

  get tilePx() {
    return (this.pxW || this.content.cols * T) / this.content.cols
  }

  // -------------------------------------------------------------------------
  // obsah
  // -------------------------------------------------------------------------

  setContent(content) {
    const sizeChanged = content.cols !== this.content.cols || content.rows !== this.content.rows
    this.content = content
    this.wrap.classList.toggle('is-level', !!content.level)
    if (sizeChanged) {
      this.renderGrid()
      this.pxW = 0
      this.fit()
    }
    this.renderPieces()
    this.renderHints()
  }

  renderGrid() {
    const { cols, rows } = this.content
    this.svg.setAttribute('viewBox', `0 0 ${cols * T} ${rows * T}`)
    this.clipRect.setAttribute('width', cols * T)
    this.clipRect.setAttribute('height', rows * T)
    this.gBg.innerHTML = ''
    s('rect', { class: 'board-bg', x: 0, y: 0, width: cols * T, height: rows * T, rx: 6 }, this.gBg)
    const dots = []
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) dots.push(`M${x * T} ${y * T}h0.01`)
    }
    s('path', { class: 'board-dots', d: dots.join('') }, this.gBg)
  }

  renderPieces() {
    const cells = this.content.cells
    const seen = new Set()
    for (const [k, piece] of Object.entries(cells)) {
      seen.add(k)
      let entry = this.pieceEls.get(k)
      if (entry && entry.t !== piece.t) {
        entry.g.remove()
        entry = null
      }
      const [x, y] = parseKey(k)
      if (!entry) {
        const g = s('g', { class: `piece el-${piece.t}`, transform: `translate(${x * T} ${y * T})` }, this.gPieces)
        s('rect', { class: 'piece-hit', width: T, height: T, rx: 8 }, g)
        const inner = s('g', { class: 'piece-rot' }, g)
        // průhledný čtverec 64×64 = střed otáčení přesně uprostřed dlaždice
        inner.innerHTML = `<rect width="64" height="64" fill="none"/>${elementSvg(piece.t)}`
        const pol = s('g', { class: 'pol-badge' }, g)
        entry = { g, inner, pol, t: piece.t }
        this.pieceEls.set(k, entry)
        this.displayRot.set(k, piece.r || 0)
      }
      // plynulé otáčení nejkratší cestou
      const last = this.displayRot.get(k) ?? 0
      const target = piece.r || 0
      const delta = ((((target - last) % 360) + 540) % 360) - 180
      const shown = last + delta
      this.displayRot.set(k, shown)
      entry.inner.style.transform = `rotate(${-shown}deg)`
      entry.g.classList.toggle('lk-frozen', piece.lk === 2)
      entry.g.classList.toggle('lk-rot', piece.lk === 1)
      entry.g.classList.toggle('lk-free', !piece.lk && !this.opts.mini)
      entry.g.classList.toggle('goal', !!piece.g)
      // polarizace laseru
      if (piece.t === 'Laser' && piece.p) {
        const labels = { 45: '⤢', 90: '↕', 135: '⤡' }
        entry.pol.innerHTML = `<circle cx="52" cy="12" r="10" class="pol-bg"/><text x="52" y="16.5" class="pol-text">${labels[piece.p] || ''}</text>`
      } else entry.pol.innerHTML = ''
    }
    for (const [k, entry] of this.pieceEls) {
      if (!seen.has(k)) {
        entry.g.remove()
        this.pieceEls.delete(k)
        this.displayRot.delete(k)
      }
    }
    this.renderLabels()
  }

  renderHints() {
    this.gHints.innerHTML = ''
    const hints = this.content.level?.hints || []
    if (this.opts.mini) return
    for (const h of hints) {
      if (h.text) {
        const fo = s('foreignObject', { x: h.x * T - 40, y: h.y * T + 4, width: T + 80, height: T - 8, class: 'hint-fo' }, this.gHints)
        const div = document.createElement('div')
        div.className = 'hint-bubble'
        div.textContent = h.text
        fo.appendChild(div)
      } else {
        const c = s('circle', { cx: h.x * T + T / 2, cy: h.y * T + T / 2, r: T * 0.48, class: 'hint-pulse' }, this.gHints)
        c.style.animationDelay = `${(h.order || 0) * 0.4}s`
      }
    }
  }

  // -------------------------------------------------------------------------
  // simulace a režimy
  // -------------------------------------------------------------------------

  setSimulation(sim) {
    this.sim = sim
    this.renderLasers()
    this.renderLabels()
    this.drawPhotons()
  }

  setMode(mode) {
    this.mode = mode
    this.wrap.dataset.mode = mode
    this.renderLabels()
    this.drawPhotons()
  }

  setTime(t) {
    const prevFrame = Math.floor(this.time)
    this.time = t
    if (Math.floor(t) !== prevFrame) this.renderLabels()
    this.drawPhotons()
  }

  setExperimentCounts(counts, shots) {
    this.experimentCounts = counts
    this.experimentShots = shots
    this.renderLabels()
  }

  setGoalInfo(info) {
    this.goalInfo = info
    this.renderLabels()
  }

  renderLasers() {
    this.gLasers.innerHTML = ''
    if (!this.sim) return
    // sečteme intenzitu, která prošla každým úsekem (pole → soused)
    const segs = new Map()
    for (const laser of this.sim.lasers) {
      for (const frame of laser.frames) {
        for (const p of frame.particles) {
          const k = `${p.x},${p.y},${p.d}`
          segs.set(k, (segs.get(k) || 0) + p.p)
        }
      }
    }
    const groups = new Map()
    for (const [k, p] of segs) {
      const level = Math.min(1, Math.round(p * 20) / 20)
      if (level < 0.01) continue
      const [x, y, d] = k.split(',').map(Number)
      const x1 = x * T + T / 2
      const y1 = y * T + T / 2
      const path = `M${x1} ${y1}L${x1 + DX[d] * T} ${y1 + DY[d] * T}`
      groups.set(level, (groups.get(level) || '') + path)
    }
    for (const [level, d] of groups) {
      s('path', { class: 'laser-glow', d, style: `opacity:${level * 0.35}` }, this.gLasers)
      s('path', { class: 'laser', d, style: `opacity:${Math.max(0.12, level)}` }, this.gLasers)
    }
  }

  /** Pravděpodobnosti pohlcení pro aktuální režim. */
  currentAbsorptions() {
    if (!this.sim) return new Map()
    if (this.mode === 'wave') {
      const f = Math.floor(this.time)
      const out = new Map()
      for (const laser of this.sim.lasers) {
        const cum = laser.cumulative[Math.min(f, laser.cumulative.length - 1)]
        for (const [k, v] of cum) out.set(k, (out.get(k) || 0) + v)
      }
      return out
    }
    return this.sim.total
  }

  renderLabels() {
    this.gLabels.innerHTML = ''
    const abs = this.currentAbsorptions()
    const cells = this.content.cells
    const goalsMet = new Map((this.goalInfo?.goals || []).map((g) => [`${g.x},${g.y}`, g]))
    const minesInfo = new Map((this.goalInfo?.mines || []).map((m) => [`${m.x},${m.y}`, m]))

    for (const [k, entry] of this.pieceEls) {
      const piece = cells[k]
      const v = abs.get(k) || 0
      const energized = v > 0.001 && this.mode !== 'experiment'
      entry.g.classList.toggle('energized', energized)
      const goal = piece?.g ? Math.min(1, v / piece.g) : Math.min(1, v)
      entry.g.style.setProperty('--goal', this.mode === 'experiment' ? 0 : goal)
    }
    if (!this.opts.labels) return

    if (this.mode === 'experiment' && this.experimentCounts) {
      for (const [k, n] of this.experimentCounts) {
        if (k === '-1,-1') continue
        const [x, y] = parseKey(k)
        const piece = cells[k]
        const frac = this.experimentShots ? n / this.experimentShots : 0
        this.label(x, y, `${n}× · ${Math.round(frac * 100)} %`, piece?.t === 'Mine' ? 'mine' : 'count')
      }
      return
    }

    for (const [k, v] of abs) {
      if (k === '-1,-1' || v < 0.0005) continue
      const [x, y] = parseKey(k)
      const piece = cells[k]
      if (!piece) continue
      const pct = formatPct(v)
      if (piece.t === 'Mine') {
        this.label(x, y, `💥 ${pct}`, minesInfo.get(k)?.safe === false || !this.goalInfo ? 'mine' : 'mine-safe')
      } else if (piece.g) {
        const g = goalsMet.get(k)
        this.label(x, y, `${pct} / ${formatPct(piece.g)}`, g?.met ? 'goal-met' : 'goal')
      } else if (piece.t === 'Detector' || piece.t === 'DetectorFour') {
        this.label(x, y, pct, 'detector')
      } else {
        this.label(x, y, pct, 'absorb')
      }
    }
    // cíle, kam zatím nic nedoletělo
    for (const [k, piece] of Object.entries(cells)) {
      if (piece.g && !(abs.get(k) > 0.0005)) {
        const [x, y] = parseKey(k)
        this.label(x, y, `0 / ${formatPct(piece.g)}`, 'goal')
      }
    }
  }

  label(x, y, text, kind) {
    const g = s('g', { class: `abs-label ${kind}`, transform: `translate(${x * T + T / 2} ${y * T + 3})` }, this.gLabels)
    const w = Math.max(30, text.length * 6.6 + 10)
    s('rect', { x: -w / 2, y: -1, width: w, height: 17, rx: 8.5 }, g)
    const t = s('text', { x: 0, y: 11.5 }, g)
    t.textContent = text
  }

  // -------------------------------------------------------------------------
  // fotony (canvas)
  // -------------------------------------------------------------------------

  /** Seznam fotonů pro čas t (snímek + interpolace). */
  particlesAt(t, onlyLaser = null) {
    const out = []
    if (!this.sim) return out
    const f = Math.floor(t)
    const frac = t - f
    this.sim.lasers.forEach((laser, li) => {
      if (onlyLaser && !onlyLaser.has(li)) return
      const frame = laser.frames[f]
      if (!frame) return
      for (const p of frame.particles) {
        out.push({ x: p.x + 0.5 + DX[p.d] * frac, y: p.y + 0.5 + DY[p.d] * frac, d: p.d, a: p.a, b: p.b })
      }
    })
    return out
  }

  drawPhotons(particles = null) {
    const ctx = this.ctx
    if (!ctx || !this.pxW) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    let list = particles
    if (!list) {
      if (this.mode !== 'wave' || !this.sim) return
      list = this.particlesAt(this.time)
    }
    if (!list.length) return
    const px = (this.pxW / this.content.cols) * this.dpr
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, this.canvas.width, this.canvas.height)
    ctx.clip()
    ctx.globalCompositeOperation = 'lighter'
    const unit = px / 2.4
    for (const p of list) drawPhoton(ctx, p.x * px, p.y * px, p.d, p.a, p.b, unit, p.alpha ?? 1)
    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // efekty: záblesky, kurzory, emoji
  // -------------------------------------------------------------------------

  flash(x, y, color, text = '') {
    if (x < 0 || y < 0) return
    const g = s('g', { class: 'flash', transform: `translate(${x * T} ${y * T})` }, this.gFlash)
    s('rect', { x: 2, y: 2, width: T - 4, height: T - 4, rx: 10, stroke: color }, g)
    if (text) {
      const w = Math.min(160, text.length * 7 + 12)
      const tg = s('g', { transform: `translate(${T / 2} ${T + 2})` }, g)
      s('rect', { x: -w / 2, y: 0, width: w, height: 16, rx: 8, fill: color, class: 'flash-tag' }, tg)
      const t = s('text', { x: 0, y: 11.5 }, tg)
      t.textContent = text
    }
    setTimeout(() => g.remove(), 1800)
  }

  click(x, y, kind = 'detector') {
    if (x < 0 || y < 0) return
    const c = s('circle', { cx: x * T + T / 2, cy: y * T + T / 2, r: 10, class: `click-ring ${kind}` }, this.gFlash)
    setTimeout(() => c.remove(), 700)
  }

  setCursor(id, data) {
    let c = this.cursors.get(id)
    if (data.hide) {
      if (c) {
        c.g.remove()
        this.cursors.delete(id)
      }
      return
    }
    if (!c) {
      const g = s('g', { class: 'remote-cursor' }, this.gCursors)
      const ghost = s('g', { class: 'cursor-ghost' }, g)
      s('path', { d: 'M0 0 L0 22 L6 16 L10 26 L14 24 L10 14 L18 14 Z', class: 'cursor-arrow' }, g)
      const tag = s('g', { transform: 'translate(14 24)' }, g)
      const r = s('rect', { x: 0, y: 0, height: 18, rx: 9, class: 'cursor-tag' }, tag)
      const t = s('text', { x: 8, y: 13 }, tag)
      c = { g, ghost, r, t, drag: null }
      this.cursors.set(id, c)
    }
    c.g.style.setProperty('--c', data.color || '#ff0055')
    c.t.textContent = data.name || ''
    c.r.setAttribute('width', Math.min(180, (data.name || '').length * 7.2 + 16))
    c.g.setAttribute('transform', `translate(${data.x * T} ${data.y * T})`)
    if (data.drag !== c.drag) {
      c.drag = data.drag || null
      c.ghost.innerHTML = c.drag ? `<g transform="translate(-32 -32)" opacity="0.65">${elementSvg(c.drag)}</g>` : ''
    }
    clearTimeout(c.timer)
    c.timer = setTimeout(() => this.setCursor(id, { hide: true }), 15000)
  }

  clearCursors() {
    for (const id of [...this.cursors.keys()]) this.setCursor(id, { hide: true })
  }

  emote(emoji, x = null, y = null) {
    const span = document.createElement('span')
    span.className = 'emote-float'
    span.textContent = emoji
    const px = x != null ? ((x + 0.5) / this.content.cols) * 100 : 10 + Math.random() * 80
    const py = y != null ? ((y + 0.5) / this.content.rows) * 100 : 85
    span.style.left = `${px}%`
    span.style.top = `${py}%`
    span.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`)
    this.overlay.appendChild(span)
    setTimeout(() => span.remove(), 2600)
  }

  // -------------------------------------------------------------------------
  // vstup
  // -------------------------------------------------------------------------

  cellFromClient(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect()
    const fx = ((clientX - rect.left) / rect.width) * this.content.cols
    const fy = ((clientY - rect.top) / rect.height) * this.content.rows
    const inside = fx >= 0 && fy >= 0 && fx < this.content.cols && fy < this.content.rows
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy, inside }
  }

  setArmed(t) {
    this.armed = t
    this.wrap.classList.toggle('armed', !!t)
    this.renderTarget()
  }

  renderTarget(cell = this.hoverCell, mode = this.armed ? 'place' : null) {
    this.gTarget.innerHTML = ''
    if (!cell || !cell.inside) return
    if (this.dragState?.active) mode = 'drop'
    if (!mode) return
    const occupied = !!this.content.cells[cellKey(cell.x, cell.y)]
    const sameAsSource = this.dragState && this.dragState.x === cell.x && this.dragState.y === cell.y
    const bad = occupied && !sameAsSource
    s('rect', { x: cell.x * T + 3, y: cell.y * T + 3, width: T - 6, height: T - 6, rx: 10, class: `target ${bad ? 'bad' : 'ok'}` }, this.gTarget)
    if (mode === 'place' && !bad && this.armed) {
      const g = s('g', { transform: `translate(${cell.x * T} ${cell.y * T})`, class: 'target-ghost' }, this.gTarget)
      g.innerHTML = elementSvg(this.armed)
    }
  }

  emit(intent) {
    this.opts.onIntent?.(intent)
  }

  attachInput() {
    const svg = this.svg
    svg.classList.add('interactive')

    const onDown = (e) => {
      if (e.button !== undefined && e.button > 0) return
      const cell = this.cellFromClient(e.clientX, e.clientY)
      if (!cell.inside) return
      const piece = this.content.cells[cellKey(cell.x, cell.y)]
      if (!piece) {
        if (this.armed) this.emit({ type: 'place', e: this.armed, x: cell.x, y: cell.y })
        else this.emit({ type: 'empty', x: cell.x, y: cell.y })
        return
      }
      e.preventDefault()
      svg.setPointerCapture?.(e.pointerId)
      this.dragState = {
        pointerId: e.pointerId,
        x: cell.x,
        y: cell.y,
        sx: e.clientX,
        sy: e.clientY,
        piece,
        active: false,
        longPress: false,
        touch: e.pointerType === 'touch',
      }
      this.dragState.timer = setTimeout(() => {
        if (this.dragState && !this.dragState.active) {
          this.dragState.longPress = true
          this.emit({ type: 'info', x: cell.x, y: cell.y })
        }
      }, 480)
    }

    const onMove = (e) => {
      const cell = this.cellFromClient(e.clientX, e.clientY)
      const ds = this.dragState
      if (ds && ds.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - ds.sx, e.clientY - ds.sy)
        if (!ds.active && !ds.longPress && dist > 7) {
          clearTimeout(ds.timer)
          if (!ds.piece.lk && this.canEdit) {
            ds.active = true
            this.startGhost(ds.piece.t, ds.piece.r, e.clientX, e.clientY)
            this.pieceEls.get(cellKey(ds.x, ds.y))?.g.classList.add('dragging')
          } else if (ds.piece.lk) {
            this.emit({ type: 'locked', x: ds.x, y: ds.y })
            ds.longPress = true
          }
        }
        if (ds.active) {
          this.moveGhost(e.clientX, e.clientY)
          this.hoverCell = cell
          this.renderTarget(cell, 'drop')
          this.emit({ type: 'cursor', x: cell.fx, y: cell.fy, drag: ds.piece.t })
        }
        return
      }
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        const changed = !this.hoverCell || this.hoverCell.x !== cell.x || this.hoverCell.y !== cell.y || this.hoverCell.inside !== cell.inside
        this.hoverCell = cell
        if (changed) {
          this.renderTarget(cell)
          this.emit({ type: 'hover', x: cell.x, y: cell.y, inside: cell.inside, clientX: e.clientX, clientY: e.clientY })
        }
        if (cell.inside) this.emit({ type: 'cursor', x: cell.fx, y: cell.fy })
      }
    }

    const onUp = (e) => {
      const ds = this.dragState
      if (!ds || ds.pointerId !== e.pointerId) return
      clearTimeout(ds.timer)
      this.dragState = null
      if (ds.active) {
        this.endGhost()
        this.pieceEls.get(cellKey(ds.x, ds.y))?.g.classList.remove('dragging')
        const cell = this.cellFromClient(e.clientX, e.clientY)
        this.renderTarget(null)
        if (!cell.inside) this.emit({ type: 'remove', x: ds.x, y: ds.y })
        else if (cell.x !== ds.x || cell.y !== ds.y) this.emit({ type: 'move', x: ds.x, y: ds.y, tx: cell.x, ty: cell.y })
        this.emit({ type: 'cursor', x: cell.fx, y: cell.fy, drag: null })
        return
      }
      if (!ds.longPress) this.emit({ type: 'tap', x: ds.x, y: ds.y, shift: e.shiftKey, alt: e.altKey })
    }

    const onCancel = (e) => {
      const ds = this.dragState
      if (!ds || ds.pointerId !== e.pointerId) return
      clearTimeout(ds.timer)
      if (ds.active) {
        this.endGhost()
        this.pieceEls.get(cellKey(ds.x, ds.y))?.g.classList.remove('dragging')
      }
      this.dragState = null
      this.renderTarget(null)
    }

    const onLeave = () => {
      if (this.dragState?.active) return
      this.hoverCell = null
      this.renderTarget(null)
      this.emit({ type: 'hover', inside: false })
      this.emit({ type: 'cursor', hide: true })
    }

    const onContext = (e) => {
      e.preventDefault()
      const cell = this.cellFromClient(e.clientX, e.clientY)
      if (cell.inside && this.content.cells[cellKey(cell.x, cell.y)]) this.emit({ type: 'info', x: cell.x, y: cell.y })
    }

    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onCancel)
    svg.addEventListener('pointerleave', onLeave)
    svg.addEventListener('contextmenu', onContext)
    this.detachInput = () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onCancel)
      svg.removeEventListener('pointerleave', onLeave)
      svg.removeEventListener('contextmenu', onContext)
    }
  }

  // ghost = plovoucí dílek pod prstem / myší
  startGhost(t, r, cx, cy) {
    this.endGhost()
    const size = Math.max(36, this.tilePx)
    const div = document.createElement('div')
    div.className = 'drag-ghost'
    div.innerHTML = iconSvg(t, r || 0, size)
    document.body.appendChild(div)
    this.ghost = { div, size }
    this.moveGhost(cx, cy)
  }

  moveGhost(cx, cy) {
    if (!this.ghost) return
    this.ghost.div.style.transform = `translate(${cx - this.ghost.size / 2}px, ${cy - this.ghost.size / 2}px)`
  }

  endGhost() {
    this.ghost?.div.remove()
    this.ghost = null
  }

  /** Přetahování z nabídky nástrojů na desku. */
  startExternalDrag(t, e, rotation = 0) {
    this.startGhost(t, rotation, e.clientX, e.clientY)
    this.dragState = { external: true, active: true, piece: { t }, x: -1, y: -1 }
    const move = (ev) => {
      this.moveGhost(ev.clientX, ev.clientY)
      const cell = this.cellFromClient(ev.clientX, ev.clientY)
      this.hoverCell = cell
      this.renderTarget(cell, 'drop')
      if (cell.inside) this.emit({ type: 'cursor', x: cell.fx, y: cell.fy, drag: t })
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      this.endGhost()
      this.dragState = null
      this.renderTarget(null)
      const cell = this.cellFromClient(ev.clientX, ev.clientY)
      if (cell.inside) {
        this.emit({ type: 'place', e: t, x: cell.x, y: cell.y, fromDrag: true })
        this.emit({ type: 'cursor', x: cell.fx, y: cell.fy, drag: null })
      }
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      this.endGhost()
      this.dragState = null
      this.renderTarget(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
}

export function formatPct(v) {
  const p = v * 100
  if (p < 0.005) return '0 %'
  if (p >= 99.95) return '100 %'
  if (p >= 10) return `${p.toFixed(0)} %`
  if (p >= 1) return `${p.toFixed(1).replace('.', ',')} %`
  return `${p.toFixed(2).replace('.', ',')} %`
}

/** Smyčka ukázky prvku: paprsek → vlna → pauza → znovu. */
export class DemoPlayer {
  constructor(host, content, sim, opts = {}) {
    this.board = new BoardView(host, { mini: true, labels: true, maxHeight: opts.maxHeight })
    this.board.setContent(content)
    this.board.setSimulation(sim)
    this.sim = sim
    this.frames = Math.max(1, ...sim.lasers.map((l) => l.frames.length))
    this.phase = 'laser'
    this.phaseStart = performance.now()
    this.running = true
    this.board.setMode('laser')
    const loop = (now) => {
      if (!this.running) return
      this.tick(now)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  tick(now) {
    const dt = now - this.phaseStart
    if (this.phase === 'laser' && dt > 1400) {
      this.phase = 'wave'
      this.phaseStart = now
      this.board.setMode('wave')
      this.board.setTime(0)
    } else if (this.phase === 'wave') {
      const t = Math.min(this.frames - 1, dt / 260)
      this.board.setTime(t)
      if (t >= this.frames - 1) {
        this.phase = 'hold'
        this.phaseStart = now
      }
    } else if (this.phase === 'hold' && dt > 1100) {
      this.phase = 'laser'
      this.phaseStart = now
      this.board.setMode('laser')
    }
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.board.destroy()
  }
}

export { ELEMENTS }
