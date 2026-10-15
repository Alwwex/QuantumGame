// Slavné experimenty připravené k načtení do sandboxu (deska 13×10).
// Výsledky v popisech jsou ověřené testem (test/room-core.test.js, hodnoty expect).

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
    icon: '',
    desc: 'Laser a prázdná deska, jako Virtual Lab v původní hře.',
    expect: {},
    content: () => createSandbox(13, 10),
  },
  {
    id: 'mzi',
    name: 'Mach–Zehnderův interferometr',
    icon: '',
    desc:
      'Na prvním děliči se foton dostane do superpozice dvou cest, na druhém cesty interferují a foton vždy skončí v pravém detektoru. ' +
      'Sklo v jedné cestě dá 50 : 50, dvě skla pošlou foton do spodního detektoru.',
    expect: { '10,7': 1 },
    content: () => build(MZI),
  },
  {
    id: 'bomb',
    name: 'Test bomby (Elitzur–Vaidman)',
    icon: '',
    desc:
      'Mina v jedné cestě interferometru vybuchne s pravděpodobností 50 %. Když ale cvakne spodní detektor (25 %), víme, že mina v cestě je, ' +
      'a přitom nevybuchla. Bez miny spodní detektor nikdy necvakne.',
    expect: { '6,4': 0.5, '10,7': 0.25, '8,9': 0.25 },
    content: () => build([...MZI, ['Mine', 6, 4]]),
  },
  {
    id: 'polarizers',
    name: 'Paradox tří polarizátorů',
    icon: '',
    desc:
      'Dva zkřížené polarizátory (0° a 90°) nepropustí nic. Když mezi ně vložíš třetí pod 45°, dorazí do detektoru 25 % fotonů. ' +
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
    name: 'Měření polarizace',
    icon: '',
    desc:
      'Laser vysílá diagonálně polarizované fotony. Polarizační dělič propustí vodorovnou složku a odrazí svislou, výsledek je 50 : 50. ' +
      'Polarizaci laseru změníš v jeho kartě, klávesou P nad laserem nebo Alt+klikem.',
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
    icon: '',
    desc:
      'Tři děliče svazku rozdělí pravděpodobnost mezi čtyři detektory po 25 %. V režimu Experiment je vidět, že jednotlivá cvaknutí jsou náhodná. ' +
      'Jde o kvantový generátor náhodných čísel.',
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
