// Spojení se serverem (WebSocket) s automatickým znovupřipojením.
// Když server není dostupný vůbec (např. statický hosting), přepne se do offline režimu,
// kde stejné zprávy obsluhuje LocalServer přímo v prohlížeči.

import {
  applyOp,
  cloneContent,
  createFromLevel,
  createSandbox,
  getLevel,
  resetContentFor,
  sanitizeContent,
} from './room-core.js'
import { getTemplate } from './templates.js'

export class Connection {
  constructor({ onMessage, onStatus, hello }) {
    this.onMessage = onMessage
    this.onStatus = onStatus
    this.hello = hello
    this.status = 'connecting'
    this.everOnline = false
    this.failures = 0
    this.queue = []
    this.local = null
    const params = new URLSearchParams(location.search)
    if (params.has('solo')) this.goSolo()
    else this.open()
  }

  setStatus(s) {
    if (this.status === s) return
    this.status = s
    this.onStatus?.(s)
  }

  open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`)
    } catch {
      return this.retry()
    }
    this.ws = ws
    this.setStatus(this.everOnline ? 'reconnecting' : 'connecting')
    const timeout = setTimeout(() => {
      if (ws.readyState !== 1) ws.close()
    }, 6000)
    ws.onopen = () => {
      clearTimeout(timeout)
      this.everOnline = true
      this.failures = 0
      this.setStatus('online')
      ws.send(JSON.stringify(this.hello()))
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m))
      clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 20000)
    }
    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      this.onMessage(msg)
    }
    ws.onclose = () => {
      clearTimeout(timeout)
      clearInterval(this.pingTimer)
      if (this.ws === ws) this.retry()
    }
    ws.onerror = () => {}
  }

  retry() {
    this.failures++
    if (!this.everOnline && this.failures >= 3) return this.goSolo()
    this.setStatus(this.everOnline ? 'reconnecting' : 'connecting')
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.failures, 5)) + Math.random() * 300
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.open(), delay)
  }

  goSolo() {
    this.local = new LocalServer((msg) => this.onMessage(msg))
    this.setStatus('solo')
    this.local.receive(this.hello())
  }

  get online() {
    return this.status === 'online' || this.status === 'solo'
  }

  send(msg) {
    if (this.local) return this.local.receive(msg)
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg))
    else if (msg.type !== 'cursor' && msg.type !== 'ping' && msg.type !== 'op') this.queue.push(msg)
  }
}

// ---------------------------------------------------------------------------
// Offline „server“ v prohlížeči
// ---------------------------------------------------------------------------

const SOLO_KEY = 'qg-solo-rooms'

class LocalServer {
  constructor(deliver) {
    this.deliver = (m) => setTimeout(() => deliver(m), 0)
    this.me = { id: 'solo', name: 'Ty', color: '#ff0055', role: 'player' }
    this.rooms = {}
    try {
      this.rooms = JSON.parse(localStorage.getItem(SOLO_KEY) || '{}')
    } catch {
      this.rooms = {}
    }
  }

  save() {
    try {
      localStorage.setItem(SOLO_KEY, JSON.stringify(this.rooms))
    } catch {
      /* plné úložiště – nevadí */
    }
  }

  room(id) {
    if (!this.rooms[id]) this.rooms[id] = { id, name: id === 'lab' ? 'Hlavní laboratoř (offline)' : `Stůl ${id}`, content: createSandbox(), version: 0, history: [] }
    return this.rooms[id]
  }

  welcome(id) {
    const r = this.room(id)
    this.current = r
    this.deliver({
      type: 'welcome',
      you: this.me,
      admin: true,
      epoch: 'solo',
      room: { id: r.id, name: r.name, locked: false, version: r.version, content: r.content, canUndo: r.history.length > 0 },
      users: [this.me],
      online: 1,
    })
  }

  receive(msg) {
    switch (msg.type) {
      case 'hello':
        this.me = { ...this.me, name: msg.name || 'Ty', color: msg.color || '#ff0055' }
        this.welcome(msg.room || 'lab')
        break
      case 'join':
        this.welcome(msg.room || 'lab')
        break
      case 'createRoom': {
        const id = `stul-${Math.floor(Math.random() * 900 + 100)}`
        let content = createSandbox()
        try {
          if (msg.kind === 'level') content = createFromLevel(msg.levelId)
          else if (msg.kind === 'template') content = getTemplate(msg.templateId)?.content() ?? content
          else if (msg.kind === 'import') content = sanitizeContent(msg.content)
        } catch {
          /* výchozí sandbox */
        }
        this.rooms[id] = { id, name: msg.name || (content.level ? `Level ${content.level.id}` : `Stůl ${id}`), content, version: 0, history: [] }
        this.save()
        this.deliver({ type: 'roomCreated', id })
        this.welcome(id)
        break
      }
      case 'op':
        this.op(msg)
        break
      case 'emote':
        this.deliver({ type: 'emote', emoji: msg.emoji, by: this.me, room: this.current?.id, x: msg.x, y: msg.y })
        break
      case 'rename':
        this.me = { ...this.me, name: msg.name, color: msg.color || this.me.color }
        this.deliver({ type: 'users', users: [this.me], online: 1 })
        break
      default:
        break
    }
  }

  op(msg) {
    const room = this.current
    if (!room) return
    const raw = msg.op || {}
    let op = raw
    if (raw.t === 'clear') op = { t: 'load', content: resetContentFor(room.content) }
    else if (raw.t === 'template') op = { t: 'load', content: getTemplate(raw.id)?.content() }
    else if (raw.t === 'level') op = getLevel(raw.id) ? { t: 'load', content: createFromLevel(raw.id) } : null
    else if (raw.t === 'undo') {
      const prev = room.history.pop()
      op = prev ? { t: 'load', content: prev, undo: true } : null
    }
    if (!op) return this.deliver({ type: 'reject', seq: msg.seq, error: 'Nelze provést' })
    const before = op.t === 'load' && !op.undo ? cloneContent(room.content) : null
    const res = applyOp(room.content, op)
    if (!res.ok) return this.deliver({ type: 'reject', seq: msg.seq, error: res.error })
    if (before) {
      room.history.push(before)
      if (room.history.length > 12) room.history.shift()
    }
    room.version++
    this.save()
    this.deliver({ type: 'op', op: res.op, kind: raw.t, by: this.me, seq: msg.seq, v: room.version, canUndo: room.history.length > 0 })
  }
}
