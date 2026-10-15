// Slavné experimenty připravené k načtení do sandboxu (deska 13×10).
// Výsledky v popisech jsou ověřené testem (test/templates.test.js).

import { createSandbox, key } from './room-core.js'

function build(pieces) {
  const content = createSandbox(13, 10)
  content.cells = {}
  for (const [t, x, y, r = 0, p = 0] of pieces) {
    content.cells[key(x, y)] = { t, r, ...(p ? { p } : {}) }
  }
  return content
}

const MZI = [
  ['Laser', 1, 4],
  ['BeamSplitter', 4, 4, 135],
  ['Mirror', 8, 4, 135],
  ['Mirror', 4, 7, 135],
  ['BeamSplitter', 8, 7, 135],
  ['Detector', 10, 7, 180],
  ['Detector', 8, 9, 90],
]

export const TEMPLATES = [
  {
    id: 'lab',
    name: 'Prázdná laboratoř',
    icon: '🧪',
    desc: 'Jeden laser a prázdná deska – přesně jako „Virtual Lab“ v originální hře.',
    expect: {},
    content: () => createSandbox(13, 10),
  },
  {
    id: 'mzi',
    name: 'Mach–Zehnderův interferometr',
    icon: '🌈',
    desc:
      'Foton se na prvním děliči rozdělí do dvou cest a na druhém se sám se sebou potká. ' +
      'Interference pošle 100 % do pravého detektoru a do spodního nic! Zkus do jedné cesty dát sklo (50/50) nebo dvě skla (100 % dole).',
    expect: { '10,7': 1 },
    content: () => build(MZI),
  },
  {
    id: 'bomb',
    name: 'Test bomby (Elitzur–Vaidman)',
    icon: '💣',
    desc:
      'Jak zjistit, že je v cestě bomba, aniž by vybuchla? Když cvakne spodní detektor (25 %), víme, že tam mina je – ' +
      'a přitom se jí foton „nedotkl“. Bez miny by spodní detektor nikdy necvakl.',
    expect: { '6,4': 0.5, '10,7': 0.25, '8,9': 0.25 },
    content: () => build([...MZI, ['Mine', 6, 4]]),
  },
  {
    id: 'polarizers',
    name: 'Paradox tří polarizátorů',
    icon: '🕶️',
    desc:
      'Dva zkřížené polarizátory (0° a 90°) nepustí nic. Když mezi ně vložíš třetí pod 45°, projde 25 %! ' +
      'Zkus prostřední polarizátor odebrat.',
    expect: { '11,4': 0.25, '6,4': 0.5, '9,4': 0.25 },
    content: () =>
      build([
        ['Laser', 1, 4],
        ['Polarizer', 3, 4, 0],
        ['Polarizer', 6, 4, 45],
        ['Polarizer', 9, 4, 90],
        ['Detector', 11, 4, 180],
      ]),
  },
  {
    id: 'pbs',
    name: 'Polarizační třídička',
    icon: '↔️',
    desc:
      'Laser svítí diagonální polarizací (↗). Polarizační dělič pustí vodorovnou složku rovně a svislou odrazí – 50 : 50. ' +
      'Klepni na laser a změň mu polarizaci.',
    expect: { '10,4': 0.5, '5,1': 0.5 },
    content: () =>
      build([
        ['Laser', 1, 4, 0, 45],
        ['PolarizingBeamSplitter', 5, 4, 0],
        ['Detector', 10, 4, 180],
        ['Detector', 5, 1, 270],
      ]),
  },
  {
    id: 'dice',
    name: 'Kvantová kostka',
    icon: '🎲',
    desc:
      'Tři děliče svazku = čtyři detektory po 25 %. Přepni na „Experiment“ a sleduj, jak náhodně cvakají – ' +
      'skutečný kvantový generátor náhodných čísel.',
    expect: { '10,4': 0.25, '6,8': 0.25, '3,0': 0.25, '10,1': 0.25 },
    content: () =>
      build([
        ['Laser', 1, 4],
        ['BeamSplitter', 3, 4, 45],
        ['BeamSplitter', 6, 4, 135],
        ['BeamSplitter', 3, 1, 45],
        ['Detector', 10, 4, 180],
        ['Detector', 6, 8, 90],
        ['Detector', 3, 0, 270],
        ['Detector', 10, 1, 180],
      ]),
  },
]

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null
}
