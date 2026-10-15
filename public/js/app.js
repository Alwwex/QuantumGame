// Kvantová hra LIVE – hlavní aplikace pro hráče.

import { simulate, ketComponents, formatComplex, sampleOutcome, DIR_SYMBOLS, POL_SYMBOLS } from './qt.js'
import {
  applyOp,
  cloneContent,
  key,
  parseKey,
  nextRotation,
  nextPolarization,
  ELEMENT_META,
  SANDBOX_TOOLS,
  toolCount,
  evaluateGoals,
  encodeBoard,
  decodeBoard,
  getLevel,
} from './room-core.js'
import { LEVELS } from './levels-data.js'
import { TEMPLATES } from './templates.js'
import { ELEMENTS, TOOL_GROUPS, iconSvg, elementName, ACCUSATIVE, SVG_DEFS, POLARIZATION_LABELS } from './elements.js'
import { BoardView, formatPct } from './board.js'
import { Connection } from './net.js'
import { abilityCard } from './cards.js'
import { h, toast, openModal, closeTopModal, hasOpenModal, confetti, initials, copyText, timeAgo } from './dom.js'

const PALETTE = ['#ff0055', '#fbb03b', '#61dbef', '#77d807', '#c86bff', '#ff7ab6', '#00e0b0', '#ffd23f', '#4d9fff', '#ff8a3d']
const EMOTES = ['👏', '🤯', '❤️', '🔥', '🎉', '🤔', '⚛️', '😂']
const NOUNS = ['Foton', 'Kvark', 'Qubit', 'Elektron', 'Mion', 'Gluon', 'Boson', 'Pozitron', 'Neutron', 'Proton']
const ADJS = ['Rychlý', 'Zvědavý', 'Provázaný', 'Superponovaný', 'Tunelující', 'Vlnivý', 'Polarizovaný', 'Nejistý', 'Bystrý', 'Šťastný']
const DEFAULT_ROT = { Mirror: 45, BeamSplitter: 45, CoatedBeamSplitter: 45, Detector: 180, Polarizer: 0 }
const FRAME_MS = 280

const $ = (sel) => document.querySelector(sel)

// ---------------------------------------------------------------------------
// Preference
// ---------------------------------------------------------------------------

function loadPref(k, fallback) {
  try {
    const v = localStorage.getItem(`qg-${k}`)
    return v == null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}
function savePref(k, v) {
  try {
    localStorage.setItem(`qg-${k}`, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

const randomName = () => `${ADJS[Math.floor(Math.random() * ADJS.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`
const prefs = {
  name: loadPref('name', null),
  color: loadPref('color', PALETTE[Math.floor(Math.random() * PALETTE.length)]),
}
const firstVisit = !prefs.name
if (!prefs.name) prefs.name = randomName()

// ---------------------------------------------------------------------------
// Stav
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search)
const state = {
  me: { id: null, name: prefs.name, color: prefs.color },
  admin: false,
  roomId: params.get('room') || 'lab',
  roomName: '',
  locked: false,
  epoch: null,
  confirmed: null,
  version: 0,
  pending: [],
  seq: 0,
  view: null,
  users: [],
  online: 0,
  canUndo: false,
  sim: null,
  goals: null,
  wasWon: false,
  mode: 'laser',
  playing: false,
  time: 0,
  speed: 1,
  armed: null,
  hover: null,
  ketLaser: 0,
  experiment: null,
  feed: [],
  status: 'connecting',
  sharedBoard: null,
}

// sdílená sestava v odkazu (#b=...)
if (location.hash.startsWith('#b=')) {
  try {
    state.sharedBoard = decodeBoard(decodeURIComponent(location.hash.slice(3)))
  } catch {
    toast('Odkaz na sestavu je poškozený.', 'error')
  }
  history.replaceState(null, '', location.pathname + location.search)
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

document.getElementById('svg-defs').innerHTML = `<defs>${SVG_DEFS}</defs>`

const board = new BoardView($('#board-host'), {
  interactive: true,
  maxHeight: () => {
    const host = $('#board-host')
    const rect = host.getBoundingClientRect()
    const reserve = innerWidth < 760 ? 110 : 120 // místo pro ovládání pod deskou
    return Math.max(220, innerHeight - rect.top - reserve)
  },
  onIntent: onBoardIntent,
})

// ---------------------------------------------------------------------------
// Připojení
// ---------------------------------------------------------------------------

function knownState(roomId) {
  try {
    return JSON.parse(localStorage.getItem(`qg-known:${roomId}`) || 'null')
  } catch {
    return null
  }
}
let knownTimer = null
function saveKnown() {
  clearTimeout(knownTimer)
  knownTimer = setTimeout(() => {
    if (!state.confirmed || state.status === 'solo') return
    try {
      localStorage.setItem(
        `qg-known:${state.roomId}`,
        JSON.stringify({ room: state.roomId, epoch: state.epoch, version: state.version, content: state.confirmed }),
      )
    } catch {
      /* ignore */
    }
  }, 800)
}

const conn = new Connection({
  hello: () => ({
    type: 'hello',
    name: state.me.name,
    color: state.me.color,
    room: state.roomId,
    known: knownState(state.roomId),
  }),
  onStatus: (s) => {
    state.status = s
    renderStatus()
    if (s === 'reconnecting') board.clearCursors()
  },
  onMessage: handleMessage,
})

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome': {
      const firstWelcome = !state.me.id
      state.me = { ...state.me, ...msg.you }
      state.admin = msg.admin
      state.epoch = msg.epoch
      state.roomId = msg.room.id
      state.roomName = msg.room.name
      state.locked = msg.room.locked
      state.confirmed = msg.room.content
      state.version = msg.room.version
      state.canUndo = msg.room.canUndo
      state.pending = []
      state.users = msg.users
      state.online = msg.online
      state.experiment = null
      state.wasWon = false
      updateUrl()
      board.clearCursors()
      recompute(true)
      renderRoomMeta()
      renderPeople()
      if (firstWelcome && state.sharedBoard) {
        conn.send({ type: 'createRoom', kind: 'import', content: state.sharedBoard, name: 'Sdílená sestava' })
        state.sharedBoard = null
        toast('Otevírám sdílenou sestavu v novém stole…')
      }
      if (!firstWelcome) addFeed({ icon: '🔄', text: `Jsi v místnosti ${state.roomName}` })
      break
    }
    case 'op': {
      if (msg.v <= state.version) return
      if (msg.v !== state.version + 1 && state.status !== 'solo') {
        // něco nám uteklo – znovu se připojíme do místnosti
        conn.send({ type: 'join', room: state.roomId })
        return
      }
      const prevType = pieceTypeAt(state.confirmed, msg.op)
      const res = applyOp(state.confirmed, msg.op)
      if (!res.ok) {
        conn.send({ type: 'join', room: state.roomId })
        return
      }
      state.version = msg.v
      state.canUndo = msg.canUndo
      const mine = msg.by.id === state.me.id
      if (mine) state.pending = state.pending.filter((p) => p.seq !== msg.seq)
      describeOp(msg, prevType, mine)
      recompute(msg.op.t === 'load')
      if (msg.op.t === 'load') renderRoomMeta()
      saveKnown()
      break
    }
    case 'reject': {
      state.pending = state.pending.filter((p) => p.seq !== msg.seq)
      toast(msg.error || 'To nejde', 'error')
      recompute()
      break
    }
    case 'users': {
      const before = new Map(state.users.map((u) => [u.id, u]))
      const after = new Map(msg.users.map((u) => [u.id, u]))
      for (const [id, u] of after) if (!before.has(id) && id !== state.me.id) addFeed({ icon: '👋', who: u, text: 'se připojuje' })
      for (const [id, u] of before) {
        if (!after.has(id) && id !== state.me.id) {
          addFeed({ icon: '🚪', who: u, text: 'odchází' })
          board.setCursor(id, { hide: true })
        }
      }
      state.users = msg.users
      state.online = msg.online
      renderPeople()
      break
    }
    case 'cursor':
      if (msg.id !== state.me.id) board.setCursor(msg.id, msg)
      break
    case 'emote':
      board.emote(msg.emoji, msg.x, msg.y)
      break
    case 'announce':
      showAnnouncement(msg.text)
      break
    case 'roomMeta':
      state.locked = msg.locked
      state.roomName = msg.name
      renderRoomMeta()
      break
    case 'roomCreated':
      state.roomId = msg.id
      updateUrl()
      break
    case 'pong':
      state.online = msg.online
      renderPeople()
      break
    case 'error':
      toast(msg.message, 'error')
      break
    default:
      break
  }
}

function pieceTypeAt(content, op) {
  if (!content || op.x == null) return null
  return content.cells[key(op.x, op.y)]?.t || null
}

function updateUrl() {
  const p = new URLSearchParams(location.search)
  if (state.roomId === 'lab') p.delete('room')
  else p.set('room', state.roomId)
  const qs = p.toString()
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''))
}

// ---------------------------------------------------------------------------
// Operace
// ---------------------------------------------------------------------------

function canEdit() {
  if (!state.confirmed) return false
  if (state.locked && !state.admin) {
    toast('Místnost je teď zamčená přednášejícím 🔒', 'error')
    return false
  }
  if (!conn.online) {
    toast('Nejsi připojen – zkouším to znovu…', 'error')
    return false
  }
  return true
}

function sendOp(op, { optimistic = true } = {}) {
  if (!canEdit()) return
  const seq = ++state.seq
  if (optimistic) {
    const test = applyOp(cloneContent(state.view), op)
    if (!test.ok) {
      toast(test.error, 'error')
      return
    }
    state.pending.push({ seq, op })
    recompute()
  }
  conn.send({ type: 'op', seq, op })
}

// ---------------------------------------------------------------------------
// Simulace a vykreslení
// ---------------------------------------------------------------------------

let lastSimKey = ''
function recompute(force = false) {
  if (!state.confirmed) return
  const view = cloneContent(state.confirmed)
  for (const p of state.pending) applyOp(view, p.op)
  state.view = view
  board.canEdit = !(state.locked && !state.admin)
  board.setContent(view)

  const simKey = JSON.stringify([view.cols, view.rows, view.cells])
  if (force || simKey !== lastSimKey) {
    lastSimKey = simKey
    state.sim = simulate(view)
    board.setSimulation(state.sim)
    const total = state.sim.maxFrameCount
    if (state.time > total - 1) state.time = Math.max(0, total - 1)
    if (state.mode === 'experiment') startExperiment()
  }
  state.goals = evaluateGoals(view, state.sim)
  board.setGoalInfo(view.level ? state.goals : null)
  if (view.level) {
    if (state.goals.won && !state.wasWon) {
      confetti()
      toast(`🎉 Level ${view.level.id} splněn!`, 'success', 4000)
      addFeed({ icon: '🏆', text: `Level ${view.level.id} „${view.level.name}“ je splněný!` })
    }
    state.wasWon = state.goals.won
  }
  renderToolbox()
  renderLevelBar()
  renderStatePanel()
  renderControls()
}

// ---------------------------------------------------------------------------
// Přehrávání
// ---------------------------------------------------------------------------

function maxFrame() {
  return Math.max(0, (state.sim?.maxFrameCount || 1) - 1)
}

function setMode(mode) {
  if (mode !== 'experiment') stopExperiment()
  state.mode = mode
  board.setMode(mode)
  if (mode === 'laser') {
    state.playing = false
    state.time = 0
  }
  if (mode === 'experiment') startExperiment()
  board.setTime(state.time)
  renderControls()
  renderStatePanel()
}

function play() {
  if (state.mode !== 'wave') setMode('wave')
  if (state.time >= maxFrame()) state.time = 0
  state.playing = true
  renderControls()
}

function pause() {
  state.playing = false
  renderControls()
}

function step(delta) {
  if (state.mode !== 'wave') {
    setMode('wave')
    state.time = 0
  }
  state.playing = false
  state.time = Math.max(0, Math.min(maxFrame(), Math.round(state.time) + delta))
  board.setTime(state.time)
  renderControls()
  renderStatePanel()
}

function rewind() {
  setMode('laser')
}

function fastForward() {
  if (state.mode !== 'wave') setMode('wave')
  state.playing = false
  state.time = maxFrame()
  board.setTime(state.time)
  renderControls()
  renderStatePanel()
}

// --- experiment: opakované jednotlivé výstřely ---

function startExperiment() {
  if (!state.sim || state.sim.lasers.length === 0) {
    state.experiment = { counts: new Map(), shots: 0, rep: 0, shot: null }
    board.setExperimentCounts(state.experiment.counts, 0)
    return
  }
  state.experiment = { counts: new Map(), shots: 0, rep: 0, shot: null, paused: false }
  board.setExperimentCounts(state.experiment.counts, 0)
  nextShot()
}

function stopExperiment() {
  state.experiment = null
  board.setExperimentCounts(null, 0)
}

function nextShot() {
  const ex = state.experiment
  if (!ex) return
  const outcomes = state.sim.lasers.map((l) => sampleOutcome(l))
  const end = Math.max(1, ...outcomes.map((o, i) => (o ? o.frame : state.sim.lasers[i].frames.length - 1)))
  const interval = ex.rep === 0 ? 170 : Math.max(4, 120 / (ex.rep + 1))
  ex.shot = { outcomes, end, time: 0, interval, fired: new Set() }
}

function tickExperiment(dt) {
  const ex = state.experiment
  if (!ex || !ex.shot || ex.paused) return
  const shot = ex.shot
  shot.time = Math.min(shot.end, shot.time + dt / shot.interval)
  // fotony, které ještě nezaklikaly
  const alive = new Set()
  shot.outcomes.forEach((o, i) => {
    if (o && shot.time >= o.frame) {
      if (!shot.fired.has(i)) {
        shot.fired.add(i)
        const k = `${o.x},${o.y}`
        ex.counts.set(k, (ex.counts.get(k) || 0) + 1)
        const piece = state.view.cells[k]
        board.click(o.x, o.y, piece?.t === 'Mine' ? 'mine' : 'detector')
      }
    } else alive.add(i)
  })
  board.drawPhotons(board.particlesAt(shot.time, alive))
  if (shot.time >= shot.end) {
    ex.shots += 1
    ex.rep += 1
    board.setExperimentCounts(ex.counts, ex.shots)
    if (ex.shots % 5 === 0 || ex.rep < 10) renderStatePanel()
    if (ex.shots >= 5000) {
      ex.paused = true
      renderStatePanel()
    } else nextShot()
  }
}

let lastTick = performance.now()
function loop(now) {
  const dt = Math.min(100, now - lastTick)
  lastTick = now
  if (state.mode === 'wave' && state.playing) {
    state.time = Math.min(maxFrame(), state.time + (dt / FRAME_MS) * state.speed)
    board.setTime(state.time)
    if (Math.floor(state.time) !== state.lastRenderedFrame) {
      state.lastRenderedFrame = Math.floor(state.time)
      renderStatePanel()
      renderControls()
    }
    if (state.time >= maxFrame()) pause()
  } else if (state.mode === 'experiment') {
    tickExperiment(dt)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ---------------------------------------------------------------------------
// Vstup z desky
// ---------------------------------------------------------------------------

let lastCursorSent = 0
function onBoardIntent(intent) {
  const content = state.view
  if (!content) return
  switch (intent.type) {
    case 'place': {
      const t = intent.e
      sendOp({ t: 'place', x: intent.x, y: intent.y, e: t, r: DEFAULT_ROT[t] ?? 0 })
      if (!intent.fromDrag && toolCount(content, t) <= 1) disarm()
      break
    }
    case 'tap': {
      const piece = content.cells[key(intent.x, intent.y)]
      if (!piece) return
      if (intent.alt && piece.t === 'Laser') return sendOp({ t: 'pol', x: intent.x, y: intent.y, p: nextPolarization(piece.p) })
      if (piece.lk === 2 || (ELEMENT_META[piece.t]?.rotations ?? 1) === 1) {
        openPieceCard(intent.x, intent.y)
        return
      }
      sendOp({ t: 'rotate', x: intent.x, y: intent.y, r: nextRotation(piece.t, piece.r) })
      break
    }
    case 'move':
      sendOp({ t: 'move', x: intent.x, y: intent.y, tx: intent.tx, ty: intent.ty })
      break
    case 'remove':
      sendOp({ t: 'remove', x: intent.x, y: intent.y })
      break
    case 'info':
      hideTooltip()
      openPieceCard(intent.x, intent.y)
      break
    case 'locked':
      toast('Tento dílek je přišroubovaný 🔩 – patří k zadání levelu.', 'info')
      break
    case 'empty':
      if (!state.armed) hideTooltip()
      break
    case 'hover':
      state.hover = intent.inside ? { x: intent.x, y: intent.y } : null
      scheduleBoardTooltip(intent)
      break
    case 'cursor': {
      const t = performance.now()
      if (intent.drag === undefined && t - lastCursorSent < 50) return
      lastCursorSent = t
      if (intent.hide) conn.send({ type: 'cursor', hide: true })
      else conn.send({ type: 'cursor', x: intent.x, y: intent.y, drag: intent.drag || null })
      break
    }
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Nástroje
// ---------------------------------------------------------------------------

function arm(t) {
  state.armed = t
  board.setArmed(t)
  renderToolbox()
  const bar = $('#armed-bar')
  bar.innerHTML = ''
  bar.append(
    h('span', { html: iconSvg(t, DEFAULT_ROT[t] ?? 0, 28) }),
    h('span', {}, `Klepni na prázdné pole: ${elementName(t)}`),
    h('button', { class: 'btn small', onClick: disarm }, 'Hotovo'),
  )
  bar.classList.add('show')
}

function disarm() {
  state.armed = null
  board.setArmed(null)
  $('#armed-bar').classList.remove('show')
  renderToolbox()
}

let toolboxKey = ''
function renderToolbox() {
  const content = state.view
  if (!content) return
  const host = $('#toolbox')
  const isLevel = !!content.tools
  const available = isLevel ? Object.keys(content.tools) : SANDBOX_TOOLS
  const k = JSON.stringify([isLevel, content.tools, state.armed, available])
  if (k === toolboxKey) return
  toolboxKey = k
  host.innerHTML = ''
  host.classList.toggle('level-tools', isLevel)
  if (isLevel && available.length === 0) {
    host.append(h('div', { class: 'tb-empty' }, 'V tomto levelu nic nepřidáváš – stačí otáčet a posouvat dílky na desce.'))
    return
  }
  for (const group of TOOL_GROUPS) {
    const items = group.items.filter((t) => available.includes(t))
    if (!items.length) continue
    const g = h('div', { class: 'tb-group' }, h('div', { class: 'tb-title' }, group.name))
    for (const t of items) {
      const count = toolCount(content, t)
      const btn = h(
        'button',
        {
          class: `tool ${state.armed === t ? 'armed' : ''} ${count <= 0 ? 'empty' : ''}`,
          dataset: { t },
          title: `${elementName(t)} – ${ELEMENTS[t].short}`,
        },
        h('span', { class: 'tool-icon', html: iconSvg(t, DEFAULT_ROT[t] ?? 0, 44) }),
        h('span', { class: 'tool-name' }, elementName(t)),
        isLevel ? h('span', { class: 'tool-count' }, `×${count}`) : null,
        h('span', { class: 'tool-info', title: 'Co to dělá?', dataset: { info: t } }, 'i'),
      )
      attachToolPointer(btn, t)
      g.append(btn)
    }
    host.append(g)
  }
}

function attachToolPointer(btn, t) {
  let down = null
  btn.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tool-info')) return
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType, started: false }
    btn.addEventListener('pointermove', move)
    btn.addEventListener('pointerup', up, { once: true })
    btn.addEventListener('pointercancel', cancel, { once: true })
    clearTimeout(down.lp)
    down.lp = setTimeout(() => {
      if (down && !down.started) {
        down.started = 'info'
        openElementCard(t)
      }
    }, 550)
  })
  const move = (e) => {
    if (!down || down.started) return
    const dx = e.clientX - down.x
    const dy = e.clientY - down.y
    const dist = Math.hypot(dx, dy)
    // dotyk: tah nahoru = přetáhnout na desku, do strany = posouvat lištu
    const wantsDrag = down.type === 'mouse' ? dist > 6 : dy < -12 && Math.abs(dy) > Math.abs(dx)
    if (wantsDrag) {
      if (toolCount(state.view, t) <= 0) return
      if (!canEdit()) return
      down.started = 'drag'
      clearTimeout(down.lp)
      hideTooltip()
      btn.releasePointerCapture?.(e.pointerId)
      board.startExternalDrag(t, e, DEFAULT_ROT[t] ?? 0)
    } else if (dist > 10) {
      clearTimeout(down.lp)
    }
  }
  const up = () => {
    btn.removeEventListener('pointermove', move)
    if (!down) return
    clearTimeout(down.lp)
    if (!down.started) {
      if (state.armed === t) disarm()
      else if (toolCount(state.view, t) > 0) arm(t)
      else toast('Tenhle prvek už ti došel.', 'info')
    }
    down = null
  }
  const cancel = () => {
    btn.removeEventListener('pointermove', move)
    if (down) clearTimeout(down.lp)
    down = null
  }
  btn.addEventListener('click', (e) => {
    const info = e.target.closest('.tool-info')
    if (info) {
      e.stopPropagation()
      openElementCard(t)
    }
  })
  btn.addEventListener('mouseenter', () => scheduleToolTooltip(btn, t))
  btn.addEventListener('mouseleave', hideTooltip)
}

// ---------------------------------------------------------------------------
// Tooltipy a karty
// ---------------------------------------------------------------------------

let tooltipTimer = null
let tooltipCard = null
function hideTooltip() {
  clearTimeout(tooltipTimer)
  const tip = $('#tooltip')
  tip.classList.remove('show')
  tooltipCard?.destroy()
  tooltipCard = null
}

function showTooltipAt(t, rect, piece = null) {
  hideTooltip()
  const tip = $('#tooltip')
  tip.innerHTML = ''
  tooltipCard = abilityCard(t, { compact: true, piece })
  tip.append(tooltipCard.el)
  tip.classList.add('show')
  const w = 330
  let left = rect.right + 12
  if (left + w > innerWidth - 8) left = rect.left - w - 12
  if (left < 8) left = Math.max(8, Math.min(innerWidth - w - 8, rect.left))
  const top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, rect.top - 20))
  tip.style.left = `${left}px`
  tip.style.top = `${top}px`
}

function scheduleToolTooltip(btn, t) {
  if (matchMedia('(hover: none)').matches) return
  clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => showTooltipAt(t, btn.getBoundingClientRect()), 320)
}

function scheduleBoardTooltip(intent) {
  clearTimeout(tooltipTimer)
  if (!intent.inside) return hideTooltip()
  const piece = state.view?.cells[key(intent.x, intent.y)]
  if (!piece) return hideTooltip()
  hideTooltip()
  tooltipTimer = setTimeout(() => {
    const rect = { left: intent.clientX - 20, right: intent.clientX + 30, top: intent.clientY - 40 }
    showTooltipAt(piece.t, rect, piece)
  }, 900)
}

function openElementCard(t) {
  hideTooltip()
  const card = abilityCard(t, {})
  const m = openModal({ title: '', body: card.el, className: 'card-modal', onClose: () => card.destroy() })
  return m
}

function openPieceCard(x, y) {
  const piece = state.view?.cells[key(x, y)]
  if (!piece) return
  let modal = null
  const actions = []
  const rotations = ELEMENT_META[piece.t]?.rotations ?? 1
  if (piece.lk !== 2 && rotations > 1) {
    actions.push({
      label: '⟲ Otočit',
      kind: 'primary',
      onClick: () => {
        sendOp({ t: 'rotate', x, y, r: nextRotation(piece.t, piece.r) })
        modal.close()
      },
    })
  }
  if (piece.t === 'Laser' && piece.lk !== 2) {
    for (const p of [0, 90, 45, 135]) {
      const pl = POLARIZATION_LABELS[p]
      actions.push({
        label: `${pl.arrow} ${pl.short}`,
        kind: (piece.p || 0) === p ? 'active' : '',
        title: `Polarizace ${pl.name}`,
        onClick: () => {
          sendOp({ t: 'pol', x, y, p })
          modal.close()
        },
      })
    }
  }
  if (!piece.lk) {
    actions.push({
      label: '🗑 Odebrat',
      kind: 'danger',
      onClick: () => {
        sendOp({ t: 'remove', x, y })
        modal.close()
      },
    })
  }
  const card = abilityCard(piece.t, { piece, actions })
  modal = openModal({ title: '', body: card.el, className: 'card-modal', onClose: () => card.destroy() })
}

// ---------------------------------------------------------------------------
// Panely
// ---------------------------------------------------------------------------

function renderStatus() {
  const el = $('#conn')
  const map = {
    connecting: ['Připojuji…', 'warn'],
    reconnecting: ['Znovu se připojuji…', 'warn'],
    online: ['Živě', 'ok'],
    solo: ['Offline režim', 'solo'],
  }
  const [text, cls] = map[state.status] || ['?', 'warn']
  el.className = `conn ${cls}`
  el.textContent = text
  el.title = state.status === 'solo' ? 'Server není dostupný – hraješ jen ty, změny se ukládají v prohlížeči.' : ''
  updateUrl()
}

function renderRoomMeta() {
  $('#room-name').textContent = state.roomName || '…'
  $('#room-lock').textContent = state.locked ? '🔒' : ''
  document.title = `${state.roomName} · Kvantová hra LIVE`
  $('#undo-btn').disabled = !state.canUndo
}

function renderPeople() {
  const avatars = $('#avatars')
  avatars.innerHTML = ''
  const players = state.users.filter((u) => u.role !== 'presenter')
  const shown = players.slice(0, 6)
  for (const u of shown) {
    avatars.append(h('span', { class: `avatar ${u.id === state.me.id ? 'me' : ''}`, style: { '--c': u.color }, title: u.name }, initials(u.name)))
  }
  if (players.length > shown.length) avatars.append(h('span', { class: 'avatar more' }, `+${players.length - shown.length}`))
  $('#online-count').textContent = state.online || players.length

  const list = $('#people-list')
  list.innerHTML = ''
  for (const u of state.users) {
    list.append(
      h(
        'li',
        { class: 'person' },
        h('span', { class: 'avatar', style: { '--c': u.color } }, u.role === 'presenter' ? '📽' : initials(u.name)),
        h('span', { class: 'person-name' }, u.name, u.id === state.me.id ? h('em', {}, ' (ty)') : null, u.role === 'presenter' ? h('em', {}, ' · projektor') : null),
      ),
    )
  }
  $('#people-room').textContent = state.roomName
  const me = $('#me-btn')
  me.innerHTML = ''
  me.append(h('span', { class: 'avatar', style: { '--c': state.me.color } }, initials(state.me.name)), h('span', { class: 'me-name' }, state.me.name))
}

function renderControls() {
  const playBtn = $('#play-btn')
  playBtn.textContent = state.playing ? '⏸' : '▶'
  playBtn.title = state.playing ? 'Pauza (mezerník)' : 'Pustit foton (mezerník)'
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('active', b.dataset.mode === state.mode)
  const total = maxFrame()
  $('#frame-info').textContent = state.mode === 'wave' ? `krok ${Math.floor(state.time)} / ${total}` : state.mode === 'experiment' ? 'experiment' : 'paprsek'
  $('#undo-btn').disabled = !state.canUndo
}

function renderLevelBar() {
  const bar = $('#level-bar')
  const content = state.view
  if (!content?.level) {
    bar.classList.add('hidden')
    return
  }
  bar.classList.remove('hidden')
  const g = state.goals
  const lvl = content.level
  bar.innerHTML = ''
  const chips = []
  for (const goal of g.goals) {
    chips.push(h('span', { class: `chip ${goal.met ? 'ok' : ''}` }, `${goal.met ? '✓' : '🎯'} ${formatPct(goal.value)} / ${formatPct(goal.threshold)}`))
  }
  for (const m of g.mines) {
    chips.push(h('span', { class: `chip ${m.safe ? 'ok' : 'bad'}` }, m.safe ? '💣 mina v bezpečí' : `💥 mina: ${formatPct(m.value)}`))
  }
  const next = getLevel(lvl.id + 1)
  bar.append(
    h('div', { class: 'lv-title' }, h('span', { class: 'lv-num' }, `Level ${lvl.id}`), h('b', {}, lvl.name), h('span', { class: 'lv-en' }, lvl.en || '')),
    h('div', { class: 'lv-goals' }, chips),
    h(
      'div',
      { class: 'lv-actions' },
      g.won ? h('span', { class: 'chip win' }, '🎉 Splněno!') : null,
      h('button', { class: 'btn small', onClick: () => sendOp({ t: 'clear' }, { optimistic: false }) }, '↺ Restart'),
      next ? h('button', { class: `btn small ${g.won ? 'primary' : ''}`, onClick: () => sendOp({ t: 'level', id: next.id }, { optimistic: false }) }, 'Další ▸') : null,
    ),
  )
}

function phaseDot([re, im]) {
  const r = Math.hypot(re, im)
  const ang = (Math.atan2(im, re) * 180) / Math.PI
  return h(
    'span',
    { class: 'phase', title: `|a| = ${r.toFixed(2)}, fáze ${Math.round(ang)}°`, style: { '--a': `${-ang}deg`, '--r': Math.min(1, r) } },
    h('i'),
  )
}

function renderStatePanel() {
  const host = $('#state-body')
  if (!host || !state.sim) return
  host.innerHTML = ''
  const sim = state.sim
  const content = state.view

  if (sim.lasers.length === 0) {
    host.append(h('p', { class: 'muted' }, 'Na desce není žádný laser. Přidej ho z nástrojů 🔴'))
    return
  }

  // kde foton skončí
  if (state.mode === 'experiment' && state.experiment) {
    const ex = state.experiment
    host.append(h('h3', {}, `Experiment: ${ex.shots} výstřelů${sim.lasers.length > 1 ? ` × ${sim.lasers.length} lasery` : ''}`))
    const rows = [...ex.counts.entries()].sort((a, b) => b[1] - a[1])
    const totalShots = Math.max(1, ex.shots)
    const list = h('div', { class: 'outcomes' })
    for (const [k, n] of rows) {
      const expected = sim.total.get(k) || 0
      list.append(outcomeRow(k, n / totalShots, `${n}×`, expected))
    }
    if (!rows.length) list.append(h('p', { class: 'muted' }, 'Fotony letí…'))
    host.append(list)
    host.append(
      h(
        'p',
        { class: 'note' },
        'Každý foton cvakne jen v jednom detektoru – náhodně. Teprve z mnoha opakování vyjde pravděpodobnost (šedá značka = teorie).',
      ),
    )
    host.append(
      h(
        'div',
        { class: 'row-btns' },
        h(
          'button',
          {
            class: 'btn small',
            onClick: () => {
              startExperiment()
              renderStatePanel()
            },
          },
          '↺ Znovu od nuly',
        ),
        h(
          'button',
          {
            class: 'btn small',
            onClick: () => {
              if (state.experiment) state.experiment.paused = !state.experiment.paused
              renderStatePanel()
            },
          },
          ex.paused ? '▶ Pokračovat' : '⏸ Zastavit',
        ),
      ),
    )
    return
  }

  host.append(h('h3', {}, 'Kde foton skončí'))
  const rows = [...sim.total.entries()].filter(([, v]) => v > 0.0005).sort((a, b) => b[1] - a[1])
  const list = h('div', { class: 'outcomes' })
  for (const [k, v] of rows) list.append(outcomeRow(k, v, formatPct(v)))
  const totalAbs = rows.reduce((s, [, v]) => s + v, 0)
  if (totalAbs < 0.995) list.append(outcomeRow('loop', 1 - totalAbs, formatPct(1 - totalAbs)))
  host.append(list)

  // stav |ψ⟩
  const li = Math.min(state.ketLaser, sim.lasers.length - 1)
  const laser = sim.lasers[li]
  const f = state.mode === 'wave' ? Math.min(Math.floor(state.time), laser.frames.length - 1) : 0
  const frame = laser.frames[f]
  const comps = ketComponents(frame)
  const head = h('h3', {}, `Kvantový stav |ψ⟩ – krok ${f}`)
  host.append(head)
  if (sim.lasers.length > 1) {
    const sel = h('div', { class: 'laser-tabs' })
    sim.lasers.forEach((l, i) =>
      sel.append(
        h(
          'button',
          {
            class: `btn tiny ${i === li ? 'active' : ''}`,
            onClick: () => {
              state.ketLaser = i
              renderStatePanel()
            },
          },
          `Laser ${i + 1}`,
        ),
      ),
    )
    host.append(sel)
  }
  const ket = h('div', { class: 'ket' })
  if (!comps.length) ket.append(h('span', { class: 'muted' }, 'Foton už byl pohlcen (nebo opustil desku).'))
  comps.slice(0, 14).forEach((c, i) => {
    ket.append(
      h(
        'div',
        { class: 'ket-term' },
        h('span', { class: 'ket-plus' }, i === 0 ? '' : '+'),
        phaseDot(c.amp),
        h('span', { class: 'ket-amp' }, `(${formatComplex(c.amp)})`),
        h('span', { class: 'ket-basis' }, `|${c.x},${c.y},${DIR_SYMBOLS[c.d]},${POL_SYMBOLS[c.pol]}⟩`),
      ),
    )
  })
  if (comps.length > 14) ket.append(h('div', { class: 'muted' }, `… a dalších ${comps.length - 14} členů`))
  host.append(ket)
  const places = new Set(comps.map((c) => `${c.x},${c.y}`)).size
  const paths = new Set(comps.map((c) => `${c.x},${c.y},${c.d}`)).size
  host.append(
    h(
      'p',
      { class: 'note' },
      state.mode !== 'wave'
        ? 'Pusť foton ▶ a sleduj, jak se jeho stav mění krok po kroku.'
        : places > 1
          ? `Foton je teď v superpozici – na ${places} místech zároveň. Amplitudy jsou komplexní čísla, pravděpodobnost = |amplituda|².`
          : paths > 1
            ? `Foton se právě rozdělil – letí ${paths} směry zároveň (superpozice). Pravděpodobnost = |amplituda|².`
            : comps.length
            ? 'Foton je na jednom místě. Komplexní amplituda nese fázi (puntík ukazuje její úhel).'
            : '',
    ),
  )
}

function outcomeRow(k, value, label, expected = null) {
  let icon = '🌀'
  let name = 'koloběh (foton zůstal v desce)'
  if (k === '-1,-1') {
    icon = '🌌'
    name = 'mimo desku'
  } else if (k !== 'loop') {
    const [x, y] = parseKey(k)
    const piece = state.view.cells[k]
    name = `${piece ? elementName(piece.t) : 'pole'} (${x}, ${y})`
    icon = piece ? h('span', { html: iconSvg(piece.t, piece.r || 0, 22) }) : '·'
  }
  const bar = h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, value * 100)}%` } }))
  if (expected != null) bar.append(h('b', { class: 'expected', style: { left: `${Math.min(100, expected * 100)}%` } }))
  return h('div', { class: `outcome ${k === '-1,-1' || k === 'loop' ? 'lost' : ''}` }, h('span', { class: 'oc-icon' }, icon), h('span', { class: 'oc-name' }, name), bar, h('span', { class: 'oc-val' }, label))
}

function addFeed(item) {
  state.feed.unshift({ ...item, at: Date.now() })
  state.feed = state.feed.slice(0, 60)
  const badge = $('#feed-badge')
  if (!document.querySelector('[data-tab="activity"]').classList.contains('active')) {
    state.unseen = (state.unseen || 0) + 1
    badge.textContent = state.unseen > 9 ? '9+' : state.unseen
    badge.classList.add('show')
  }
  renderFeed()
}

function renderFeed() {
  const host = $('#feed')
  host.innerHTML = ''
  for (const it of state.feed) {
    host.append(
      h(
        'li',
        { class: 'feed-item' },
        h('span', { class: 'feed-icon', html: typeof it.icon === 'string' && it.icon.startsWith('<') ? it.icon : null }, typeof it.icon === 'string' && !it.icon.startsWith('<') ? it.icon : ''),
        h('span', { class: 'feed-text' }, it.who ? h('b', { style: { color: it.who.color } }, it.who.id === state.me.id ? 'Ty' : it.who.name) : null, it.who ? ' ' : '', it.text),
        h('time', {}, timeAgo(it.at)),
      ),
    )
  }
}

function describeOp(msg, prevType, mine) {
  const op = msg.op
  const by = msg.by
  let text = ''
  let type = prevType
  switch (msg.kind) {
    case 'place':
      type = op.e
      text = `přidává ${ACCUSATIVE[op.e] || op.e}`
      break
    case 'rotate':
      text = `otáčí ${ACCUSATIVE[type] || 'dílek'}`
      break
    case 'move':
      text = `posouvá ${ACCUSATIVE[type] || 'dílek'}`
      break
    case 'remove':
      text = `odebírá ${ACCUSATIVE[type] || 'dílek'}`
      break
    case 'pol':
      text = `mění polarizaci laseru na ${POLARIZATION_LABELS[op.p || 0].arrow}`
      break
    case 'clear':
      text = state.confirmed.level ? 'restartuje level' : 'čistí desku 🧹'
      break
    case 'template':
      text = 'načítá experiment'
      break
    case 'level':
      text = `spouští level ${state.confirmed.level?.id}: ${state.confirmed.level?.name}`
      break
    case 'undo':
      text = 'vrací poslední velkou změnu ↶'
      break
    default:
      text = 'mění desku'
  }
  addFeed({ icon: type ? iconSvg(type, 0, 20) : '⚡', who: by, text })
  if (!mine) {
    const x = op.tx ?? op.x
    const y = op.ty ?? op.y
    if (x != null) board.flash(x, y, by.color, by.name)
  }
}

let announceTimer = null
function showAnnouncement(text) {
  const el = $('#announce')
  el.innerHTML = ''
  el.append(h('span', {}, '📣 '), h('span', {}, text), h('button', { class: 'btn tiny', onClick: () => el.classList.add('hidden') }, '×'))
  el.classList.remove('hidden')
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => el.classList.add('hidden'), 20000)
}

// ---------------------------------------------------------------------------
// Modální okna
// ---------------------------------------------------------------------------

function openNameModal(first = false) {
  let color = state.me.color
  const input = h('input', { class: 'input', maxlength: 24, value: state.me.name, 'aria-label': 'Tvoje jméno' })
  const swatches = h(
    'div',
    { class: 'swatches' },
    PALETTE.map((c) =>
      h('button', {
        class: `swatch ${c === color ? 'active' : ''}`,
        style: { '--c': c },
        'aria-label': `Barva ${c}`,
        onClick: (e) => {
          color = c
          for (const b of swatches.children) b.classList.toggle('active', b === e.currentTarget)
        },
      }),
    ),
  )
  const save = () => {
    const name = input.value.trim().slice(0, 24) || randomName()
    state.me.name = name
    state.me.color = color
    savePref('name', name)
    savePref('color', color)
    conn.send({ type: 'rename', name, color })
    renderPeople()
    m.close()
  }
  const body = h(
    'div',
    { class: 'name-form' },
    first
      ? h(
          'div',
          { class: 'welcome' },
          h('p', {}, 'Vítej ve společné kvantové laboratoři! ⚛️ Všechno, co tu postavíš, vidí ostatní v reálném čase.'),
          h('ul', {}, h('li', {}, 'Přetáhni nebo klepni na prvek dole a pak na pole na desce.'), h('li', {}, 'Klepnutím na dílek ho otočíš, podržením zobrazíš, co dělá.'), h('li', {}, 'Tlačítkem ▶ pustíš foton a uvidíš kvantovou vlnu.')),
        )
      : null,
    h('label', {}, 'Jak ti mají ostatní říkat?'),
    h('div', { class: 'name-row' }, input, h('button', { class: 'btn', title: 'Náhodné jméno', onClick: () => (input.value = randomName()) }, '🎲')),
    h('label', {}, 'Tvoje barva'),
    swatches,
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary big', onClick: save }, first ? 'Jdu na to! 🚀' : 'Uložit')),
  )
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save())
  const m = openModal({ title: first ? 'Ahoj! Jak se jmenuješ?' : 'Tvoje jméno', body, onClose: () => savePref('name', state.me.name) })
  setTimeout(() => input.select(), 50)
}

async function openRoomsModal() {
  const list = h('div', { class: 'room-list' }, h('p', { class: 'muted' }, 'Načítám…'))
  const body = h(
    'div',
    {},
    h('p', { class: 'muted' }, 'Každá místnost (stůl) má vlastní desku. Hlavní laboratoř sdílí všichni – nebo si založ vlastní stůl s kamarády.'),
    list,
    h('h3', {}, 'Nový stůl'),
    h(
      'div',
      { class: 'new-room' },
      h('button', { class: 'btn primary', onClick: () => createRoom({ kind: 'sandbox' }) }, '🧪 Prázdná laboratoř'),
      h('button', { class: 'btn', onClick: () => (m.close(), openExperimentsModal(true)) }, '🌈 Se slavným experimentem'),
      h('button', { class: 'btn', onClick: () => (m.close(), openLevelsModal(true)) }, '🏆 S levelem'),
    ),
  )
  const m = openModal({ title: 'Místnosti', body, wide: true })
  try {
    const res = await fetch('/api/rooms')
    const data = await res.json()
    list.innerHTML = ''
    for (const r of data.rooms.slice(0, 60)) {
      list.append(
        h(
          'button',
          { class: `room-item ${r.id === state.roomId ? 'current' : ''}`, onClick: () => (m.close(), joinRoom(r.id)) },
          h('span', { class: 'ri-name' }, r.locked ? '🔒 ' : '', r.name),
          h('span', { class: 'ri-meta' }, r.level ? `🏆 level ${r.level.id} · ` : '', `${r.pieces} dílků`),
          h('span', { class: 'ri-users' }, `👥 ${r.users}`),
        ),
      )
    }
  } catch {
    list.innerHTML = ''
    list.append(h('p', { class: 'muted' }, state.status === 'solo' ? 'V offline režimu jsou jen tvoje místní stoly.' : 'Seznam se nepodařilo načíst.'))
  }
}

function joinRoom(id) {
  if (id === state.roomId) return
  stopExperiment()
  state.mode = 'laser'
  board.setMode('laser')
  state.time = 0
  state.playing = false
  state.feed = []
  renderFeed()
  conn.send({ type: 'join', room: id, known: knownState(id) })
}

function createRoom(opts) {
  if (!conn.online) return toast('Nejsi připojen.', 'error')
  closeTopModal()
  conn.send({ type: 'createRoom', ...opts })
}

function openExperimentsModal(asNewRoom = false) {
  const body = h('div', { class: 'tpl-grid' })
  for (const tpl of TEMPLATES) {
    body.append(
      h(
        'div',
        { class: 'tpl-card' },
        h('div', { class: 'tpl-icon' }, tpl.icon),
        h('h3', {}, tpl.name),
        h('p', {}, tpl.desc),
        h(
          'div',
          { class: 'tpl-actions' },
          asNewRoom ? null : h('button', { class: 'btn primary small', onClick: () => loadIntoRoom({ t: 'template', id: tpl.id }, m) }, 'Načíst sem'),
          h('button', { class: `btn small ${asNewRoom ? 'primary' : ''}`, onClick: () => (m.close(), createRoom({ kind: 'template', templateId: tpl.id, name: tpl.name })) }, 'Nový stůl'),
        ),
      ),
    )
  }
  const m = openModal({ title: 'Slavné experimenty', body, wide: true })
}

function loadIntoRoom(op, modal) {
  const others = state.users.filter((u) => u.id !== state.me.id && u.role !== 'presenter').length
  const pieces = Object.keys(state.view?.cells || {}).length
  if (others > 0 && pieces > 3 && !confirm(`Na této desce je teď ${others + 1} lidí. Opravdu ji přepsat? (Jde to vrátit tlačítkem ↶)`)) return
  modal?.close()
  sendOp(op, { optimistic: false })
}

function openLevelsModal(asNewRoom = false) {
  const body = h('div', {}, h('p', { class: 'muted' }, '36 klasických levelů z Quantum Game. Cíl: dostat foton do detektorů s danou pravděpodobností – a nevyhodit do vzduchu minu.'))
  const grid = h('div', { class: 'level-grid' })
  for (const l of LEVELS) {
    const tools = Object.entries(l.tools)
      .map(([t, n]) => `${n}× ${elementName(t)}`)
      .join(', ')
    grid.append(
      h(
        'div',
        { class: 'level-card' },
        h('div', { class: 'lc-num' }, l.id),
        h('div', { class: 'lc-body' }, h('b', {}, l.name), h('span', { class: 'lc-en' }, l.en), h('span', { class: 'lc-tools' }, tools || 'jen otáčení')),
        h(
          'div',
          { class: 'lc-actions' },
          asNewRoom ? null : h('button', { class: 'btn tiny primary', onClick: () => loadIntoRoom({ t: 'level', id: l.id }, m) }, 'Hrát zde'),
          h('button', { class: 'btn tiny', onClick: () => (m.close(), createRoom({ kind: 'level', levelId: l.id })) }, 'Nový stůl'),
        ),
      ),
    )
  }
  body.append(grid)
  const m = openModal({ title: 'Výzvy – levely', body, wide: true })
}

function openEncyclopedia() {
  let current = null
  const detail = h('div', { class: 'enc-detail' })
  const grid = h('div', { class: 'enc-grid' })
  const show = (t) => {
    current?.destroy()
    detail.innerHTML = ''
    current = abilityCard(t, {})
    detail.append(current.el)
    for (const b of grid.children) b.classList.toggle('active', b.dataset.t === t)
  }
  for (const group of TOOL_GROUPS) {
    for (const t of group.items) {
      if (t === 'Wall') continue
      grid.append(h('button', { class: 'enc-item', dataset: { t }, title: ELEMENTS[t].short, onClick: () => show(t) }, h('span', { html: iconSvg(t, DEFAULT_ROT[t] ?? 0, 40) }), h('span', {}, elementName(t))))
    }
  }
  const body = h('div', { class: 'encyclopedia' }, grid, detail)
  openModal({ title: 'Prvky – co který dělá', body, wide: true, onClose: () => current?.destroy() })
  show('BeamSplitter')
}

function shareLinks() {
  const base = `${location.origin}${location.pathname}`
  const roomUrl = state.roomId === 'lab' ? base : `${base}?room=${encodeURIComponent(state.roomId)}`
  const boardUrl = `${base}#b=${encodeBoard(state.view)}`
  return { roomUrl, boardUrl }
}

function openShareModal() {
  const { roomUrl, boardUrl } = shareLinks()
  const title = h('input', { class: 'input', maxlength: 60, placeholder: 'Název tvé sestavy, např. „Můj interferometr“' })
  const note = h('input', { class: 'input', maxlength: 200, placeholder: 'Krátký popis (nepovinné)' })
  const copyBtn = (text, label) =>
    h('button', { class: 'btn small', onClick: () => copyText(text).then(() => toast('Zkopírováno 📋', 'success')) }, label)
  const body = h(
    'div',
    { class: 'share' },
    h(
      'div',
      { class: 'share-block' },
      h('h3', {}, '👥 Pozvi lidi do této místnosti'),
      h('p', { class: 'muted' }, 'Kdo načte QR kód, uvidí a upravuje stejnou desku jako ty – živě.'),
      h('div', { class: 'share-qr' }, h('img', { src: `/api/qr.svg?text=${encodeURIComponent(roomUrl)}`, alt: 'QR kód místnosti', width: 180, height: 180 }), h('div', {}, h('code', { class: 'url' }, roomUrl), copyBtn(roomUrl, 'Kopírovat odkaz'))),
    ),
    h(
      'div',
      { class: 'share-block' },
      h('h3', {}, '📸 Sdílej svou sestavu'),
      h('p', { class: 'muted' }, 'Odkaz obsahuje celou desku. Kdo ho otevře, dostane vlastní kopii na novém stole.'),
      h('div', { class: 'share-row' }, h('code', { class: 'url small' }, boardUrl.length > 90 ? `${boardUrl.slice(0, 90)}…` : boardUrl), copyBtn(boardUrl, 'Kopírovat')),
      navigator.share ? h('button', { class: 'btn small', onClick: () => navigator.share({ title: 'Moje kvantová sestava', url: boardUrl }).catch(() => {}) }, '📤 Sdílet…') : null,
    ),
    h(
      'div',
      { class: 'share-block' },
      h('h3', {}, '🖼 Ulož do společné galerie'),
      h('p', { class: 'muted' }, 'Galerie se ukazuje na projektoru a zůstane i po přednášce.'),
      title,
      note,
      h(
        'div',
        { class: 'share-row' },
        h(
          'button',
          {
            class: 'btn primary',
            onClick: async () => {
              try {
                const res = await fetch('/api/gallery', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: title.value, note: note.value, author: state.me.name, color: state.me.color, content: state.view }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)
                toast('Uloženo do galerie 🖼', 'success')
                m.close()
              } catch (e) {
                toast(e.message || 'Uložení se nepovedlo', 'error')
              }
            },
          },
          'Uložit do galerie',
        ),
        h('a', { class: 'btn small', href: '/galerie', target: '_blank' }, 'Otevřít galerii ↗'),
      ),
    ),
    h(
      'div',
      { class: 'share-block' },
      h('h3', {}, '💾 Soubor'),
      h(
        'div',
        { class: 'share-row' },
        h('button', { class: 'btn small', onClick: exportJson }, 'Stáhnout .json'),
        h('label', { class: 'btn small file' }, 'Nahrát .json', h('input', { type: 'file', accept: '.json,application/json', onChange: importJson })),
      ),
    ),
  )
  const m = openModal({ title: 'Sdílet', body, wide: true })
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ app: 'kvantova-hra-live', version: 1, content: state.view }, null, 1)], { type: 'application/json' })
  const a = h('a', { href: URL.createObjectURL(blob), download: `kvantova-sestava-${state.roomId}.json` })
  document.body.append(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

async function importJson(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    const content = data.content || data
    closeTopModal()
    loadIntoRoom({ t: 'load', content })
  } catch {
    toast('Soubor se nepodařilo načíst.', 'error')
  }
}

// ---------------------------------------------------------------------------
// Ovládání
// ---------------------------------------------------------------------------

function bindUi() {
  $('#play-btn').addEventListener('click', () => (state.playing ? pause() : play()))
  $('#rewind-btn').addEventListener('click', rewind)
  $('#back-btn').addEventListener('click', () => step(-1))
  $('#fwd-btn').addEventListener('click', () => step(1))
  $('#end-btn').addEventListener('click', fastForward)
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => (b.dataset.mode === 'wave' ? play() : setMode(b.dataset.mode)))
  $('#undo-btn').addEventListener('click', () => sendOp({ t: 'undo' }, { optimistic: false }))
  $('#clear-btn').addEventListener('click', () => {
    const others = state.users.filter((u) => u.id !== state.me.id && u.role !== 'presenter').length
    const msg = state.view?.level ? 'Restartovat level?' : others > 0 ? `Vyčistit desku pro všech ${others + 1} lidí? (Jde to vrátit ↶)` : 'Vyčistit desku?'
    if (confirm(msg)) sendOp({ t: 'clear' }, { optimistic: false })
  })
  $('#room-btn').addEventListener('click', openRoomsModal)
  $('#me-btn').addEventListener('click', () => openNameModal(false))
  for (const b of document.querySelectorAll('[data-open]')) {
    b.addEventListener('click', () => {
      const what = b.dataset.open
      if (what === 'experiments') openExperimentsModal()
      else if (what === 'levels') openLevelsModal()
      else if (what === 'encyclopedia') openEncyclopedia()
      else if (what === 'share') openShareModal()
      else if (what === 'rooms') openRoomsModal()
    })
  }
  const emoteBar = $('#emotes')
  for (const e of EMOTES) {
    emoteBar.append(
      h(
        'button',
        {
          class: 'emote',
          title: 'Poslat reakci všem',
          onClick: () => {
            const pos = state.hover
            conn.send({ type: 'emote', emoji: e, x: pos?.x ?? null, y: pos?.y ?? null })
          },
        },
        e,
      ),
    )
  }
  // záložky postranního panelu
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab)
      for (const p of document.querySelectorAll('.tab-panel')) p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`)
      if (tab.dataset.tab === 'activity') {
        state.unseen = 0
        $('#feed-badge').classList.remove('show')
      }
    })
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return
    if (e.key === 'Escape') {
      if (closeTopModal()) return
      if (state.armed) disarm()
      hideTooltip()
      return
    }
    if (hasOpenModal()) return
    const hv = state.hover && state.view?.cells[key(state.hover.x, state.hover.y)]
    switch (e.key) {
      case ' ':
        e.preventDefault()
        state.playing ? pause() : play()
        break
      case 'ArrowRight':
        step(1)
        break
      case 'ArrowLeft':
        step(-1)
        break
      case 'Home':
        rewind()
        break
      case 'End':
        fastForward()
        break
      case 'r':
      case 'R':
        if (hv && hv.lk !== 2) sendOp({ t: 'rotate', x: state.hover.x, y: state.hover.y, r: nextRotation(hv.t, hv.r) })
        break
      case 'p':
      case 'P':
        if (hv?.t === 'Laser' && hv.lk !== 2) sendOp({ t: 'pol', x: state.hover.x, y: state.hover.y, p: nextPolarization(hv.p) })
        break
      case 'Delete':
      case 'Backspace':
        if (hv && !hv.lk) sendOp({ t: 'remove', x: state.hover.x, y: state.hover.y })
        break
      case '1':
        setMode('laser')
        break
      case '2':
        play()
        break
      case '3':
        setMode('experiment')
        break
      case 'i':
        if (hv) openPieceCard(state.hover.x, state.hover.y)
        break
      default:
        break
    }
  })

  window.addEventListener('resize', () => board.fit())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) conn.send({ type: 'cursor', hide: true })
  })
  setInterval(() => renderFeed(), 30000)
}

bindUi()
renderStatus()
renderPeople()
if (firstVisit) setTimeout(() => openNameModal(true), 300)
savePref('name', state.me.name)
savePref('color', state.me.color)
