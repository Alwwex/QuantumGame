// Kvantová hra LIVE – realtime server.
// Servíruje statické soubory, drží sdílené místnosti a přes WebSocket je synchronizuje
// mezi všemi připojenými lidmi. Stav se průběžně ukládá do data/rooms.json.

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import QRCode from 'qrcode'
import {
  applyOp,
  cloneContent,
  createFromLevel,
  createSandbox,
  getLevel,
  resetContentFor,
  sanitizeContent,
} from '../public/js/room-core.js'
import { getTemplate } from '../public/js/templates.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(3).toString('hex')
const BOOT_EPOCH = crypto.randomBytes(6).toString('hex')

const MAX_ROOMS = 300
const MAX_GALLERY = 400
const HISTORY_LIMIT = 12
const MAIN_ROOM = 'lab'
const EMOTES = ['👏', '🤯', '❤️', '😂', '🔥', '🎉', '🤔', '⚛️', '😮', '👀']
const COLORS = /^#[0-9a-f]{6}$/i

// ---------------------------------------------------------------------------
// Stav
// ---------------------------------------------------------------------------

/** @type {Map<string, any>} */
const rooms = new Map()
let gallery = []
const clients = new Set()
const watchers = new Set()

function now() {
  return Date.now()
}

function cleanText(s, max, fallback = '') {
  const v = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max)
  return v || fallback
}

function makeRoom(id, name, content, opts = {}) {
  return {
    id,
    name,
    content,
    version: opts.version ?? 0,
    locked: !!opts.locked,
    createdAt: opts.createdAt ?? now(),
    updatedAt: opts.updatedAt ?? now(),
    history: opts.history ?? [],
    // místnost vytvořená po startu serveru (ne načtená z disku) si nechá obnovit stav od klientů
    restorable: !!opts.restorable,
    clients: new Set(),
  }
}

function ensureMainRoom() {
  if (!rooms.has(MAIN_ROOM)) {
    rooms.set(MAIN_ROOM, makeRoom(MAIN_ROOM, 'Hlavní laboratoř', createSandbox(13, 10), { restorable: true }))
  }
}

const ROOM_WORDS = ['foton', 'kvark', 'spin', 'qubit', 'laser', 'vlna', 'faze', 'boson', 'gluon', 'mion', 'neutrino', 'kvantum']
function newRoomId() {
  for (let i = 0; i < 50; i++) {
    const id = `${ROOM_WORDS[crypto.randomInt(ROOM_WORDS.length)]}-${crypto.randomInt(100, 1000)}`
    if (!rooms.has(id)) return id
  }
  return crypto.randomBytes(4).toString('hex')
}

const validRoomId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(id)

function getOrCreateRoom(id) {
  if (rooms.has(id)) return rooms.get(id)
  if (rooms.size >= MAX_ROOMS) pruneRooms(true)
  if (rooms.size >= MAX_ROOMS) return null
  const room = makeRoom(id, `Stůl ${id}`, createSandbox(13, 10), { restorable: true })
  rooms.set(id, room)
  scheduleSave()
  return room
}

function pruneRooms(force = false) {
  const limit = force ? 30 * 60 * 1000 : 3 * 24 * 3600 * 1000
  for (const room of rooms.values()) {
    if (room.id === MAIN_ROOM || room.clients.size > 0) continue
    if (now() - room.updatedAt > limit) rooms.delete(room.id)
  }
}

// ---------------------------------------------------------------------------
// Ukládání na disk
// ---------------------------------------------------------------------------

const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json')
const GALLERY_FILE = path.join(DATA_DIR, 'gallery.json')
let saveTimer = null

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'))
    for (const r of data.rooms || []) {
      if (!validRoomId(r.id)) continue
      try {
        const content = sanitizeContent(r.content)
        rooms.set(
          r.id,
          makeRoom(r.id, cleanText(r.name, 40, r.id), content, {
            version: r.version,
            locked: r.locked,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            history: (r.history || []).slice(-HISTORY_LIMIT),
          }),
        )
      } catch {
        /* poškozená místnost – přeskočit */
      }
    }
    console.log(`Načteno ${rooms.size} místností z ${ROOMS_FILE}`)
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('Nepodařilo se načíst místnosti:', e.message)
  }
  try {
    gallery = JSON.parse(fs.readFileSync(GALLERY_FILE, 'utf8'))
    if (!Array.isArray(gallery)) gallery = []
  } catch {
    gallery = []
  }
  ensureMainRoom()
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNow().catch((e) => console.warn('Ukládání selhalo:', e.message))
  }, 1500)
}

async function writeAtomic(file, data) {
  await fsp.mkdir(DATA_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, data)
  await fsp.rename(tmp, file)
}

async function saveNow() {
  const data = {
    savedAt: new Date().toISOString(),
    rooms: [...rooms.values()].map((r) => ({
      id: r.id,
      name: r.name,
      content: r.content,
      version: r.version,
      locked: r.locked,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      history: r.history,
    })),
  }
  await writeAtomic(ROOMS_FILE, JSON.stringify(data))
  await writeAtomic(GALLERY_FILE, JSON.stringify(gallery))
}

function saveSync() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const data = {
      savedAt: new Date().toISOString(),
      rooms: [...rooms.values()].map(({ clients: _c, restorable: _r, ...rest }) => rest),
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(data))
    fs.writeFileSync(GALLERY_FILE, JSON.stringify(gallery))
  } catch (e) {
    console.warn('Ukládání při ukončení selhalo:', e.message)
  }
}

// ---------------------------------------------------------------------------
// Pomocné funkce pro zprávy
// ---------------------------------------------------------------------------

function send(client, msg) {
  if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, except = null) {
  const data = JSON.stringify(msg)
  for (const c of room.clients) {
    if (c !== except && c.ws.readyState === 1) c.ws.send(data)
  }
}

function broadcastAll(msg) {
  const data = JSON.stringify(msg)
  for (const c of clients) if (c.ws.readyState === 1) c.ws.send(data)
}

function toWatchers(msg, exceptRoom = null) {
  const data = JSON.stringify(msg)
  for (const c of watchers) if (c.ws.readyState === 1 && (!exceptRoom || c.room !== exceptRoom)) c.ws.send(data)
}

const publicUser = (c) => ({ id: c.id, name: c.name, color: c.color, role: c.role })

function roomUsers(room) {
  return [...room.clients].map(publicUser)
}

function roomInfo(room, withContent = false) {
  const info = {
    id: room.id,
    name: room.name,
    locked: room.locked,
    version: room.version,
    users: [...room.clients].filter((c) => c.role !== 'presenter').length,
    pieces: Object.keys(room.content.cells).length,
    level: room.content.level ? { id: room.content.level.id, name: room.content.level.name } : null,
    updatedAt: room.updatedAt,
  }
  if (withContent) info.content = room.content
  return info
}

function roomsList(withContent = false) {
  return [...rooms.values()]
    .sort((a, b) => (a.id === MAIN_ROOM ? -1 : b.id === MAIN_ROOM ? 1 : b.clients.size - a.clients.size || b.updatedAt - a.updatedAt))
    .map((r) => roomInfo(r, withContent))
}

function onlineCount() {
  let n = 0
  for (const c of clients) if (c.role !== 'presenter') n++
  return n
}

// shrnutí místností pro projektor (max. 4× za sekundu)
let watchersTimer = null
function notifyWatchers() {
  if (watchersTimer || watchers.size === 0) return
  watchersTimer = setTimeout(() => {
    watchersTimer = null
    toWatchers({ type: 'rooms', rooms: roomsList(true), online: onlineCount() })
  }, 250)
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

function takeToken(bucket, capacity, perSecond) {
  const t = now()
  bucket.tokens = Math.min(capacity, (bucket.tokens ?? capacity) + ((t - (bucket.last ?? t)) / 1000) * perSecond)
  bucket.last = t
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

const ipBuckets = new Map()
function ipAllowed(ip, kind, capacity, perSecond) {
  const k = `${kind}|${ip}`
  if (!ipBuckets.has(k)) ipBuckets.set(k, {})
  return takeToken(ipBuckets.get(k), capacity, perSecond)
}
setInterval(() => {
  if (ipBuckets.size > 5000) ipBuckets.clear()
  pruneRooms(false)
}, 10 * 60 * 1000).unref()

// ---------------------------------------------------------------------------
// Místnosti: připojení a operace
// ---------------------------------------------------------------------------

function joinRoom(client, roomId, known) {
  leaveRoom(client)
  const id = validRoomId(roomId) ? roomId : MAIN_ROOM
  const room = getOrCreateRoom(id) || rooms.get(MAIN_ROOM)
  client.room = room
  room.clients.add(client)

  // Server se restartoval a přišel o stav? Obnovíme ho od prvního klienta, který ho zná.
  if (room.restorable && room.version === 0 && known && known.room === room.id && known.epoch !== BOOT_EPOCH && known.version > 0) {
    try {
      room.content = sanitizeContent(known.content)
      room.version = Math.min(Number(known.version) || 1, 1e9)
      room.updatedAt = now()
      console.log(`Místnost ${room.id} obnovena od klienta (verze ${room.version})`)
      scheduleSave()
    } catch {
      /* ignorovat neplatný stav */
    }
  }
  room.restorable = false

  send(client, {
    type: 'welcome',
    you: publicUser(client),
    admin: client.isAdmin,
    epoch: BOOT_EPOCH,
    room: {
      id: room.id,
      name: room.name,
      locked: room.locked,
      version: room.version,
      content: room.content,
      canUndo: room.history.length > 0,
    },
    users: roomUsers(room),
    online: onlineCount(),
  })
  broadcast(room, { type: 'users', users: roomUsers(room), online: onlineCount() }, client)
  notifyWatchers()
}

function leaveRoom(client) {
  const room = client.room
  if (!room) return
  room.clients.delete(client)
  client.room = null
  broadcast(room, { type: 'cursor', id: client.id, hide: true })
  broadcast(room, { type: 'users', users: roomUsers(room), online: onlineCount() })
  notifyWatchers()
}


function handleOp(client, msg) {
  const room = client.room
  if (!room) return
  const seq = msg.seq
  const reject = (error) => send(client, { type: 'reject', seq, error })
  if (room.locked && !client.isAdmin) return reject('Místnost je zamčená přednášejícím 🔒')
  if (!takeToken(client.opBucket, 30, 12)) return reject('Zpomal trochu 🙂')

  const raw = msg.op || {}
  let op = raw
  // vyšší operace převedeme na „load“ celé desky
  if (raw.t === 'clear') {
    op = { t: 'load', content: resetContentFor(room.content) }
  } else if (raw.t === 'template') {
    const tpl = getTemplate(raw.id)
    if (!tpl) return reject('Neznámý experiment')
    op = { t: 'load', content: tpl.content() }
  } else if (raw.t === 'level') {
    if (!getLevel(raw.id)) return reject('Neznámý level')
    op = { t: 'load', content: createFromLevel(raw.id) }
  } else if (raw.t === 'undo') {
    const prev = room.history.pop()
    if (!prev) return reject('Není co vrátit')
    op = { t: 'load', content: prev, undo: true }
  }

  const before = op.t === 'load' && !op.undo ? cloneContent(room.content) : null
  const result = applyOp(room.content, op)
  if (!result.ok) return reject(result.error)
  if (before) {
    room.history.push(before)
    if (room.history.length > HISTORY_LIMIT) room.history.shift()
  }
  room.version += 1
  room.updatedAt = now()
  const out = {
    type: 'op',
    op: result.op,
    kind: raw.t,
    by: publicUser(client),
    seq,
    v: room.version,
    canUndo: room.history.length > 0,
  }
  broadcast(room, out)
  toWatchers({ type: 'activity', room: room.id, roomName: room.name, op: raw.t === 'load' ? { t: 'load' } : result.op, kind: raw.t, by: publicUser(client), v: room.version })
  notifyWatchers()
  scheduleSave()
}

function handleAdmin(client, msg) {
  if (!client.isAdmin) return send(client, { type: 'error', message: 'Chybí administrátorský klíč' })
  const room = rooms.get(msg.room) || client.room
  switch (msg.action) {
    case 'lock':
    case 'unlock':
      if (!room) return
      room.locked = msg.action === 'lock'
      broadcast(room, { type: 'roomMeta', locked: room.locked, name: room.name })
      break
    case 'rename':
      if (!room) return
      room.name = cleanText(msg.name, 40, room.name)
      broadcast(room, { type: 'roomMeta', locked: room.locked, name: room.name })
      break
    case 'announce':
      broadcastAll({ type: 'announce', text: cleanText(msg.text, 200), from: client.name })
      break
    case 'delete':
      if (!room || room.id === MAIN_ROOM) return
      for (const c of [...room.clients]) joinRoom(c, MAIN_ROOM)
      rooms.delete(room.id)
      break
    default:
      return
  }
  scheduleSave()
  notifyWatchers()
}

function handleCreateRoom(client, msg) {
  if (!ipAllowed(client.ip, 'room', 20, 0.2)) return send(client, { type: 'error', message: 'Moc nových místností najednou, chvíli počkej.' })
  let content
  try {
    if (msg.kind === 'level') content = createFromLevel(msg.levelId)
    else if (msg.kind === 'template') content = getTemplate(msg.templateId)?.content() ?? createSandbox()
    else if (msg.kind === 'import') content = sanitizeContent(msg.content)
    else content = createSandbox(13, 10)
  } catch (e) {
    return send(client, { type: 'error', message: e.message })
  }
  if (rooms.size >= MAX_ROOMS) pruneRooms(true)
  if (rooms.size >= MAX_ROOMS) return send(client, { type: 'error', message: 'Server je plný místností.' })
  const id = newRoomId()
  const fallbackName = content.level ? `Level ${content.level.id}: ${content.level.name}` : `Stůl ${id}`
  const room = makeRoom(id, cleanText(msg.name, 40, fallbackName), content)
  rooms.set(id, room)
  scheduleSave()
  send(client, { type: 'roomCreated', id })
  joinRoom(client, id)
}

function handleMessage(client, data) {
  let msg
  try {
    msg = JSON.parse(data)
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object') return

  if (!client.helloed && msg.type !== 'hello') return
  switch (msg.type) {
    case 'hello': {
      if (client.helloed) return
      client.helloed = true
      client.name = cleanText(msg.name, 24, 'Anonym')
      client.color = COLORS.test(msg.color) ? msg.color : '#ff0055'
      client.role = msg.role === 'presenter' ? 'presenter' : 'player'
      client.isAdmin = typeof msg.admin === 'string' && msg.admin.length > 0 && safeEqual(msg.admin, ADMIN_KEY)
      if (msg.watch) watchers.add(client)
      joinRoom(client, msg.room, msg.known)
      if (msg.watch) send(client, { type: 'rooms', rooms: roomsList(true), online: onlineCount() })
      break
    }
    case 'join':
      joinRoom(client, msg.room, msg.known)
      break
    case 'op':
      handleOp(client, msg)
      break
    case 'cursor': {
      if (!client.room || client.role === 'presenter') return
      const t = now()
      if (t - client.lastCursor < 40) return
      client.lastCursor = t
      const x = Number(msg.x)
      const y = Number(msg.y)
      const out = { type: 'cursor', id: client.id, name: client.name, color: client.color }
      if (msg.hide || !Number.isFinite(x) || !Number.isFinite(y)) out.hide = true
      else {
        out.x = Math.round(x * 100) / 100
        out.y = Math.round(y * 100) / 100
        if (typeof msg.drag === 'string' && /^[A-Za-z]{1,30}$/.test(msg.drag)) out.drag = msg.drag
      }
      broadcast(client.room, out, client)
      break
    }
    case 'emote': {
      if (!client.room || !EMOTES.includes(msg.emoji)) return
      if (!takeToken(client.emoteBucket, 5, 2)) return
      const out = {
        type: 'emote',
        emoji: msg.emoji,
        by: publicUser(client),
        room: client.room.id,
        x: Number.isFinite(msg.x) ? msg.x : null,
        y: Number.isFinite(msg.y) ? msg.y : null,
      }
      broadcast(client.room, out)
      toWatchers(out, client.room)
      break
    }
    case 'rename': {
      client.name = cleanText(msg.name, 24, client.name)
      if (COLORS.test(msg.color)) client.color = msg.color
      if (client.room) broadcast(client.room, { type: 'users', users: roomUsers(client.room), online: onlineCount() })
      break
    }
    case 'createRoom':
      handleCreateRoom(client, msg)
      break
    case 'admin':
      handleAdmin(client, msg)
      break
    case 'ping':
      send(client, { type: 'pong', t: msg.t, online: onlineCount() })
      break
    default:
      break
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

function lanUrls() {
  const urls = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${PORT}`)
    }
  }
  return urls
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || '?'
}

const qrCache = new Map()

async function handleHttp(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname

  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('ok')
  }
  if (p === '/api/config') {
    return sendJson(res, 200, { publicUrl: PUBLIC_URL, lanUrls: lanUrls(), online: onlineCount(), mainRoom: MAIN_ROOM })
  }
  if (p === '/api/rooms') {
    return sendJson(res, 200, { rooms: roomsList(false), online: onlineCount() })
  }
  if (p === '/api/qr.svg') {
    const text = String(url.searchParams.get('text') || PUBLIC_URL || '').slice(0, 500)
    if (!text) return sendJson(res, 400, { error: 'Chybí text' })
    let svg = qrCache.get(text)
    if (!svg) {
      svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1a0033', light: '#ffffff' } })
      if (qrCache.size > 200) qrCache.clear()
      qrCache.set(text, svg)
    }
    res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'public, max-age=3600' })
    return res.end(svg)
  }
  if (p === '/api/gallery' && req.method === 'GET') {
    return sendJson(res, 200, { items: gallery.slice().reverse() })
  }
  if (p === '/api/gallery' && req.method === 'POST') {
    if (!ipAllowed(clientIp(req), 'gallery', 10, 0.1)) return sendJson(res, 429, { error: 'Moc příspěvků, chvíli počkej.' })
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (body.length > 64 * 1024) return sendJson(res, 413, { error: 'Příliš velké' })
    }
    try {
      const data = JSON.parse(body)
      const content = sanitizeContent(data.content)
      content.tools = null
      const item = {
        id: crypto.randomBytes(4).toString('hex'),
        title: cleanText(data.title, 60, 'Bez názvu'),
        author: cleanText(data.author, 24, 'Anonym'),
        color: COLORS.test(data.color) ? data.color : '#ff0055',
        note: cleanText(data.note, 200),
        content,
        createdAt: now(),
      }
      gallery.push(item)
      if (gallery.length > MAX_GALLERY) gallery.shift()
      scheduleSave()
      toWatchers({ type: 'gallery', item })
      return sendJson(res, 200, { ok: true, item })
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'Neplatná data' })
    }
  }

  // statické soubory
  let file = p
  if (file === '/' || file === '/index.html') file = '/index.html'
  else if (file === '/present' || file === '/projektor') file = '/present.html'
  else if (file === '/galerie' || file === '/gallery') file = '/gallery.html'
  const full = path.normalize(path.join(PUBLIC_DIR, file))
  if (!full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403)
    return res.end()
  }
  try {
    const stat = await fsp.stat(full)
    if (!stat.isFile()) throw new Error('not file')
    const ext = path.extname(full)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': stat.size,
    })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(full).pipe(res)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Nenalezeno')
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

loadState()

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((e) => {
    console.error(e)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })
let nextClientId = 1

wss.on('connection', (ws, req) => {
  const client = {
    ws,
    id: `u${(nextClientId++).toString(36)}${crypto.randomBytes(2).toString('hex')}`,
    name: 'Anonym',
    color: '#ff0055',
    role: 'player',
    ip: clientIp(req),
    room: null,
    helloed: false,
    isAdmin: false,
    opBucket: {},
    emoteBucket: {},
    lastCursor: 0,
    alive: true,
  }
  clients.add(client)
  ws.on('message', (data) => handleMessage(client, data.toString()))
  ws.on('pong', () => (client.alive = true))
  ws.on('close', () => {
    clients.delete(client)
    watchers.delete(client)
    leaveRoom(client)
  })
  ws.on('error', () => {})
})

// odpojené klienty (zavřený notebook, ztráta Wi-Fi) uklidíme
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate()
      continue
    }
    c.alive = false
    try {
      c.ws.ping()
    } catch {
      /* ignore */
    }
  }
}, 30000).unref()

server.listen(PORT, HOST, () => {
  const base = PUBLIC_URL || `http://localhost:${PORT}`
  console.log('')
  console.log('  ⚛️  Kvantová hra LIVE běží!')
  console.log(`  Hráči:        ${base}/`)
  console.log(`  Projektor:    ${base}/present?key=${ADMIN_KEY}`)
  for (const u of lanUrls()) console.log(`  V místní síti: ${u}/`)
  if (!process.env.ADMIN_KEY) console.log('  (Administrátorský klíč je náhodný – nastav ADMIN_KEY, ať je stálý.)')
  console.log('')
})

function shutdown() {
  saveSync()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
