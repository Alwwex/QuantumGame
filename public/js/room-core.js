// Sdílený model místnosti (desky) – používá ho server i prohlížeč.
// Validuje a aplikuje operace, aby se všichni klienti shodli na stejném stavu.

import { LEVELS } from './levels-data.js'

/** Kolik různých natočení má prvek (1, 4 nebo 8 – stejně jako v Quantum Game 2). */
export const ELEMENT_META = {
  Laser: { rotations: 4 },
  Mirror: { rotations: 8 },
  BeamSplitter: { rotations: 8 },
  CoatedBeamSplitter: { rotations: 8 },
  PolarizingBeamSplitter: { rotations: 4 },
  CornerCube: { rotations: 1 },
  Detector: { rotations: 4 },
  DetectorFour: { rotations: 1 },
  Rock: { rotations: 1 },
  Mine: { rotations: 1 },
  Absorber: { rotations: 1 },
  Polarizer: { rotations: 8 },
  QuarterWavePlate: { rotations: 8 },
  HalfWavePlate: { rotations: 8 },
  SugarSolution: { rotations: 1 },
  FaradayRotator: { rotations: 4 },
  Glass: { rotations: 1 },
  VacuumJar: { rotations: 1 },
  Wall: { rotations: 1 },
}

/** Nástroje v otevřeném sandboxu (Virtual Lab) + laser navíc pro společné hraní. */
export const SANDBOX_TOOLS = [
  'Laser',
  'Mirror',
  'BeamSplitter',
  'PolarizingBeamSplitter',
  'CornerCube',
  'Detector',
  'DetectorFour',
  'Rock',
  'Mine',
  'Absorber',
  'Polarizer',
  'QuarterWavePlate',
  'HalfWavePlate',
  'SugarSolution',
  'FaradayRotator',
  'Glass',
  'VacuumJar',
]

export const LASER_POLARIZATIONS = [0, 90, 45, 135]
export const MAX_LASERS = 6
export const SIZE_LIMITS = { minCols: 4, maxCols: 24, minRows: 3, maxRows: 16 }

const mod = (x, n) => ((x % n) + n) % n

export function allowedRotations(t) {
  const n = ELEMENT_META[t]?.rotations ?? 1
  const step = 360 / n
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i * step))
}

export function normalizeRotation(t, r) {
  const n = ELEMENT_META[t]?.rotations ?? 1
  if (n === 1) return 0
  const step = 360 / n
  const v = mod(Math.round((Number(r) || 0) / step) * step, 360)
  return v
}

/** Další natočení po kliknutí (proti směru hodinových ručiček, jako v originále). */
export function nextRotation(t, r) {
  const rots = allowedRotations(t)
  const i = rots.indexOf(normalizeRotation(t, r))
  return rots[(i + 1) % rots.length]
}

export function nextPolarization(p) {
  const i = LASER_POLARIZATIONS.indexOf(p || 0)
  return LASER_POLARIZATIONS[(i + 1) % LASER_POLARIZATIONS.length]
}

export const key = (x, y) => `${x},${y}`
export const parseKey = (k) => k.split(',').map(Number)

// ---------------------------------------------------------------------------
// Tvorba obsahu místnosti
// ---------------------------------------------------------------------------

/** Prázdná laboratoř 13×10 s laserem na (1, 3) – přesně jako „Virtual Lab“ v originále. */
export function createSandbox(cols = 13, rows = 10) {
  const laserY = Math.min(3, rows - 1)
  return {
    cols,
    rows,
    cells: { [key(1, laserY)]: { t: 'Laser', r: 0 } },
    tools: null,
    level: null,
  }
}

export function getLevel(id) {
  return LEVELS.find((l) => l.id === Number(id)) || null
}

export function createFromLevel(levelOrId) {
  const level = typeof levelOrId === 'object' ? levelOrId : getLevel(levelOrId)
  if (!level) throw new Error('Neznámý level')
  const goals = new Map(level.goals.map(([x, y, g]) => [key(x, y), g]))
  const cells = {}
  for (const [x, y, t, r, lk, p] of level.cells) {
    const piece = { t, r: normalizeRotation(t, r) }
    if (lk) piece.lk = lk
    if (t === 'Laser' && p) piece.p = p
    if (goals.has(key(x, y))) piece.g = goals.get(key(x, y))
    cells[key(x, y)] = piece
  }
  return {
    cols: level.cols,
    rows: level.rows,
    cells,
    tools: { ...level.tools },
    level: {
      id: level.id,
      name: level.name,
      en: level.en,
      safety: level.safety || 0,
      hints: level.hints || [],
    },
  }
}

export function cloneContent(content) {
  return JSON.parse(JSON.stringify(content))
}

// ---------------------------------------------------------------------------
// Validace (vše, co přijde od klientů, je nedůvěryhodné)
// ---------------------------------------------------------------------------

const isInt = (v) => Number.isInteger(v)
const inBounds = (content, x, y) => isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < content.cols && y < content.rows

function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max)
}

export function sanitizePiece(raw) {
  if (!raw || typeof raw !== 'object') return null
  const t = raw.t
  if (!Object.prototype.hasOwnProperty.call(ELEMENT_META, t)) return null
  const piece = { t, r: normalizeRotation(t, raw.r) }
  if (raw.lk === 1 || raw.lk === 2) piece.lk = raw.lk
  if (t === 'Laser' && LASER_POLARIZATIONS.includes(raw.p) && raw.p) piece.p = raw.p
  if (typeof raw.g === 'number' && raw.g > 0 && raw.g <= 1) piece.g = raw.g
  return piece
}

/** Zvaliduje celý obsah desky (import, sdílený odkaz, načtení ze souboru). */
export function sanitizeContent(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Neplatná data desky')
  const cols = Number(raw.cols)
  const rows = Number(raw.rows)
  const L = SIZE_LIMITS
  if (!isInt(cols) || !isInt(rows) || cols < L.minCols || cols > L.maxCols || rows < L.minRows || rows > L.maxRows) {
    throw new Error('Neplatná velikost desky')
  }
  const content = { cols, rows, cells: {}, tools: null, level: null }
  const entries = Object.entries(raw.cells || {})
  if (entries.length > cols * rows) throw new Error('Příliš mnoho dílků')
  let lasers = 0
  for (const [k, p] of entries) {
    const [x, y] = parseKey(String(k))
    if (!inBounds(content, x, y)) continue
    const piece = sanitizePiece(p)
    if (!piece) continue
    if (piece.t === 'Laser' && ++lasers > MAX_LASERS) continue
    content.cells[key(x, y)] = piece
  }
  if (raw.tools && typeof raw.tools === 'object') {
    content.tools = {}
    for (const [t, n] of Object.entries(raw.tools)) {
      if (ELEMENT_META[t] && isInt(n) && n >= 0 && n <= 99) content.tools[t] = n
    }
  }
  if (raw.level && typeof raw.level === 'object') {
    const lv = raw.level
    content.level = {
      id: isInt(lv.id) ? lv.id : 0,
      name: cleanText(lv.name, 60),
      en: cleanText(lv.en, 60),
      safety: typeof lv.safety === 'number' && lv.safety >= 0 && lv.safety <= 1 ? lv.safety : 0,
      hints: Array.isArray(lv.hints)
        ? lv.hints.slice(0, 20).flatMap((h) => {
            if (!h || !inBounds(content, h.x, h.y)) return []
            const hint = { x: h.x, y: h.y }
            if (h.text) hint.text = cleanText(h.text, 120)
            if (h.action === 'rotation' || h.action === 'drag') hint.action = h.action
            if (isInt(h.order)) hint.order = h.order
            return [hint]
          })
        : [],
    }
  }
  return content
}

// ---------------------------------------------------------------------------
// Operace
// ---------------------------------------------------------------------------

/** Kolik kusů daného prvku lze ještě položit (Infinity v sandboxu). */
export function toolCount(content, t) {
  if (!content.tools) return SANDBOX_TOOLS.includes(t) ? Infinity : 0
  return content.tools[t] || 0
}

export function countLasers(content) {
  return Object.values(content.cells).filter((p) => p.t === 'Laser').length
}

/**
 * Aplikuje operaci na obsah (mutuje ho). Vrací { ok, error?, op } – op je normalizovaná verze.
 * Operace: place, move, rotate, pol, remove, clear, load
 */
export function applyOp(content, rawOp) {
  if (!rawOp || typeof rawOp !== 'object') return fail('Neplatná operace')
  const op = rawOp
  switch (op.t) {
    case 'place': {
      if (!inBounds(content, op.x, op.y)) return fail('Mimo desku')
      if (content.cells[key(op.x, op.y)]) return fail('Pole je obsazené')
      const piece = sanitizePiece({ t: op.e, r: op.r, p: op.p })
      if (!piece) return fail('Neznámý prvek')
      if (toolCount(content, piece.t) <= 0) return fail('Tento prvek už nemáš k dispozici')
      if (piece.t === 'Laser' && countLasers(content) >= MAX_LASERS) return fail(`Maximálně ${MAX_LASERS} laserů na desku`)
      content.cells[key(op.x, op.y)] = piece
      if (content.tools) content.tools[piece.t] -= 1
      return ok({ t: 'place', x: op.x, y: op.y, e: piece.t, r: piece.r, ...(piece.p ? { p: piece.p } : {}) })
    }
    case 'move': {
      if (!inBounds(content, op.x, op.y) || !inBounds(content, op.tx, op.ty)) return fail('Mimo desku')
      const piece = content.cells[key(op.x, op.y)]
      if (!piece) return fail('Tady nic není')
      if (piece.lk) return fail('Tento dílek je přišroubovaný')
      if (op.x === op.tx && op.y === op.ty) return fail('Žádná změna')
      if (content.cells[key(op.tx, op.ty)]) return fail('Cílové pole je obsazené')
      delete content.cells[key(op.x, op.y)]
      content.cells[key(op.tx, op.ty)] = piece
      return ok({ t: 'move', x: op.x, y: op.y, tx: op.tx, ty: op.ty })
    }
    case 'rotate': {
      if (!inBounds(content, op.x, op.y)) return fail('Mimo desku')
      const piece = content.cells[key(op.x, op.y)]
      if (!piece) return fail('Tady nic není')
      if (piece.lk === 2) return fail('Tento dílek je přišroubovaný')
      if ((ELEMENT_META[piece.t]?.rotations ?? 1) === 1) return fail('Tento prvek se neotáčí')
      piece.r = normalizeRotation(piece.t, op.r)
      return ok({ t: 'rotate', x: op.x, y: op.y, r: piece.r })
    }
    case 'pol': {
      if (!inBounds(content, op.x, op.y)) return fail('Mimo desku')
      const piece = content.cells[key(op.x, op.y)]
      if (!piece || piece.t !== 'Laser') return fail('Polarizaci lze měnit jen u laseru')
      if (piece.lk === 2) return fail('Tento dílek je přišroubovaný')
      if (!LASER_POLARIZATIONS.includes(op.p)) return fail('Neplatná polarizace')
      if (op.p) piece.p = op.p
      else delete piece.p
      return ok({ t: 'pol', x: op.x, y: op.y, p: op.p })
    }
    case 'remove': {
      if (!inBounds(content, op.x, op.y)) return fail('Mimo desku')
      const piece = content.cells[key(op.x, op.y)]
      if (!piece) return fail('Tady nic není')
      if (piece.lk) return fail('Tento dílek je přišroubovaný')
      delete content.cells[key(op.x, op.y)]
      if (content.tools) content.tools[piece.t] = (content.tools[piece.t] || 0) + 1
      return ok({ t: 'remove', x: op.x, y: op.y })
    }
    case 'load': {
      let next
      try {
        next = sanitizeContent(op.content)
      } catch (e) {
        return fail(e.message)
      }
      replaceContent(content, next)
      return ok({ t: 'load', content: cloneContent(next) })
    }
    default:
      return fail('Neznámá operace')
  }
}

export function replaceContent(target, next) {
  for (const k of Object.keys(target)) delete target[k]
  Object.assign(target, cloneContent(next))
}

/** Obsah, na který se deska vrátí při „Vyčistit“ (level = restart, sandbox = prázdná laboratoř). */
export function resetContentFor(content) {
  if (content.level && content.level.id) {
    const lvl = getLevel(content.level.id)
    if (lvl) return createFromLevel(lvl)
  }
  return createSandbox(content.cols, content.rows)
}

function ok(op) {
  return { ok: true, op }
}
function fail(error) {
  return { ok: false, error }
}

// ---------------------------------------------------------------------------
// Vyhodnocení cílů levelu
// ---------------------------------------------------------------------------

/** sim = výsledek simulate(); vrací stav cílů a min. */
export function evaluateGoals(content, sim) {
  const goals = []
  const mines = []
  const safety = content.level?.safety ?? 0
  for (const [k, piece] of Object.entries(content.cells)) {
    const value = sim.total.get(k) || 0
    const [x, y] = parseKey(k)
    if (piece.g) goals.push({ x, y, threshold: piece.g, value, met: value >= piece.g - 1e-9 })
    if (piece.t === 'Mine') mines.push({ x, y, value, safe: value <= safety + 1e-9 })
  }
  const allGoals = goals.every((g) => g.met)
  const allSafe = mines.every((m) => m.safe)
  const isLevel = !!content.level
  return {
    goals,
    mines,
    exploded: !allSafe,
    won: isLevel && allGoals && allSafe && (goals.length > 0 || mines.length > 0),
    percent: goals.length ? goals.reduce((s, g) => s + Math.min(1, g.value / g.threshold), 0) / goals.length : 0,
  }
}

// ---------------------------------------------------------------------------
// Kompaktní kódování desky do odkazu (sdílení)
// ---------------------------------------------------------------------------

const CODES = {
  Laser: 'L', Mirror: 'M', BeamSplitter: 'B', CoatedBeamSplitter: 'C', PolarizingBeamSplitter: 'P',
  CornerCube: 'K', Detector: 'D', DetectorFour: 'O', Rock: 'R', Mine: 'X', Absorber: 'A',
  Polarizer: 'Z', QuarterWavePlate: 'Q', HalfWavePlate: 'H', SugarSolution: 'S', FaradayRotator: 'F',
  Glass: 'G', VacuumJar: 'V', Wall: 'W',
}
const FROM_CODE = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [v, k]))

/** Deska → krátký řetězec, např. "13x10;L1.3.0;M5.3.45" */
export function encodeBoard(content) {
  const parts = [`${content.cols}x${content.rows}`]
  for (const [k, p] of Object.entries(content.cells)) {
    const [x, y] = parseKey(k)
    let s = `${CODES[p.t]}${x}.${y}.${p.r || 0}`
    if (p.p) s += `.${p.p}`
    parts.push(s)
  }
  return parts.join(';')
}

export function decodeBoard(str) {
  const parts = String(str).split(';')
  const m = /^(\d+)x(\d+)$/.exec(parts[0] || '')
  if (!m) throw new Error('Neplatný odkaz')
  const raw = { cols: +m[1], rows: +m[2], cells: {} }
  for (const part of parts.slice(1)) {
    const t = FROM_CODE[part[0]]
    const nums = part.slice(1).split('.').map(Number)
    if (!t || nums.length < 3) continue
    const [x, y, r, p] = nums
    raw.cells[key(x, y)] = { t, r, ...(p ? { p } : {}) }
  }
  return sanitizeContent(raw)
}

export function contentSummary(content) {
  return {
    cols: content.cols,
    rows: content.rows,
    pieces: Object.keys(content.cells).length,
    level: content.level ? { id: content.level.id, name: content.level.name } : null,
  }
}
