// Fyzika: srovnání s referenční knihovnou quantum-tensors (originální Quantum Game 2)
// a známé výsledky kvantové optiky.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { simulate, pieceOperator, sampleOutcome, formatComplex } from '../public/js/qt.js'
import { LEVELS } from '../public/js/levels-data.js'
import { createFromLevel } from '../public/js/room-core.js'

const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/levels-reference.json', import.meta.url), 'utf8'))
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

const board = (cols, rows, pieces) => ({
  cols,
  rows,
  cells: pieces.map(([t, x, y, r = 0, p = 0]) => ({ t, x, y, r, p })),
})
const totals = (sim) => Object.fromEntries(sim.total)

test('všech 36 levelů dává stejné výsledky jako quantum-tensors', () => {
  assert.equal(LEVELS.length, 36)
  for (const level of LEVELS) {
    const sim = simulate(createFromLevel(level), { maxFrames: 50 })
    const ref = reference[level.id]
    assert.equal(sim.lasers[0].frames.length, ref.frames, `level ${level.id}: počet snímků`)
    const keys = new Set([...Object.keys(ref.absorptions), ...sim.total.keys()])
    for (const k of keys) {
      const ours = sim.total.get(k) || 0
      const theirs = ref.absorptions[k] || 0
      assert.ok(Math.abs(ours - theirs) < 1e-6, `level ${level.id}, pole ${k}: ${ours} ≠ ${theirs}`)
    }
  }
})

test('Mach–Zehnderův interferometr pošle 100 % do jednoho detektoru', () => {
  const mzi = [
    ['Laser', 1, 4],
    ['BeamSplitter', 4, 4, 135],
    ['Mirror', 8, 4, 135],
    ['Mirror', 4, 7, 135],
    ['BeamSplitter', 8, 7, 135],
    ['Detector', 10, 7, 180],
    ['Detector', 8, 9, 90],
  ]
  const t = totals(simulate(board(13, 10, mzi)))
  assert.ok(close(t['10,7'], 1))
  assert.equal(t['8,9'], undefined)

  // jedno sklo = fáze π/2 → 50 : 50, dvě skla → přepnutí výstupu
  const one = totals(simulate(board(13, 10, [...mzi, ['Glass', 6, 4]])))
  assert.ok(close(one['10,7'], 0.5) && close(one['8,9'], 0.5))
  const two = totals(simulate(board(13, 10, [...mzi, ['Glass', 6, 4], ['Glass', 7, 4]])))
  assert.ok(close(two['8,9'], 1))

  // Elitzur–Vaidman: mina v jedné cestě
  const bomb = totals(simulate(board(13, 10, [...mzi, ['Mine', 6, 4]])))
  assert.ok(close(bomb['6,4'], 0.5) && close(bomb['10,7'], 0.25) && close(bomb['8,9'], 0.25))
})

test('Malusův zákon a paradox tří polarizátorů', () => {
  for (const [r, expected] of [
    [0, 1],
    [45, 0.5],
    [90, 0],
    [135, 0.5],
  ]) {
    const t = totals(simulate(board(5, 3, [['Laser', 0, 1], ['Polarizer', 2, 1, r], ['Detector', 4, 1, 180]])))
    assert.ok(close(t['4,1'] || 0, expected), `polarizátor ${r}°`)
  }
  const crossed = totals(simulate(board(13, 10, [['Laser', 1, 4], ['Polarizer', 3, 4, 0], ['Polarizer', 9, 4, 90], ['Detector', 11, 4, 180]])))
  assert.equal(crossed['11,4'], undefined)
  const three = totals(
    simulate(board(13, 10, [['Laser', 1, 4], ['Polarizer', 3, 4, 0], ['Polarizer', 6, 4, 45], ['Polarizer', 9, 4, 90], ['Detector', 11, 4, 180]])),
  )
  assert.ok(close(three['11,4'], 0.25))
})

test('polarizační dělič třídí H a V, laser umí 4 polarizace', () => {
  const run = (p) => totals(simulate(board(5, 3, [['Laser', 0, 1, 0, p], ['PolarizingBeamSplitter', 2, 1, 0], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]])))
  assert.ok(close(run(0)['4,1'], 1))
  assert.ok(close(run(90)['2,0'], 1))
  assert.ok(close(run(45)['4,1'], 0.5) && close(run(45)['2,0'], 0.5))
  assert.ok(close(run(135)['4,1'], 0.5) && close(run(135)['2,0'], 0.5))
})

test('bezztrátové prvky zachovávají normu, pohlcující ji ztrácejí', () => {
  const norm = (op, i) => {
    let n = 0
    for (let o = 0; o < 8; o++) n += op[(o * 8 + i) * 2] ** 2 + op[(o * 8 + i) * 2 + 1] ** 2
    return n
  }
  // pro směr → (vstupy 0 a 1) jsou tyto prvky unitární
  for (const piece of [
    { t: 'Mirror', r: 45 },
    { t: 'BeamSplitter', r: 135 },
    { t: 'PolarizingBeamSplitter', r: 0 },
    { t: 'SugarSolution' },
    { t: 'Glass' },
    { t: 'VacuumJar' },
    { t: 'HalfWavePlate', r: 45 },
    { t: 'QuarterWavePlate', r: 45 },
    { t: 'CornerCube' },
    { t: 'FaradayRotator', r: 0 },
  ]) {
    const op = pieceOperator(piece)
    for (const i of [0, 1]) assert.ok(close(norm(op, i), 1), `${piece.t}: vstup ${i}`)
  }
  assert.ok(close(norm(pieceOperator({ t: 'Absorber' }), 0), 0.5))
  assert.ok(close(norm(pieceOperator({ t: 'Detector' }), 0), 0))
})

test('foton mimo desku a více laserů', () => {
  const sim = simulate(board(5, 3, [['Laser', 0, 1]]))
  assert.ok(close(sim.total.get('-1,-1'), 1))
  const two = simulate(board(5, 3, [['Laser', 0, 0], ['Laser', 0, 2], ['Detector', 4, 0, 180], ['Detector', 4, 2, 180]]))
  assert.equal(two.lasers.length, 2)
  assert.ok(close(two.total.get('4,0'), 1) && close(two.total.get('4,2'), 1))
})

test('náhodné vzorkování odpovídá pravděpodobnostem', () => {
  const sim = simulate(board(5, 3, [['Laser', 0, 1], ['BeamSplitter', 2, 1, 45], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]]))
  let seed = 42
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const counts = {}
  for (let i = 0; i < 4000; i++) {
    const o = sampleOutcome(sim.lasers[0], rnd)
    counts[`${o.x},${o.y}`] = (counts[`${o.x},${o.y}`] || 0) + 1
  }
  assert.ok(Math.abs(counts['2,0'] / 4000 - 0.5) < 0.04)
  assert.ok(Math.abs(counts['4,1'] / 4000 - 0.5) < 0.04)
})

test('formátování komplexních čísel', () => {
  assert.equal(formatComplex([Math.SQRT1_2, 0]), '0.71')
  assert.equal(formatComplex([0, Math.SQRT1_2]), '0.71i')
  assert.equal(formatComplex([0, -1]), '−i')
  assert.equal(formatComplex([0.5, -0.5]), '0.5−0.5i')
})
