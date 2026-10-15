// Katalog prvků: české názvy, vysvětlivky („karty schopností“) a malé ukázkové desky.

import { ELEMENT_SVGS, SVG_DEFS } from './element-svgs.js'

export { SVG_DEFS }

const WALL_SVG =
  '<rect x="2" y="2" width="60" height="60" rx="4" fill="#3C2C50"/><path fill="#5A4278" d="M4 4h27v12H4zM33 4h27v12H33zM4 18h12v12H4zM18 18h27v12H18zM47 18h13v12H47zM4 32h27v12H4zM33 32h27v12H33zM4 46h12v14H4zM18 46h27v14H18zM47 46h13v14H47z"/>'

export function elementSvg(t) {
  if (t === 'Wall') return WALL_SVG
  return ELEMENT_SVGS[t] || '<circle cx="32" cy="32" r="20" fill="#93839c"/>'
}

/** Celé SVG ikony prvku (pro nástroje, karty, tooltipy). */
export function iconSvg(t, rotation = 0, size = 48, extraClass = '') {
  return `<svg class="el-icon ${extraClass}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><g transform="rotate(${-rotation} 32 32)">${elementSvg(
    t,
  )}</g></svg>`
}

// Demo deska: [prvek, x, y, natočení, polarizace]
const demo = (cols, rows, pieces, note) => ({ cols, rows, pieces, note })

export const ELEMENTS = {
  Laser: {
    name: 'Laser',
    en: 'Laser',
    tags: ['Zdroj'],
    color: '#ff0055',
    short: 'Vystřelí jeden foton.',
    what: 'Po spuštění vypustí jediný foton ve směru, kam míří. Klepnutím ho otočíš (4 směry), v kartě mu můžeš změnit polarizaci.',
    physics:
      'Jednofotonový zdroj: vždy jen jeden foton, a přesto se chová jako vlna – může jít „několika cestami najednou“. Polarizace říká, kterým směrem kmitá elektrické pole.',
    math: 'vytvoří stav |x, y, →, H⟩',
    tip: 'Na společné desce může být až 6 laserů – každý střílí vlastní foton a výsledky se sčítají.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Detector', 4, 1, 180]], 'Foton doletí do detektoru: 100 %.'),
  },
  Mirror: {
    name: 'Zrcadlo',
    en: 'Mirror',
    tags: ['Směr'],
    color: '#8468a5',
    short: 'Odrazí foton o 90°.',
    what: 'Odrazí foton do kolmého směru. Klepnutím otočíš o 45°. Když foton letí podél zrcadla (na hranu), zastaví se.',
    physics:
      'Odraz od opticky hustšího prostředí obrátí znaménko svislé polarizace – fázový posun o π. Pro interferenci na tom záleží!',
    math: '/ : |→,H⟩ ↦ |↑,H⟩,  |→,V⟩ ↦ −|↑,V⟩',
    tip: 'Dvě zrcadla a dva děliče svazku = Mach–Zehnderův interferometr.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Mirror', 2, 1, 45], ['Detector', 2, 0, 270]], 'Foton se odrazí nahoru: 100 %.'),
  },
  BeamSplitter: {
    name: 'Dělič svazku',
    en: 'Beam splitter',
    tags: ['Směr', 'Superpozice'],
    color: '#61dbef',
    short: 'Půlka projde, půlka se odrazí.',
    what: 'Tenká skleněná destička: polovina amplitudy projde rovně, polovina se odrazí. Klepnutím otočíš o 45°.',
    physics:
      'Foton se nerozpůlí – je v superpozici obou cest zároveň. Odražená část dostane fázi i (90°). Teprve detektor rozhodne, kde foton „opravdu“ je.',
    math: '|→⟩ ↦ (|→⟩ + i|↑⟩) / √2',
    tip: 'Dva děliče za sebou mohou interferencí poslat 100 % fotonů do jediného výstupu!',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      'Kvantová náhoda: 50 % nahoře, 50 % vpravo.',
    ),
  },
  CoatedBeamSplitter: {
    name: 'Pokovený dělič',
    en: 'Coated beam splitter',
    tags: ['Směr', 'Superpozice'],
    color: '#61dbef',
    short: 'Dělič s odrazivou vrstvou.',
    what: 'Funguje jako dělič svazku – polovinu propustí, polovinu odrazí.',
    physics: 'Skleněná destička s tenkou odrazivou vrstvou. V této hře se chová stejně jako obyčejný dělič.',
    math: '|→⟩ ↦ (|→⟩ + i|↑⟩) / √2',
    tip: 'Objevuje se jen v některých levelech.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['CoatedBeamSplitter', 2, 1, 45], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      '50 % : 50 %.',
    ),
  },
  PolarizingBeamSplitter: {
    name: 'Polarizační dělič',
    en: 'Polarizing beam splitter',
    tags: ['Směr', 'Polarizace'],
    color: '#61dbef',
    short: 'Třídí fotony podle polarizace.',
    what: 'Vodorovnou polarizaci (↔ H) propustí rovně, svislou (↕ V) odrazí. Klepnutím otočíš o 90°.',
    physics:
      'Diagonálně polarizovaný foton je superpozicí H a V – na děliči se tedy rozdělí 50 : 50. Takhle se v laboratořích měří polarizace jednotlivých fotonů.',
    math: '|→,H⟩ ↦ |→,H⟩,  |→,V⟩ ↦ |↑,V⟩',
    tip: 'Zkombinuj s cukrem nebo půlvlnnou destičkou a postav si přepínač.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0, 45], ['PolarizingBeamSplitter', 2, 1, 0], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      'Laser svítí diagonálně (↗): H rovně, V nahoru – 50 : 50.',
    ),
  },
  CornerCube: {
    name: 'Koutový odražeč',
    en: 'Corner cube',
    tags: ['Směr'],
    color: '#8468a5',
    short: 'Pošle foton přesně zpátky.',
    what: 'Ať foton přiletí odkudkoli, vrátí ho stejnou cestou zpět.',
    physics:
      'Tři navzájem kolmá zrcadla – stejný princip mají odrazky na kole nebo odražeče na Měsíci, pomocí kterých se laserem měří vzdálenost Země–Měsíc.',
    math: '|→⟩ ↦ |←⟩,  |↑⟩ ↦ |↓⟩',
    tip: 'Hodí se na Michelsonův interferometr – foton projde dělič dvakrát.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['CornerCube', 4, 1, 0], ['Detector', 2, 0, 270], ['Detector', 2, 2, 90]],
      'Část fotonu se vrátí a na děliči se znovu rozdělí.',
    ),
  },
  Detector: {
    name: 'Detektor',
    en: 'Detector',
    tags: ['Cíl', 'Měření'],
    color: '#77d807',
    short: 'Cvakne, když zachytí foton.',
    what: 'Pohltí foton a zesílí signál na „cvak“. Ukazuje pravděpodobnost, že foton skončí právě tady. V levelech je to tvůj cíl.',
    physics:
      'Měření: dokud foton nikdo nezměřil, je ve superpozici. Detektor ji „zhroutí“ – cvakne s pravděpodobností |amplituda|² (Bornovo pravidlo).',
    math: 'P(cvak) = Σ |⟨x,y,…|ψ⟩|²',
    tip: 'Přepni dole na „Experiment“ a uvidíš jednotlivá náhodná cvaknutí.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Detector', 4, 1, 180]], 'Zachyceno 100 %.'),
  },
  DetectorFour: {
    name: 'Všesměrový detektor',
    en: 'Omnidirectional detector',
    tags: ['Cíl', 'Měření'],
    color: '#77d807',
    short: 'Detektor ze všech stran.',
    what: 'Zachytí foton přilétající z kteréhokoli ze čtyř směrů.',
    physics: 'Stejné měření jako u detektoru, jen bez ohledu na směr letu.',
    math: 'P(cvak) = Σ |amplituda|²',
    tip: 'Šikovný jako univerzální cíl v sandboxu.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['DetectorFour', 3, 1, 0]], 'Zachyceno 100 %.'),
  },
  Rock: {
    name: 'Kámen',
    en: 'Rock',
    tags: ['Pohlcení'],
    color: '#615777',
    short: 'Pohltí foton. Má oči.',
    what: 'Tmavý a neproniknutelný. Co do něj vletí, to zmizí.',
    physics:
      'Kámen je taky „měření“ – když zablokuje jednu cestu interferometru, interference zmizí a foton se začne chovat klasicky (50 : 50).',
    math: '|ψ⟩ ↦ 0',
    tip: 'Polož kámen do jedné cesty Mach–Zehnderu a sleduj, jak se změní výsledky.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Rock', 2, 1, 0], ['Detector', 4, 1, 180]], 'Do detektoru nedoletí nic.'),
  },
  Mine: {
    name: 'Mina',
    en: 'Mine',
    tags: ['Nebezpečí'],
    color: '#ff0055',
    short: 'Nesmí ji trefit ani jeden foton.',
    what: 'Jakmile pohltí foton, vybuchne. V levelech nesmí vybuchnout.',
    physics:
      'Elitzurův–Vaidmanův test bomby: pomocí interference lze zjistit, že v cestě mina je, aniž by vybuchla. Načti si experiment „Test bomby“!',
    math: 'P(💥) = |amplituda na mině|²',
    tip: 'Čím menší pravděpodobnost výbuchu, tím lépe. Sleduj červené procento.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['Mine', 4, 1, 0], ['Detector', 2, 0, 270]],
      'Napůl: 50 % detektor, 50 % výbuch.',
    ),
  },
  Absorber: {
    name: 'Šedý filtr',
    en: 'Absorber',
    tags: ['Pohlcení'],
    color: '#5a4278',
    short: 'Pohltí polovinu fotonů.',
    what: 'Neutrální filtr – s pravděpodobností 50 % foton pohltí, jinak ho propustí beze změny.',
    physics: 'Amplituda se zmenší na 1/√2, takže pravděpodobnost (čtverec amplitudy) klesne na polovinu.',
    math: '|ψ⟩ ↦ |ψ⟩ / √2',
    tip: 'Dva filtry za sebou = projde 25 %.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Absorber', 2, 1, 0], ['Detector', 4, 1, 180]], 'Projde 50 %.'),
  },
  Polarizer: {
    name: 'Polarizátor',
    en: 'Polarizer',
    tags: ['Polarizace', 'Pohlcení'],
    color: '#8468a5',
    short: 'Propustí jen jednu polarizaci.',
    what: 'Propustí složku polarizace rovnoběžnou s jeho osou, kolmou pohltí. Klepnutím otočíš o 45°.',
    physics:
      'Malusův zákon: projde cos²θ. Paradox: dva zkřížené polarizátory nepustí nic, ale když mezi ně vložíš třetí pod 45°, něco projde!',
    math: '|H⟩ ↦ cos θ · (cos θ |H⟩ + sin θ |V⟩)',
    tip: 'Polarizační sluneční brýle fungují stejně.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Polarizer', 2, 1, 45], ['Detector', 4, 1, 180]], 'Pod 45° projde cos²45° = 50 %.'),
  },
  QuarterWavePlate: {
    name: 'Čtvrtvlnná destička',
    en: 'Quarter-wave plate',
    tags: ['Polarizace', 'Fáze'],
    color: '#61dbef',
    short: 'Zpozdí jednu složku o λ/4.',
    what: 'Jednu polarizační složku (podél tmavších čar) zpozdí o čtvrt vlny. Klepnutím otočíš o 45°.',
    physics: 'Správně natočená mění lineární polarizaci na kruhovou a naopak – elektrické pole pak opisuje šroubovici.',
    math: '|∥⟩ ↦ |∥⟩,  |⊥⟩ ↦ i |⊥⟩',
    tip: 'Dvě čtvrtvlnné destičky = jedna půlvlnná.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['QuarterWavePlate', 2, 1, 45], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'Kruhová polarizace se na děliči rozdělí 50 : 50.',
    ),
  },
  HalfWavePlate: {
    name: 'Půlvlnná destička',
    en: 'Half-wave plate',
    tags: ['Polarizace', 'Fáze'],
    color: '#61dbef',
    short: 'Zrcadlí polarizaci podle své osy.',
    what: 'Jednu polarizační složku zpozdí o půl vlny – tím polarizaci „překlopí“ podle své osy. Klepnutím otočíš o 45°.',
    physics: 'Natočená pod 45° změní vodorovnou polarizaci na svislou. Používá se k přesnému nastavování polarizace laserů.',
    math: '|∥⟩ ↦ |∥⟩,  |⊥⟩ ↦ −|⊥⟩',
    tip: 'S polarizačním děličem z ní uděláš přepínač směru.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['HalfWavePlate', 2, 1, 45], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'H → V: dělič pošle 100 % nahoru.',
    ),
  },
  SugarSolution: {
    name: 'Cukerný roztok',
    en: 'Sugar solution',
    tags: ['Polarizace'],
    color: '#faff1f',
    short: 'Otočí polarizaci o 45°.',
    what: 'Sklenice sladké vody, která otočí polarizaci o 45°.',
    physics:
      'Molekula cukru je chirální – není totožná se svým zrcadlovým obrazem. Proto stáčí rovinu polarizace (optická aktivita). Takhle se dřív měřila sladkost vína!',
    math: '|H⟩ ↦ (|H⟩ + |V⟩) / √2',
    tip: 'Dva cukry = otočení o 90°: z H se stane V.',
    demo: demo(
      7,
      3,
      [['Laser', 0, 1, 0], ['SugarSolution', 2, 1, 0], ['SugarSolution', 3, 1, 0], ['PolarizingBeamSplitter', 4, 1, 0], ['Detector', 6, 1, 180], ['Detector', 4, 0, 270]],
      '2 × 45° = 90°: z H je V a dělič ho odrazí nahoru.',
    ),
  },
  FaradayRotator: {
    name: 'Faradayův rotátor',
    en: 'Faraday rotator',
    tags: ['Polarizace', 'Magnetismus'],
    color: '#0071dd',
    short: 'Otáčí polarizaci podle směru letu.',
    what: 'Magnetické pole otočí polarizaci o 45° – foton letící po šipce o +45°, proti šipce o −45°. Kolmo nepropustí nic. 4 polohy.',
    physics:
      'Faradayův jev: světlo v magnetickém poli stáčí polarizaci. Na rozdíl od cukru záleží na směru letu – proto se z něj stavějí optické diody (izolátory).',
    math: 'po šipce: R(+45°),  proti šipce: R(−45°)',
    tip: 'Porovnej s cukrem: pošli foton tam a zpátky přes koutový odražeč.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['FaradayRotator', 2, 1, 0], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'Otočení o 45° → dělič 50 : 50.',
    ),
  },
  Glass: {
    name: 'Sklo',
    en: 'Glass',
    tags: ['Fáze', 'Interference'],
    color: '#61dbef',
    short: 'Zpozdí fázi o λ/4.',
    what: 'Ve skle je světlo pomalejší – fáze fotonu se posune o čtvrt vlny. Pravděpodobnosti se nemění, ale interference ano!',
    physics:
      'Fáze je „neviditelná“ – samotný foton ji neprozradí. Projeví se až když se dvě cesty znovu potkají. Proto je interference tak citlivá.',
    math: '|ψ⟩ ↦ i |ψ⟩',
    tip: 'Dvě skla v jedné cestě interferometru přehodí výstup na druhý detektor.',
    demo: demo(
      6,
      4,
      [
        ['Laser', 0, 0, 0],
        ['BeamSplitter', 2, 0, 135],
        ['Glass', 3, 0, 0],
        ['Mirror', 4, 0, 135],
        ['Glass', 4, 1, 0],
        ['Mirror', 2, 2, 135],
        ['BeamSplitter', 4, 2, 135],
        ['Detector', 5, 2, 180],
        ['Detector', 4, 3, 90],
      ],
      'Interferometr: 2 skla v horní cestě přehodí 100 % do spodního detektoru.',
    ),
  },
  VacuumJar: {
    name: 'Vakuová baňka',
    en: 'Vacuum jar',
    tags: ['Fáze', 'Interference'],
    color: '#61dbef',
    short: 'Předběhne fázi o λ/4.',
    what: 'Opak skla: ve vakuu je světlo nepatrně rychlejší než ve vzduchu, fáze se posune o −λ/4.',
    physics: 'Sklo + vakuová baňka ve stejné cestě se navzájem vyruší.',
    math: '|ψ⟩ ↦ −i |ψ⟩',
    tip: 'Zkus sklo v jedné cestě a baňku ve druhé.',
    demo: demo(
      6,
      4,
      [
        ['Laser', 0, 0, 0],
        ['BeamSplitter', 2, 0, 135],
        ['VacuumJar', 3, 0, 0],
        ['Mirror', 4, 0, 135],
        ['VacuumJar', 4, 1, 0],
        ['Mirror', 2, 2, 135],
        ['BeamSplitter', 4, 2, 135],
        ['Detector', 5, 2, 180],
        ['Detector', 4, 3, 90],
      ],
      'Interferometr: 2 baňky přehodí výstup.',
    ),
  },
  Wall: {
    name: 'Zeď',
    en: 'Wall',
    tags: ['Pohlcení'],
    color: '#5a4278',
    short: 'Další cihla ve zdi.',
    what: 'Pohltí všechno.',
    physics: 'Neprůhledná překážka.',
    math: '|ψ⟩ ↦ 0',
    tip: '',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Wall', 2, 1, 0]], ''),
  },
}

/** Pořadí a skupiny v nabídce nástrojů. */
export const TOOL_GROUPS = [
  { name: 'Zdroj a cíle', items: ['Laser', 'Detector', 'DetectorFour'] },
  { name: 'Směr', items: ['Mirror', 'BeamSplitter', 'PolarizingBeamSplitter', 'CornerCube', 'CoatedBeamSplitter'] },
  { name: 'Polarizace', items: ['Polarizer', 'HalfWavePlate', 'QuarterWavePlate', 'SugarSolution', 'FaradayRotator'] },
  { name: 'Fáze', items: ['Glass', 'VacuumJar'] },
  { name: 'Pohlcení', items: ['Absorber', 'Rock', 'Mine', 'Wall'] },
]

export const POLARIZATION_LABELS = {
  0: { short: 'H', arrow: '↔', name: 'vodorovná' },
  90: { short: 'V', arrow: '↕', name: 'svislá' },
  45: { short: 'D', arrow: '⤢', name: 'diagonální' },
  135: { short: 'A', arrow: '⤡', name: 'antidiagonální' },
}

export function elementName(t) {
  return ELEMENTS[t]?.name || t
}

/** Rod pro hezčí věty v aktivitě („položil zrcadlo“). */
export const ACCUSATIVE = {
  Laser: 'laser',
  Mirror: 'zrcadlo',
  BeamSplitter: 'dělič svazku',
  CoatedBeamSplitter: 'pokovený dělič',
  PolarizingBeamSplitter: 'polarizační dělič',
  CornerCube: 'koutový odražeč',
  Detector: 'detektor',
  DetectorFour: 'všesměrový detektor',
  Rock: 'kámen',
  Mine: 'minu',
  Absorber: 'šedý filtr',
  Polarizer: 'polarizátor',
  QuarterWavePlate: 'čtvrtvlnnou destičku',
  HalfWavePlate: 'půlvlnnou destičku',
  SugarSolution: 'cukerný roztok',
  FaradayRotator: 'Faradayův rotátor',
  Glass: 'sklo',
  VacuumJar: 'vakuovou baňku',
  Wall: 'zeď',
}

/** Obsah ukázkové desky ve formátu room-core. */
export function demoContent(t) {
  const d = ELEMENTS[t]?.demo
  if (!d) return null
  const cells = {}
  for (const [type, x, y, r = 0, p = 0] of d.pieces) cells[`${x},${y}`] = { t: type, r, ...(p ? { p } : {}) }
  return { cols: d.cols, rows: d.rows, cells, tools: null, level: null }
}
