// Integrační test serveru: dva klienti přes WebSocket, synchronizace, odmítnutí,
// zámek, obnova stavu po restartu (např. uspání na free hostingu) a HTTP API.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function startServer(dataDir) {
  const proc = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, ADMIN_KEY: 'tajne', PUBLIC_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const port = await new Promise((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error(`server nenastartoval: ${out}`)), 8000)
    proc.stdout.on('data', (d) => {
      out += d
      const m = /localhost:(\d+)\//.exec(out)
      if (m) {
        clearTimeout(timer)
        resolve(Number(m[1]))
      }
    })
    proc.stderr.on('data', (d) => (out += d))
  })
  return { proc, port, url: `http://127.0.0.1:${port}` }
}

function stop(proc, signal = 'SIGTERM') {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve()
    proc.once('exit', resolve)
    proc.kill(signal)
  })
}

class Client {
  constructor(port, hello) {
    this.msgs = []
    this.waiters = []
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    this.ready = new Promise((resolve) => this.ws.on('open', resolve)).then(() => this.send({ type: 'hello', ...hello }))
    this.ws.on('message', (d) => {
      const msg = JSON.parse(d)
      this.msgs.push(msg)
      this.waiters = this.waiters.filter((w) => !(w.pred(msg) && (w.resolve(msg), true)))
    })
  }
  send(m) {
    this.ws.send(JSON.stringify(m))
  }
  next(pred, timeout = 3000) {
    const found = this.msgs.find((m) => pred(m) && !m._seen)
    if (found) {
      found._seen = true
      return Promise.resolve(found)
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), timeout)
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(t)
          m._seen = true
          resolve(m)
        },
      })
    })
  }
  close() {
    this.ws.close()
  }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qg-test-'))

test('dva hráči vidí změny toho druhého', async () => {
  const srv = await startServer(tmp())
  try {
    const a = new Client(srv.port, { name: 'Alice', color: '#00ff88', room: 'lab' })
    const b = new Client(srv.port, { name: 'Bob', color: '#ff0055', room: 'lab' })
    await Promise.all([a.ready, b.ready])
    const wa = await a.next((m) => m.type === 'welcome')
    await b.next((m) => m.type === 'welcome')
    assert.equal(wa.room.content.cells['1,3'].t, 'Laser')

    a.send({ type: 'op', seq: 1, op: { t: 'place', x: 5, y: 3, e: 'BeamSplitter', r: 45 } })
    const opB = await b.next((m) => m.type === 'op')
    assert.equal(opB.op.e, 'BeamSplitter')
    assert.equal(opB.by.name, 'Alice')
    const opA = await a.next((m) => m.type === 'op')
    assert.equal(opA.seq, 1)

    // obsazené pole → odmítnutí jen autorovi
    b.send({ type: 'op', seq: 7, op: { t: 'place', x: 5, y: 3, e: 'Rock' } })
    const rej = await b.next((m) => m.type === 'reject')
    assert.equal(rej.seq, 7)

    // načtení experimentu a vrácení zpět
    b.send({ type: 'op', seq: 8, op: { t: 'template', id: 'mzi' } })
    const load = await a.next((m) => m.type === 'op' && m.kind === 'template')
    assert.equal(Object.keys(load.op.content.cells).length, 7)
    assert.equal(load.canUndo, true)
    b.send({ type: 'op', seq: 9, op: { t: 'undo' } })
    const undo = await a.next((m) => m.type === 'op' && m.kind === 'undo')
    assert.equal(undo.op.content.cells['5,3'].t, 'BeamSplitter')

    // kurzory chodí v dávkách
    b.send({ type: 'cursor', x: 2.5, y: 3.5, drag: 'Mirror' })
    const cur = await a.next((m) => m.type === 'cursors')
    assert.equal(cur.list[0].name, 'Bob')
    assert.equal(cur.list[0].drag, 'Mirror')

    // emoji jen z povoleného seznamu
    a.send({ type: 'emote', emoji: '👏' })
    assert.equal((await b.next((m) => m.type === 'emote')).emoji, '👏')
    a.close()
    b.close()
  } finally {
    await stop(srv.proc)
  }
})

test('zámek místnosti a oznámení vyžadují klíč přednášejícího', async () => {
  const srv = await startServer(tmp())
  try {
    const admin = new Client(srv.port, { name: 'Projektor', role: 'presenter', admin: 'tajne', watch: true, room: 'lab' })
    const fake = new Client(srv.port, { name: 'Hacker', admin: 'spatne', room: 'lab' })
    await Promise.all([admin.ready, fake.ready])
    assert.equal((await admin.next((m) => m.type === 'welcome')).admin, true)
    assert.equal((await fake.next((m) => m.type === 'welcome')).admin, false)

    fake.send({ type: 'admin', action: 'lock' })
    await fake.next((m) => m.type === 'error')

    admin.send({ type: 'admin', action: 'lock', room: 'lab' })
    await fake.next((m) => m.type === 'roomMeta' && m.locked)
    fake.send({ type: 'op', seq: 1, op: { t: 'place', x: 2, y: 2, e: 'Rock' } })
    assert.match((await fake.next((m) => m.type === 'reject')).error, /zamčen/)
    admin.send({ type: 'op', seq: 1, op: { t: 'place', x: 2, y: 2, e: 'Rock' } })
    await fake.next((m) => m.type === 'op')

    admin.send({ type: 'admin', action: 'announce', text: 'Konec za 5 minut' })
    assert.equal((await fake.next((m) => m.type === 'announce')).text, 'Konec za 5 minut')

    // projektor dostává souhrn všech stolů
    const rooms = await admin.next((m) => m.type === 'rooms')
    assert.ok(rooms.rooms.some((r) => r.id === 'lab'))
    admin.close()
    fake.close()
  } finally {
    await stop(srv.proc)
  }
})

test('stav přežije restart serveru – z disku i od klientů', async () => {
  const dir = tmp()
  const servers = []
  const clients = []
  const start = async (d) => {
    const srv = await startServer(d)
    servers.push(srv)
    return srv
  }
  const client = (port, hello) => {
    const c = new Client(port, hello)
    clients.push(c)
    return c
  }
  try {
    let srv = await start(dir)
    const a = client(srv.port, { name: 'Alice', room: 'stul-1' })
    await a.ready
    const welcome = await a.next((m) => m.type === 'welcome')
    a.send({ type: 'op', seq: 1, op: { t: 'place', x: 4, y: 4, e: 'Mirror', r: 45 } })
    const op = await a.next((m) => m.type === 'op')
    a.close()
    await stop(srv.proc) // SIGTERM → uložení na disk

    // 1) restart se zachovaným diskem
    srv = await start(dir)
    const b = client(srv.port, { name: 'Bob', room: 'stul-1' })
    await b.ready
    const w = await b.next((m) => m.type === 'welcome')
    assert.equal(w.room.content.cells['4,4']?.t, 'Mirror')
    assert.equal(w.room.version, op.v)
    b.close()
    await stop(srv.proc, 'SIGKILL')

    // 2) restart s prázdným diskem (free hosting) → stav obnoví první klient, který ho zná
    srv = await start(tmp())
    const knownContent = { ...welcome.room.content, cells: { ...welcome.room.content.cells, '4,4': { t: 'Mirror', r: 45 } } }
    const known = { room: 'stul-1', epoch: welcome.epoch, version: op.v, content: knownContent }
    const c = client(srv.port, { name: 'Cyril', room: 'stul-1', known })
    await c.ready
    const wc = await c.next((m) => m.type === 'welcome')
    assert.equal(wc.room.content.cells['4,4']?.t, 'Mirror')
    assert.equal(wc.room.version, op.v)
    // další klient se starším stavem už nic nepřepíše
    const d = client(srv.port, { name: 'Dana', room: 'stul-1', known: { ...known, content: { cols: 13, rows: 10, cells: {} } } })
    await d.ready
    const wd = await d.next((m) => m.type === 'welcome')
    assert.equal(wd.room.content.cells['4,4']?.t, 'Mirror')
  } finally {
    for (const c of clients) c.close()
    for (const s of servers) await stop(s.proc)
  }
})

test('HTTP: stránky, QR, galerie a ochrana souborů', async () => {
  const srv = await startServer(tmp())
  try {
    const page = await fetch(`${srv.url}/`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Kvantová hra/)
    assert.equal((await fetch(`${srv.url}/present`)).status, 200)
    assert.equal((await fetch(`${srv.url}/galerie`)).status, 200)
    assert.equal((await fetch(`${srv.url}/js/qt.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal((await fetch(`${srv.url}/healthz`)).status, 200)

    const qr = await fetch(`${srv.url}/api/qr.svg?text=${encodeURIComponent('https://example.com/')}`)
    assert.equal(qr.status, 200)
    assert.match(await qr.text(), /^<svg/)

    for (const bad of ['/../server/server.js', '/%2e%2e/package.json', '/js/../../server/server.js']) {
      const r = await fetch(`${srv.url}${bad}`)
      assert.ok([403, 404].includes(r.status), bad)
      assert.doesNotMatch(await r.text(), /WebSocketServer/)
    }

    const post = (body) => fetch(`${srv.url}/api/gallery`, { method: 'POST', body: JSON.stringify(body) })
    const ok = await post({ title: 'Můj <b>MZI</b>', author: 'Alice', content: { cols: 13, rows: 10, cells: { '1,3': { t: 'Laser' } } } })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).item.title, 'Můj bMZI/b')
    assert.equal((await post({ title: 'x', content: { cols: 999 } })).status, 400)
    const list = await (await fetch(`${srv.url}/api/gallery`)).json()
    assert.equal(list.items.length, 1)

    const cfg = await (await fetch(`${srv.url}/api/config`)).json()
    assert.equal(cfg.mainRoom, 'lab')
  } finally {
    await stop(srv.proc)
  }
})
