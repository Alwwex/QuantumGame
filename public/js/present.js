// Projektor: velký QR kód, živá deska vybraného stolu, aktivita ze všech stolů,
// přehlídka prvků (karty schopností), galerie a řízení pro přednášejícího.

import { simulate, sampleOutcome } from './qt.js'
import { applyOp, key, nextRotation, ELEMENT_META, evaluateGoals, encodeBoard } from './room-core.js'
import { LEVELS } from './levels-data.js'
import { TEMPLATES } from './templates.js'
import { TOOL_GROUPS, iconSvg, elementName, ACCUSATIVE, SVG_DEFS } from './elements.js'
import { BoardView, formatPct } from './board.js'
import { Connection } from './net.js'
import { abilityCard } from './cards.js'
import { h, toast, openModal, closeTopModal, confetti, timeAgo } from './dom.js'

const $ = (s) => document.querySelector(s)
document.getElementById('svg-defs').innerHTML = `<defs>${SVG_DEFS}</defs>`

const params = new URLSearchParams(location.search)
const adminKey = params.get('key') || sessionStorage.getItem('qg-admin-key') || ''
if (params.get('key')) {
  sessionStorage.setItem('qg-admin-key', params.get('key'))
  params.delete('key')
  history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
}

const state = {
  roomId: params.get('room') || 'lab',
  roomName: '',
  locked: false,
  content: null,
  version: 0,
  sim: null,
  goals: null,
  wasWon: false,
  users: [],
  rooms: [],
  online: 0,
  admin: false,
  mode: 'laser',
  time: 0,
  playing: false,
  idleSince: performance.now(),
  autoPhase: null,
  feed: [],
  config: { publicUrl: '', lanUrls: [] },
  qrTarget: 'main',
  view: 'live',
  experiment: null,
}

// ---------------------------------------------------------------------------
// Deska
// ---------------------------------------------------------------------------

const board = new BoardView($('#p-board'), {
  interactive: true,
  maxHeight: () => Math.max(240, innerHeight - $('#p-board').getBoundingClientRect().top - 90),
  onIntent,
})

function onIntent(intent) {
  const c = state.content
  if (!c) return
  const send = (op) => conn.send({ type: 'op', seq: Date.now(), op })
  switch (intent.type) {
    case 'tap': {
      const piece = c.cells[key(intent.x, intent.y)]
      if (!piece) return
      if (piece.lk === 2 || (ELEMENT_META[piece.t]?.rotations ?? 1) === 1) return showCard(piece.t, piece)
      send({ t: 'rotate', x: intent.x, y: intent.y, r: nextRotation(piece.t, piece.r) })
      break
    }
    case 'move':
      send({ t: 'move', x: intent.x, y: intent.y, tx: intent.tx, ty: intent.ty })
      break
    case 'remove':
      send({ t: 'remove', x: intent.x, y: intent.y })
      break
    case 'info': {
      const piece = c.cells[key(intent.x, intent.y)]
      if (piece) showCard(piece.t, piece)
      break
    }
    default:
      break
  }
}

function showCard(t, piece) {
  const card = abilityCard(t, { piece })
  openModal({ title: '', body: card.el, className: 'card-modal', onClose: () => card.destroy() })
}

function recompute(changed = true) {
  if (!state.content) return
  board.setContent(state.content)
  state.sim = simulate(state.content)
  board.setSimulation(state.sim)
  state.goals = evaluateGoals(state.content, state.sim)
  board.setGoalInfo(state.content.level ? state.goals : null)
  if (state.content.level) {
    if (state.goals.won && !state.wasWon) {
      confetti()
      addFeed({ icon: '🏆', text: `Stůl „${state.roomName}“ splnil level ${state.content.level.id}!` })
    }
    state.wasWon = state.goals.won
  }
  if (state.time > state.sim.maxFrameCount - 1) state.time = 0
  if (changed) {
    state.idleSince = performance.now()
    if (state.autoPhase) stopAuto()
    if (state.mode === 'experiment') startExperiment()
  }
  renderResults()
  renderLevel()
}

function renderResults() {
  const host = $('#p-results')
  host.innerHTML = ''
  if (!state.sim) return
  if (state.sim.lasers.length === 0) {
    host.append(h('div', { class: 'p-res muted' }, 'Na desce není laser.'))
    return
  }
  const rows = [...state.sim.total.entries()].filter(([k, v]) => v > 0.0005).sort((a, b) => b[1] - a[1]).slice(0, 6)
  for (const [k, v] of rows) {
    let icon = '🌌'
    let name = 'mimo desku'
    if (k !== '-1,-1') {
      const piece = state.content.cells[k]
      icon = piece ? h('span', { html: iconSvg(piece.t, piece.r || 0, 30) }) : '·'
      name = piece ? elementName(piece.t) : k
    }
    host.append(h('div', { class: 'p-res' }, h('span', { class: 'p-res-icon' }, icon), h('span', { class: 'p-res-name' }, name), h('b', {}, formatPct(v))))
  }
}

function renderLevel() {
  const bar = $('#p-level')
  const c = state.content
  if (!c?.level) {
    bar.classList.add('hidden')
    return
  }
  bar.classList.remove('hidden')
  bar.innerHTML = ''
  const g = state.goals
  bar.append(
    h('div', { class: 'lv-title' }, h('span', { class: 'lv-num' }, `Level ${c.level.id}`), h('b', {}, c.level.name), h('span', { class: 'lv-en' }, c.level.en || '')),
    h(
      'div',
      { class: 'lv-goals' },
      g.goals.map((goal) => h('span', { class: `chip ${goal.met ? 'ok' : ''}` }, `${goal.met ? '✓' : '🎯'} ${formatPct(goal.value)} / ${formatPct(goal.threshold)}`)),
      g.mines.map((m) => h('span', { class: `chip ${m.safe ? 'ok' : 'bad'}` }, m.safe ? '💣 v bezpečí' : `💥 ${formatPct(m.value)}`)),
    ),
    g.won ? h('span', { class: 'chip win' }, '🎉 Splněno!') : null,
  )
}

// --- přehrávání: ručně i automaticky ---

function setMode(mode) {
  state.mode = mode
  if (mode !== 'experiment') state.experiment = null
  board.setExperimentCounts(null, 0)
  board.setMode(mode)
  if (mode === 'laser') {
    state.playing = false
    state.time = 0
  }
  if (mode === 'wave') {
    state.time = 0
    state.playing = true
  }
  if (mode === 'experiment') startExperiment()
  board.setTime(state.time)
  for (const b of document.querySelectorAll('[data-pmode]')) b.classList.toggle('active', b.dataset.pmode === mode)
}

function stopAuto() {
  state.autoPhase = null
  if (state.mode === 'wave') setMode('laser')
}

function startExperiment() {
  state.experiment = { counts: new Map(), shots: 0, rep: 0, shot: null }
  board.setExperimentCounts(state.experiment.counts, 0)
  nextShot()
}

function nextShot() {
  const ex = state.experiment
  if (!ex || !state.sim?.lasers.length) return
  const outcomes = state.sim.lasers.map((l) => sampleOutcome(l))
  const end = Math.max(1, ...outcomes.map((o, i) => (o ? o.frame : state.sim.lasers[i].frames.length - 1)))
  ex.shot = { outcomes, end, time: 0, interval: ex.rep === 0 ? 170 : Math.max(4, 120 / (ex.rep + 1)), fired: new Set() }
}

let last = performance.now()
function loop(now) {
  const dt = Math.min(100, now - last)
  last = now
  const frames = Math.max(1, state.sim?.maxFrameCount || 1)
  if (state.mode === 'wave' && state.playing) {
    state.time = Math.min(frames - 1, state.time + dt / 260)
    board.setTime(state.time)
    if (state.time >= frames - 1) {
      state.playing = false
      if (state.autoPhase === 'wave') {
        state.autoPhase = 'hold'
        state.holdUntil = now + 1800
      }
    }
  } else if (state.mode === 'experiment' && state.experiment?.shot) {
    const ex = state.experiment
    const shot = ex.shot
    shot.time = Math.min(shot.end, shot.time + dt / shot.interval)
    const alive = new Set()
    shot.outcomes.forEach((o, i) => {
      if (o && shot.time >= o.frame) {
        if (!shot.fired.has(i)) {
          shot.fired.add(i)
          const k = `${o.x},${o.y}`
          ex.counts.set(k, (ex.counts.get(k) || 0) + 1)
          board.click(o.x, o.y, state.content.cells[k]?.t === 'Mine' ? 'mine' : 'detector')
        }
      } else alive.add(i)
    })
    board.drawPhotons(board.particlesAt(shot.time, alive))
    if (shot.time >= shot.end) {
      ex.shots++
      ex.rep++
      board.setExperimentCounts(ex.counts, ex.shots)
      if (ex.shots < 3000) nextShot()
    }
  }
  // automatická vlna, když se chvíli nic neděje
  const auto = $('#auto-wave').checked && state.view === 'live'
  if (auto && state.sim?.lasers.length) {
    if (!state.autoPhase && state.mode === 'laser' && now - state.idleSince > 4500) {
      state.autoPhase = 'wave'
      setMode('wave')
    } else if (state.autoPhase === 'hold' && now > state.holdUntil) {
      state.autoPhase = null
      setMode('laser')
      state.idleSince = now
    }
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ---------------------------------------------------------------------------
// Připojení
// ---------------------------------------------------------------------------

const conn = new Connection({
  hello: () => ({ type: 'hello', name: 'Projektor', color: '#ffffff', role: 'presenter', watch: true, admin: adminKey, room: state.roomId }),
  onStatus: (s) => {
    if (s === 'reconnecting') toast('Spojení se serverem vypadlo, připojuji znovu…', 'error')
  },
  onMessage: (msg) => {
    switch (msg.type) {
      case 'welcome':
        state.admin = msg.admin
        state.roomId = msg.room.id
        state.roomName = msg.room.name
        state.locked = msg.room.locked
        state.content = msg.room.content
        state.version = msg.room.version
        state.users = msg.users
        state.online = msg.online
        state.wasWon = false
        board.clearCursors()
        recompute()
        renderRoomHead()
        renderAdmin()
        updateQr()
        break
      case 'op': {
        if (msg.v <= state.version) return
        const res = applyOp(state.content, msg.op)
        if (!res.ok) return conn.send({ type: 'join', room: state.roomId })
        state.version = msg.v
        if (msg.by.role !== 'presenter') {
          const x = msg.op.tx ?? msg.op.x
          const y = msg.op.ty ?? msg.op.y
          if (x != null) board.flash(x, y, msg.by.color, msg.by.name)
        }
        recompute()
        break
      }
      case 'reject':
        toast(msg.error, 'error')
        break
      case 'users':
        state.users = msg.users
        state.online = msg.online
        renderRoomHead()
        break
      case 'rooms':
        state.rooms = msg.rooms
        state.online = msg.online
        renderRoomHead()
        if (state.view === 'rooms') renderRooms()
        break
      case 'activity':
        describeActivity(msg)
        break
      case 'cursor':
        board.setCursor(msg.id, msg)
        break
      case 'emote':
        floatEmote(msg)
        break
      case 'roomMeta':
        state.locked = msg.locked
        state.roomName = msg.name
        renderRoomHead()
        renderAdmin()
        break
      case 'gallery':
        addFeed({ icon: '🖼', who: { name: msg.item.author, color: msg.item.color }, text: `ukládá do galerie „${msg.item.title}“` })
        if (state.view === 'gallery') renderGallery()
        break
      case 'announce':
        toast(`📣 ${msg.text}`, 'success', 6000)
        break
      case 'error':
        toast(msg.message, 'error')
        break
      default:
        break
    }
  },
})

function renderRoomHead() {
  $('#p-room-name').textContent = `${state.locked ? '🔒 ' : ''}${state.roomName}`
  const players = state.users.filter((u) => u.role !== 'presenter').length
  $('#p-room-meta').textContent = `👥 ${players} u stolu`
  $('#p-online').textContent = state.online
  $('#p-room-count').textContent = `(${state.rooms.length})`
}

function describeActivity(msg) {
  const op = msg.op
  const verbs = {
    place: () => `přidává ${ACCUSATIVE[op.e] || 'dílek'}`,
    rotate: () => 'otáčí dílek',
    move: () => 'posouvá dílek',
    remove: () => 'odebírá dílek',
    pol: () => 'mění polarizaci laseru',
    clear: () => 'čistí desku 🧹',
    template: () => 'načítá experiment',
    level: () => 'spouští level',
    undo: () => 'vrací změnu ↶',
    load: () => 'nahrává sestavu',
  }
  const text = (verbs[msg.kind] || (() => 'mění desku'))()
  addFeed({ icon: op.e ? iconSvg(op.e, 0, 22) : '⚡', who: msg.by, text, room: msg.room === state.roomId ? null : msg.roomName })
}

function addFeed(item) {
  // stejné akce téhož člověka za sebou slučujeme (otáčení po sobě atd.)
  const top = state.feed[0]
  if (top && top.who?.name === item.who?.name && top.text === item.text && top.room === item.room && Date.now() - top.at < 5000) {
    top.count = (top.count || 1) + 1
    top.at = Date.now()
  } else {
    state.feed.unshift({ ...item, at: Date.now() })
    state.feed = state.feed.slice(0, 40)
  }
  const host = $('#p-feed')
  host.innerHTML = ''
  for (const it of state.feed.slice(0, 14)) {
    host.append(
      h(
        'li',
        { class: 'feed-item' },
        h('span', { class: 'feed-icon', html: it.icon.startsWith('<') ? it.icon : null }, it.icon.startsWith('<') ? '' : it.icon),
        h(
          'span',
          { class: 'feed-text' },
          it.who ? h('b', { style: { color: it.who.color } }, it.who.name) : null,
          ' ',
          it.text,
          it.count > 1 ? h('em', {}, ` ×${it.count}`) : null,
          it.room ? h('span', { class: 'feed-room' }, ` · ${it.room}`) : null,
        ),
        h('time', {}, timeAgo(it.at)),
      ),
    )
  }
}

function floatEmote(msg) {
  const host = $('#p-emotes')
  const span = h('span', { class: 'p-emote' }, msg.emoji, h('small', { style: { background: msg.by?.color || '#fff' } }, msg.by?.name || ''))
  span.style.left = `${8 + Math.random() * 60}%`
  host.append(span)
  setTimeout(() => span.remove(), 4200)
}

// ---------------------------------------------------------------------------
// QR kód
// ---------------------------------------------------------------------------

async function loadConfig() {
  try {
    state.config = await (await fetch('/api/config')).json()
  } catch {
    /* offline */
  }
  updateQr()
}

function joinUrl() {
  const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname)
  let base = state.config.publicUrl || location.origin
  let warn = ''
  if (!state.config.publicUrl && isLocal) {
    if (state.config.lanUrls?.length) {
      base = state.config.lanUrls[0]
      warn = 'Projektor běží na localhost – QR vede na adresu v místní síti. Pro přístup odkudkoli nastav PUBLIC_URL nebo použij veřejný hosting (viz README).'
    } else warn = 'Projektor běží na localhost – telefony se na tuto adresu nepřipojí.'
  }
  const url = state.qrTarget === 'room' && state.roomId !== 'lab' ? `${base}/?room=${encodeURIComponent(state.roomId)}` : `${base}/`
  return { url, warn }
}

function updateQr() {
  const { url, warn } = joinUrl()
  $('#p-qr').src = `/api/qr.svg?text=${encodeURIComponent(url)}`
  $('#p-url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const w = $('#p-url-warn')
  w.textContent = warn
  w.classList.toggle('hidden', !warn)
}

// ---------------------------------------------------------------------------
// Pohledy
// ---------------------------------------------------------------------------

function setView(view) {
  state.view = view
  for (const t of document.querySelectorAll('.p-tab')) t.classList.toggle('active', t.dataset.view === view)
  for (const v of document.querySelectorAll('.p-view')) v.classList.toggle('active', v.id === `view-${view}`)
  if (view !== 'showcase') stopShowcase()
  if (view === 'rooms') renderRooms()
  if (view === 'showcase') startShowcase()
  if (view === 'gallery') renderGallery()
  if (view === 'admin') renderAdmin()
  if (view === 'live') requestAnimationFrame(() => board.fit())
}

for (const t of document.querySelectorAll('.p-tab')) t.addEventListener('click', () => setView(t.dataset.view))
for (const b of document.querySelectorAll('[data-pmode]')) {
  b.addEventListener('click', () => {
    state.autoPhase = null
    state.idleSince = performance.now() + 20000 // ruční volba – automatika chvíli počká
    setMode(b.dataset.pmode)
  })
}

// --- stoly ---

const thumbs = new Map()
function renderRooms() {
  const host = $('#p-rooms')
  const seen = new Set()
  for (const r of state.rooms) {
    seen.add(r.id)
    let t = thumbs.get(r.id)
    if (!t) {
      const boardHost = h('div', { class: 'thumb-board' })
      const name = h('div', { class: 'thumb-name' })
      const meta = h('div', { class: 'thumb-meta' })
      const card = h('button', { class: 'thumb', onClick: () => spotlight(r.id) }, boardHost, name, meta)
      host.append(card)
      const tb = new BoardView(boardHost, { mini: true, labels: true })
      t = { card, tb, name, meta, version: -1 }
      thumbs.set(r.id, t)
    }
    t.card.classList.toggle('current', r.id === state.roomId)
    t.name.textContent = `${r.locked ? '🔒 ' : ''}${r.name}`
    t.meta.textContent = `👥 ${r.users} · ${r.pieces} dílků${r.level ? ` · 🏆 level ${r.level.id}` : ''}`
    if (r.content && t.version !== r.version) {
      t.version = r.version
      t.tb.setContent(r.content)
      t.tb.setSimulation(simulate(r.content))
    }
  }
  for (const [id, t] of thumbs) {
    if (!seen.has(id)) {
      t.tb.destroy()
      t.card.remove()
      thumbs.delete(id)
    }
  }
  // pořadí podle serveru
  for (const r of state.rooms) host.append(thumbs.get(r.id).card)
}

function spotlight(id) {
  state.roomId = id
  state.autoPhase = null
  setMode('laser')
  conn.send({ type: 'join', room: id })
  setView('live')
  updateQr()
}

// --- přehlídka prvků ---

const SHOW_ORDER = TOOL_GROUPS.flatMap((g) => g.items).filter((t) => t !== 'Wall' && t !== 'CoatedBeamSplitter')
let scIndex = 0
let scCard = null
let scTimer = null

function renderShowcase() {
  scCard?.destroy()
  const host = $('#sc-card')
  host.innerHTML = ''
  const t = SHOW_ORDER[scIndex]
  scCard = abilityCard(t, {})
  scCard.el.classList.add('showcase')
  host.append(scCard.el)
  const dots = $('#sc-dots')
  dots.innerHTML = ''
  SHOW_ORDER.forEach((tt, i) =>
    dots.append(
      h('button', {
        class: `sc-dot ${i === scIndex ? 'active' : ''}`,
        title: elementName(tt),
        html: iconSvg(tt, 0, 30),
        onClick: () => {
          scIndex = i
          renderShowcase()
          restartShowTimer()
        },
      }),
    ),
  )
}

function restartShowTimer() {
  clearInterval(scTimer)
  if ($('#sc-auto').checked) {
    scTimer = setInterval(() => {
      scIndex = (scIndex + 1) % SHOW_ORDER.length
      renderShowcase()
    }, 15000)
  }
}

function startShowcase() {
  renderShowcase()
  restartShowTimer()
}

function stopShowcase() {
  clearInterval(scTimer)
  scCard?.destroy()
  scCard = null
}

$('#sc-prev').addEventListener('click', () => {
  scIndex = (scIndex - 1 + SHOW_ORDER.length) % SHOW_ORDER.length
  renderShowcase()
  restartShowTimer()
})
$('#sc-next').addEventListener('click', () => {
  scIndex = (scIndex + 1) % SHOW_ORDER.length
  renderShowcase()
  restartShowTimer()
})
$('#sc-auto').addEventListener('change', restartShowTimer)

// --- galerie ---

const galleryBoards = []
async function renderGallery() {
  for (const b of galleryBoards.splice(0)) b.destroy()
  const host = $('#p-gallery')
  host.innerHTML = ''
  let items = []
  try {
    items = (await (await fetch('/api/gallery')).json()).items
  } catch {
    host.append(h('p', { class: 'muted' }, 'Galerii se nepodařilo načíst.'))
    return
  }
  if (!items.length) host.append(h('p', { class: 'muted' }, 'Zatím prázdno – buď první! (Sdílet → Uložit do galerie)'))
  for (const it of items) {
    const boardHost = h('div', { class: 'thumb-board' })
    host.append(
      h(
        'div',
        { class: 'thumb gallery-item' },
        boardHost,
        h('div', { class: 'thumb-name' }, it.title),
        h('div', { class: 'thumb-meta' }, h('b', { style: { color: it.color } }, it.author), ` · ${timeAgo(it.createdAt)}`),
        it.note ? h('div', { class: 'thumb-note' }, it.note) : null,
        h(
          'div',
          { class: 'thumb-actions' },
          state.admin ? h('button', { class: 'btn tiny primary', onClick: () => loadIntoSpotlight({ t: 'load', content: it.content }) }, 'Na plátno') : null,
          h('a', { class: 'btn tiny', href: `/#b=${encodeBoard(it.content)}`, target: '_blank' }, 'Otevřít ↗'),
        ),
      ),
    )
    const tb = new BoardView(boardHost, { mini: true })
    tb.setContent(it.content)
    tb.setSimulation(simulate(it.content))
    galleryBoards.push(tb)
  }
}

function loadIntoSpotlight(op) {
  conn.send({ type: 'op', seq: Date.now(), op })
  setView('live')
}

// --- řízení ---

function renderAdmin() {
  const host = $('#admin-body')
  host.innerHTML = ''
  $('#admin-tab').classList.toggle('dim', !state.admin)
  if (!state.admin) {
    host.append(
      h(
        'div',
        { class: 'admin-card' },
        h('h3', {}, '🔑 Řízení je zamčené'),
        h('p', {}, 'Otevři projektor s klíčem z konzole serveru: ', h('code', {}, '/present?key=TVŮJ_KLÍČ'), '. Klíč nastavíš proměnnou prostředí ADMIN_KEY.'),
      ),
    )
    return
  }
  const announce = h('input', { class: 'input', maxlength: 200, placeholder: 'Zpráva pro všechny, např. „Za 2 minuty končíme – uložte si výtvory do galerie!“' })
  const tplSel = h('select', { class: 'input' }, TEMPLATES.map((t) => h('option', { value: t.id }, `${t.icon} ${t.name}`)))
  const lvlSel = h('select', { class: 'input' }, LEVELS.map((l) => h('option', { value: l.id }, `${l.id}. ${l.name}`)))
  const rename = h('input', { class: 'input', maxlength: 40, value: state.roomName })
  const send = (op) => conn.send({ type: 'op', seq: Date.now(), op })
  host.append(
    h(
      'div',
      { class: 'admin-grid' },
      h(
        'div',
        { class: 'admin-card' },
        h('h3', {}, '📣 Oznámení všem'),
        announce,
        h('button', { class: 'btn primary', onClick: () => announce.value.trim() && (conn.send({ type: 'admin', action: 'announce', text: announce.value }), toast('Odesláno'), (announce.value = '')) }, 'Poslat'),
      ),
      h(
        'div',
        { class: 'admin-card' },
        h('h3', {}, `🎯 Stůl na plátně: ${state.roomName}`),
        h(
          'div',
          { class: 'row-btns' },
          h('button', { class: 'btn', onClick: () => conn.send({ type: 'admin', action: state.locked ? 'unlock' : 'lock', room: state.roomId }) }, state.locked ? '🔓 Odemknout' : '🔒 Zamknout (jen čtení)'),
          h('button', { class: 'btn', onClick: () => confirm('Vyčistit desku na plátně?') && send({ t: 'clear' }) }, '🧹 Vyčistit'),
          h('button', { class: 'btn', onClick: () => send({ t: 'undo' }) }, '↶ Vrátit'),
        ),
        h('label', {}, 'Přejmenovat'),
        h('div', { class: 'row-btns' }, rename, h('button', { class: 'btn small', onClick: () => conn.send({ type: 'admin', action: 'rename', room: state.roomId, name: rename.value }) }, 'Uložit')),
      ),
      h(
        'div',
        { class: 'admin-card' },
        h('h3', {}, '🌈 Načíst experiment na plátno'),
        tplSel,
        h('button', { class: 'btn primary', onClick: () => loadIntoSpotlight({ t: 'template', id: tplSel.value }) }, 'Načíst'),
        h('h3', {}, '🏆 Načíst level na plátno'),
        lvlSel,
        h('button', { class: 'btn primary', onClick: () => loadIntoSpotlight({ t: 'level', id: Number(lvlSel.value) }) }, 'Načíst'),
      ),
      h(
        'div',
        { class: 'admin-card' },
        h('h3', {}, '📱 Kam vede QR kód'),
        h(
          'div',
          { class: 'row-btns' },
          h('button', { class: `btn ${state.qrTarget === 'main' ? 'active' : ''}`, onClick: () => ((state.qrTarget = 'main'), updateQr(), renderAdmin()) }, 'Hlavní laboratoř'),
          h('button', { class: `btn ${state.qrTarget === 'room' ? 'active' : ''}`, onClick: () => ((state.qrTarget = 'room'), updateQr(), renderAdmin()) }, 'Stůl na plátně'),
        ),
        h('p', { class: 'muted' }, 'Tip: na začátku nech QR na hlavní laboratoři, ať jsou všichni spolu. Pak můžeš lidi rozdělit ke stolům.'),
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Klávesy a start
// ---------------------------------------------------------------------------

$('#fs-btn').addEventListener('click', toggleFullscreen)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
}

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return
  if (e.key === 'Escape') return closeTopModal()
  if (e.key === 'f' || e.key === 'F') toggleFullscreen()
  const views = ['live', 'rooms', 'showcase', 'gallery', 'admin']
  if (/^[1-5]$/.test(e.key)) setView(views[Number(e.key) - 1])
  if (state.view === 'showcase' && e.key === 'ArrowRight') $('#sc-next').click()
  if (state.view === 'showcase' && e.key === 'ArrowLeft') $('#sc-prev').click()
  if (state.view === 'live' && e.key === ' ') {
    e.preventDefault()
    state.autoPhase = null
    state.idleSince = performance.now() + 20000
    setMode(state.mode === 'wave' ? 'laser' : 'wave')
  }
})
window.addEventListener('resize', () => board.fit())

loadConfig()
renderAdmin()
