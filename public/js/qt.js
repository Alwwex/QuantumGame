// Kvantový engine – simulace jednoho fotonu na mřížce.
//
// Fyzika je převzatá 1:1 z knihovny quantum-tensors (Piotr Migdał a kol., MIT),
// kterou používá originální Quantum Game 2 (https://quantumgame.io).
// Stav fotonu: |x, y, směr, polarizace⟩, směr ∈ {→, ↑, ←, ↓}, polarizace ∈ {H, V}.
// Každý prvek je lokální operátor 8×8 (4 směry ⊗ 2 polarizace).
//
// Modul je čistý JS bez závislostí – běží v prohlížeči i v Node (testy).

export const DIR_SYMBOLS = ['→', '↑', '←', '↓']
export const DIR_ASCII = ['>', '^', '<', 'v']
export const POL_SYMBOLS = ['H', 'V']
export const DX = [1, 0, -1, 0]
export const DY = [0, -1, 0, 1]

const TAU = 2 * Math.PI
const DEG = Math.PI / 180
const EPS = 1e-6

// ---------------------------------------------------------------------------
// Operátory 8×8 (komplexní, hustá matice). Index = směr * 2 + polarizace.
// m[(out * 8 + in) * 2] = Re, m[... + 1] = Im
// ---------------------------------------------------------------------------

const zeros = () => new Float64Array(128)

function addInto(target, src, re = 1, im = 0) {
  for (let k = 0; k < 64; k++) {
    const a = src[2 * k]
    const b = src[2 * k + 1]
    if (a === 0 && b === 0) continue
    target[2 * k] += a * re - b * im
    target[2 * k + 1] += a * im + b * re
  }
  return target
}

const sum = (...ops) => ops.reduce((acc, op) => addInto(acc, op), zeros())
const scale = (op, re, im = 0) => addInto(zeros(), op, re, im)

/** Kroneckerův součin: dirPairs = [[out, in], ...] (hodnota 1), pol = 2×2 komplexní [[re,im]] */
function kron(dirPairs, pol) {
  const m = zeros()
  for (const [dOut, dIn] of dirPairs) {
    for (let pOut = 0; pOut < 2; pOut++) {
      for (let pIn = 0; pIn < 2; pIn++) {
        const [re, im] = pol[pOut][pIn]
        if (re === 0 && im === 0) continue
        const k = ((dOut * 2 + pOut) * 8 + (dIn * 2 + pIn)) * 2
        m[k] += re
        m[k + 1] += im
      }
    }
  }
  return m
}

const c = (re, im = 0) => [re, im]
const polIdentity = [[c(1), c(0)], [c(0), c(1)]]
const polProjH = [[c(1), c(0)], [c(0), c(0)]]
const polProjV = [[c(0), c(0)], [c(0), c(1)]]
// odraz od opticky hustšího prostředí: H → H, V → −V
const polReflectDenser = [[c(1), c(0)], [c(0), c(-1)]]

function polRotation(alpha) {
  const co = Math.cos(alpha)
  const si = Math.sin(alpha)
  return [[c(co), c(-si)], [c(si), c(co)]]
}

function polProjection(alpha) {
  const co = Math.cos(alpha)
  const si = Math.sin(alpha)
  return [[c(co * co), c(co * si)], [c(co * si), c(si * si)]]
}

function polPhaseShift(alpha, phase, phaseOrthogonal) {
  const p1 = polProjection(alpha)
  const p2 = polProjection(alpha + TAU / 4)
  const e1 = [Math.cos(phase * TAU), Math.sin(phase * TAU)]
  const e2 = [Math.cos(phaseOrthogonal * TAU), Math.sin(phaseOrthogonal * TAU)]
  const mul = (a, e) => [a[0] * e[0] - a[1] * e[1], a[0] * e[1] + a[1] * e[0]]
  return [0, 1].map((i) =>
    [0, 1].map((j) => {
      const a = mul(p1[i][j], e1)
      const b = mul(p2[i][j], e2)
      return [a[0] + b[0], a[1] + b[1]]
    }),
  )
}

const mod = (x, n) => ((x % n) + n) % n
const ALL_DIRS = [[0, 0], [1, 1], [2, 2], [3, 3]]

// směry: 0 →, 1 ↑, 2 ←, 3 ↓
function reflectFromPlaneDirection(angle) {
  switch (mod(angle, 180)) {
    case 0: // -
      return [[3, 1], [1, 3]]
    case 45: // /
      return [[1, 0], [0, 1], [3, 2], [2, 3]]
    case 90: // |
      return [[2, 0], [0, 2]]
    case 135: // \
      return [[3, 0], [0, 3], [1, 2], [2, 1]]
    default:
      throw new Error(`Úhel ${angle} není násobek 45°`)
  }
}

function beamsplitterTransmissionDirections(angle) {
  switch (mod(angle, 180)) {
    case 0:
      return [[1, 1], [3, 3]]
    case 45:
    case 135:
      return ALL_DIRS
    case 90:
      return [[0, 0], [2, 2]]
    default:
      throw new Error(`Úhel ${angle} není násobek 45°`)
  }
}

const diode = (angle) => {
  const d = mod(angle, 360) / 90
  if (!Number.isInteger(d)) throw new Error(`Úhel ${angle} není násobek 90°`)
  return [[d, d]]
}

// --- prvky -----------------------------------------------------------------

export const ops = {
  identity: () => kron(ALL_DIRS, polIdentity),
  attenuator: (r = Math.SQRT1_2) => scale(kron(ALL_DIRS, polIdentity), r),
  vacuumJar: () => scale(kron(ALL_DIRS, polIdentity), Math.cos(-TAU / 4), Math.sin(-TAU / 4)),
  glassSlab: () => scale(kron(ALL_DIRS, polIdentity), Math.cos(TAU / 4), Math.sin(TAU / 4)),
  mirror: (angle) => kron(reflectFromPlaneDirection(angle), polReflectDenser),
  beamSplitter: (angle, split = 0.5) =>
    sum(
      scale(kron(reflectFromPlaneDirection(angle), polReflectDenser), 0, Math.sqrt(split)),
      scale(kron(beamsplitterTransmissionDirections(angle), polIdentity), Math.sqrt(1 - split)),
    ),
  cornerCube: () => kron([[2, 0], [3, 1], [0, 2], [1, 3]], polIdentity),
  polarizingBeamSplitter: (angle) => {
    if (![0, 90].includes(mod(angle, 180))) throw new Error(`PBS: úhel ${angle}`)
    return sum(kron(ALL_DIRS, polProjH), kron(reflectFromPlaneDirection(angle + 45), polProjV))
  },
  faradayRotator: (angle, polarizationRotation = 0.125) =>
    sum(
      kron(diode(angle), polRotation(polarizationRotation * TAU)),
      kron(diode(angle + 180), polRotation(-polarizationRotation * TAU)),
    ),
  polarizer: (angle) =>
    sum(...[0, 90, 180, 270].map((d) => kron(diode(d), polProjection((angle + d) * DEG)))),
  phasePlate: (rotation, phaseShift) =>
    sum(
      ...[0, 90, 180, 270].map((d) =>
        kron(diode(d), polPhaseShift((rotation + d) * DEG, 0, phaseShift)),
      ),
    ),
  sugarSolution: (polarizationRotation = 0.125) =>
    kron(ALL_DIRS, polRotation(polarizationRotation * TAU)),
}

/** Lokální operátor pro dílek na desce. piece = {t, r, ...} */
export function pieceOperator(piece) {
  const r = piece.r || 0
  switch (piece.t) {
    case 'Detector':
    case 'DetectorFour':
    case 'Gate':
    case 'Laser':
    case 'Mine':
    case 'Rock':
    case 'Wall':
      return ops.attenuator(0)
    case 'Absorber':
      return ops.attenuator(Math.sqrt(piece.absorption ?? 0.5))
    case 'BeamSplitter':
    case 'CoatedBeamSplitter':
      return ops.beamSplitter(r, piece.split ?? 0.5)
    case 'CornerCube':
      return ops.cornerCube()
    case 'FaradayRotator':
      return ops.faradayRotator(r)
    case 'Mirror':
      return ops.mirror(r)
    case 'NonLinearCrystal':
      return ops.attenuator(1)
    case 'Polarizer':
      return ops.polarizer(r)
    case 'PolarizingBeamSplitter':
      return ops.polarizingBeamSplitter(r)
    case 'HalfWavePlate':
      return ops.phasePlate(r, 0.5)
    case 'QuarterWavePlate':
      return ops.phasePlate(r, 0.25)
    case 'SugarSolution':
      return ops.sugarSolution(piece.polRot ?? 0.125)
    case 'Glass':
      return ops.glassSlab()
    case 'VacuumJar':
      return ops.vacuumJar()
    default:
      return null // neznámý prvek = volný prostor
  }
}

// cache operátorů – stejný typ + natočení = stejná matice
const opCache = new Map()
function cachedOperator(piece) {
  const key = `${piece.t}|${piece.r || 0}|${piece.absorption ?? ''}|${piece.split ?? ''}|${piece.polRot ?? ''}`
  if (!opCache.has(key)) opCache.set(key, pieceOperator(piece))
  return opCache.get(key)
}

// ---------------------------------------------------------------------------
// Simulace
// ---------------------------------------------------------------------------

/**
 * board = { cols, rows, cells: { "x,y": piece } }  nebo cells jako pole {x, y, ...piece}
 * Vrací { lasers: [LaserSim], total: Map("x,y" → pravděpodobnost) }
 * Každý laser vystřelí vlastní foton; jejich simulace jsou nezávislé.
 */
export function simulate(board, options = {}) {
  const { cols, rows } = board
  const maxFrames = options.maxFrames ?? Math.max(50, (cols + rows) * 3)
  const pieces = listPieces(board)
  const operators = []
  for (const p of pieces) {
    const op = cachedOperator(p)
    if (op) operators.push({ x: p.x, y: p.y, op })
  }
  const lasers = pieces.filter((p) => p.t === 'Laser')
  const sims = lasers.map((laser) => simulateLaser(cols, rows, operators, laser, maxFrames))
  const total = new Map()
  for (const sim of sims) {
    for (const [k, v] of sim.totalAbsorptions) total.set(k, (total.get(k) || 0) + v)
  }
  return { cols, rows, lasers: sims, total, maxFrameCount: Math.max(0, ...sims.map((s) => s.frames.length)) }
}

export function listPieces(board) {
  if (Array.isArray(board.cells)) return board.cells
  return Object.entries(board.cells || {}).map(([key, piece]) => {
    const [x, y] = key.split(',').map(Number)
    return { ...piece, x, y }
  })
}

export function laserDirectionIndex(r) {
  switch (mod(r || 0, 360)) {
    case 90:
      return 1
    case 180:
      return 2
    case 270:
      return 3
    default:
      return 0
  }
}

function simulateLaser(cols, rows, operators, laser, maxFrames) {
  const size = cols * rows * 8 * 2
  let state = new Float64Array(size)
  const dir = laserDirectionIndex(laser.r)
  const pol = (laser.p || 0) * DEG // polarizace laseru ve stupních: 0 = H, 90 = V
  const base = ((laser.y * cols + laser.x) * 8 + dir * 2) * 2
  state[base] = Math.cos(pol) // H
  state[base + 2] = Math.sin(pol) // V

  const frames = [makeFrame(state, cols, rows, [])]
  const cumulative = [new Map()]
  const totalAbsorptions = new Map()

  let probability = 1
  for (let f = 0; f < maxFrames && probability > EPS; f++) {
    const next = new Float64Array(size)
    let lostOffBoard = 0
    // 1) šíření: každá amplituda se posune o jedno pole ve svém směru
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cellBase = (y * cols + x) * 16
        for (let d = 0; d < 4; d++) {
          const i = cellBase + d * 4
          const hr = state[i], hi = state[i + 1], vr = state[i + 2], vi = state[i + 3]
          if (hr === 0 && hi === 0 && vr === 0 && vi === 0) continue
          const nx = x + DX[d]
          const ny = y + DY[d]
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
            lostOffBoard += hr * hr + hi * hi + vr * vr + vi * vi
            continue
          }
          const j = (ny * cols + nx) * 16 + d * 4
          next[j] += hr
          next[j + 1] += hi
          next[j + 2] += vr
          next[j + 3] += vi
        }
      }
    }
    // 2) interakce s prvky + měření pohlcení
    const absorptions = []
    const v = new Float64Array(16)
    for (const { x, y, op } of operators) {
      const cellBase = (y * cols + x) * 16
      let before = 0
      for (let k = 0; k < 16; k++) {
        v[k] = next[cellBase + k]
        before += v[k] * v[k]
      }
      if (before === 0) continue
      let after = 0
      for (let o = 0; o < 8; o++) {
        let re = 0
        let im = 0
        for (let i = 0; i < 8; i++) {
          const mr = op[(o * 8 + i) * 2]
          const mi = op[(o * 8 + i) * 2 + 1]
          if (mr === 0 && mi === 0) continue
          const ar = v[2 * i]
          const ai = v[2 * i + 1]
          re += mr * ar - mi * ai
          im += mr * ai + mi * ar
        }
        next[cellBase + 2 * o] = re
        next[cellBase + 2 * o + 1] = im
        after += re * re + im * im
      }
      const absorbed = before - after
      if (absorbed > EPS) absorptions.push({ x, y, probability: absorbed })
    }
    if (lostOffBoard > EPS) absorptions.push({ x: -1, y: -1, probability: lostOffBoard })

    state = next
    const frame = makeFrame(state, cols, rows, absorptions)
    frames.push(frame)
    probability = frame.probability

    const cum = new Map(cumulative[cumulative.length - 1])
    for (const a of absorptions) {
      const key = `${a.x},${a.y}`
      cum.set(key, (cum.get(key) || 0) + a.probability)
      totalAbsorptions.set(key, (totalAbsorptions.get(key) || 0) + a.probability)
    }
    cumulative.push(cum)
  }

  return { laser: { x: laser.x, y: laser.y }, frames, cumulative, totalAbsorptions }
}

function makeFrame(state, cols, rows, absorptions) {
  const particles = []
  let probability = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cellBase = (y * cols + x) * 16
      for (let d = 0; d < 4; d++) {
        const i = cellBase + d * 4
        const hr = state[i], hi = state[i + 1], vr = state[i + 2], vi = state[i + 3]
        const p = hr * hr + hi * hi + vr * vr + vi * vi
        probability += p
        if (p > EPS) particles.push({ x, y, d, a: [hr, hi], b: [vr, vi], p })
      }
    }
  }
  return { particles, absorptions, probability }
}

// ---------------------------------------------------------------------------
// Pomocné funkce pro zobrazení
// ---------------------------------------------------------------------------

/** Komponenty ketu pro daný snímek: [{amp:[re,im], x, y, d, pol}] */
export function ketComponents(frame) {
  const out = []
  for (const p of frame.particles) {
    if (p.a[0] ** 2 + p.a[1] ** 2 > EPS) out.push({ amp: p.a, x: p.x, y: p.y, d: p.d, pol: 0 })
    if (p.b[0] ** 2 + p.b[1] ** 2 > EPS) out.push({ amp: p.b, x: p.x, y: p.y, d: p.d, pol: 1 })
  }
  return out
}

/** Hezký zápis komplexního čísla, např. 0.71, −0.71i, 0.5+0.5i */
export function formatComplex([re, im], digits = 2) {
  const r = Math.abs(re) < 5e-4 ? 0 : re
  const i = Math.abs(im) < 5e-4 ? 0 : im
  const f = (x) => {
    const s = Math.abs(x).toFixed(digits).replace(/\.?0+$/, '')
    return s === '' ? '0' : s
  }
  if (i === 0) return (r < 0 ? '−' : '') + f(r)
  if (r === 0) return (i < 0 ? '−' : '') + (Math.abs(Math.abs(i) - 1) < 5e-4 ? '' : f(i)) + 'i'
  return `${r < 0 ? '−' : ''}${f(r)}${i < 0 ? '−' : '+'}${f(i)}i`
}

/** Náhodně vybere, kde foton skončí (pro režim experimentu). */
export function sampleOutcome(laserSim, random = Math.random) {
  let r = random()
  for (let f = 0; f < laserSim.frames.length; f++) {
    for (const a of laserSim.frames[f].absorptions) {
      r -= a.probability
      if (r <= 0) return { frame: f, x: a.x, y: a.y }
    }
  }
  return null // foton „přežil“ všechny kroky (např. smyčka) – nikde nezaklikal
}

export const SIM_EPS = EPS
