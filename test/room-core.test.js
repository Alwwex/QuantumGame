// Model místnosti: validace operací (vše od klientů je nedůvěryhodné), levely, sdílení.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyOp,
  createSandbox,
  createFromLevel,
  sanitizeContent,
  encodeBoard,
  decodeBoard,
  evaluateGoals,
  nextRotation,
  normalizeRotation,
  MAX_LASERS,
  key,
} from '../public/js/room-core.js'
import { simulate } from '../public/js/qt.js'
import { TEMPLATES } from '../public/js/templates.js'
import { ELEMENTS, demoContent } from '../public/js/elements.js'

test('sandbox: pokládání, posun, otáčení, mazání', () => {
  const c = createSandbox()
  assert.deepEqual(c.cells['1,3'], { t: 'Laser', r: 0 })
  assert.ok(applyOp(c, { t: 'place', x: 5, y: 3, e: 'Mirror', r: 45 }).ok)
  assert.equal(applyOp(c, { t: 'place', x: 5, y: 3, e: 'Rock' }).ok, false, 'obsazené pole')
  assert.equal(applyOp(c, { t: 'place', x: 13, y: 3, e: 'Rock' }).ok, false, 'mimo desku')
  assert.equal(applyOp(c, { t: 'place', x: 2, y: 2, e: 'Hacker' }).ok, false, 'neznámý prvek')
  assert.equal(applyOp(c, { t: 'place', x: 2.5, y: 2, e: 'Rock' }).ok, false, 'necelé souřadnice')
  assert.ok(applyOp(c, { t: 'rotate', x: 5, y: 3, r: 90 }).ok)
  assert.equal(c.cells['5,3'].r, 90)
  assert.ok(applyOp(c, { t: 'move', x: 5, y: 3, tx: 6, ty: 3 }).ok)
  assert.equal(c.cells['5,3'], undefined)
  assert.ok(applyOp(c, { t: 'remove', x: 6, y: 3 }).ok)
  assert.equal(Object.keys(c.cells).length, 1)
})

test('natočení se normalizuje na povolené úhly', () => {
  assert.equal(normalizeRotation('Mirror', 44), 45)
  assert.equal(normalizeRotation('Mirror', 405), 45)
  assert.equal(normalizeRotation('Detector', 45), 90) // jen násobky 90°
  assert.equal(normalizeRotation('Rock', 90), 0)
  assert.equal(nextRotation('Mirror', 315), 0)
  assert.equal(nextRotation('Laser', 270), 0)
})

test('maximální počet laserů a polarizace laseru', () => {
  const c = createSandbox()
  for (let i = 1; i < MAX_LASERS; i++) assert.ok(applyOp(c, { t: 'place', x: 0, y: i, e: 'Laser' }).ok)
  assert.equal(applyOp(c, { t: 'place', x: 5, y: 5, e: 'Laser' }).ok, false)
  assert.ok(applyOp(c, { t: 'pol', x: 1, y: 3, p: 45 }).ok)
  assert.equal(c.cells['1,3'].p, 45)
  assert.equal(applyOp(c, { t: 'pol', x: 1, y: 3, p: 30 }).ok, false)
})

test('level: omezené nástroje a přišroubované dílky', () => {
  const c = createFromLevel(3) // Drag & Drop: 2 zrcadla
  assert.equal(c.tools.Mirror, 2)
  assert.ok(applyOp(c, { t: 'place', x: 1, y: 1, e: 'Mirror' }).ok)
  assert.ok(applyOp(c, { t: 'place', x: 1, y: 2, e: 'Mirror' }).ok)
  assert.equal(applyOp(c, { t: 'place', x: 1, y: 5, e: 'Mirror' }).ok, false, 'došla zrcadla')
  assert.equal(applyOp(c, { t: 'place', x: 1, y: 5, e: 'Rock' }).ok, false, 'prvek mimo nabídku')
  assert.ok(applyOp(c, { t: 'remove', x: 1, y: 1 }).ok)
  assert.equal(c.tools.Mirror, 1)
  // laser levelu je přišroubovaný
  assert.equal(applyOp(c, { t: 'move', x: 3, y: 2, tx: 3, ty: 3 }).ok, false)
  assert.equal(applyOp(c, { t: 'rotate', x: 3, y: 2, r: 90 }).ok, false)
})

test('level 1 jde vyřešit odsunutím kamene', () => {
  const c = createFromLevel(1)
  assert.equal(evaluateGoals(c, simulate(c)).won, false)
  assert.ok(applyOp(c, { t: 'move', x: 6, y: 2, tx: 6, ty: 5 }).ok)
  const g = evaluateGoals(c, simulate(c))
  assert.equal(g.won, true)
  assert.ok(g.goals[0].met)
})

test('sanitizeContent odfiltruje nesmysly', () => {
  const c = sanitizeContent({
    cols: 13,
    rows: 10,
    cells: { '1,1': { t: 'Mirror', r: 46, evil: '<script>' }, '99,1': { t: 'Rock' }, '2,2': { t: 'Nope' }, x: { t: 'Rock' } },
    level: { id: 1, name: '<b>hi</b>', hints: [{ x: 1, y: 1, text: 'a'.repeat(500) }] },
  })
  assert.deepEqual(Object.keys(c.cells), ['1,1'])
  assert.deepEqual(c.cells['1,1'], { t: 'Mirror', r: 45 })
  assert.equal(c.level.name, 'bhi/b')
  assert.equal(c.level.hints[0].text.length, 120)
  assert.throws(() => sanitizeContent({ cols: 1000, rows: 10, cells: {} }))
  assert.throws(() => sanitizeContent(null))
})

test('odkaz na sestavu: zakódování a zpět', () => {
  const c = TEMPLATES.find((t) => t.id === 'pbs').content()
  const s = encodeBoard(c)
  assert.match(s, /^13x10;/)
  assert.ok(!/[^A-Za-z0-9.;x]/.test(s), 'bezpečné znaky v URL')
  const d = decodeBoard(s)
  assert.deepEqual(d.cells, c.cells)
  assert.throws(() => decodeBoard('garbage'))
})

test('load nahradí celou desku validovaným obsahem', () => {
  const c = createSandbox()
  const r = applyOp(c, { t: 'load', content: { cols: 6, rows: 4, cells: { '0,0': { t: 'Laser' } } } })
  assert.ok(r.ok)
  assert.equal(c.cols, 6)
  assert.equal(key(0, 0) in c.cells, true)
})

test('šablony experimentů dávají slíbené výsledky', () => {
  for (const tpl of TEMPLATES) {
    const sim = simulate(tpl.content())
    for (const [k, v] of Object.entries(tpl.expect)) {
      assert.ok(Math.abs((sim.total.get(k) || 0) - v) < 1e-9, `${tpl.id}: ${k}`)
    }
  }
})

test('každý prvek má kartu a ukázka se dá nasimulovat', () => {
  for (const [t, info] of Object.entries(ELEMENTS)) {
    assert.ok(info.name && info.short && info.what, t)
    const content = demoContent(t)
    assert.ok(content, t)
    assert.ok(simulate(content).lasers.length >= 1, t)
  }
})
