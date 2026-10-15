// Katalog prvků: české názvy, vysvětlivky („karty schopností“) a malé ukázkové desky.
// Texty se ukazují hráčům i na projektoru, proto jsou psané neosobně (bez tykání i vykání).

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
    short: 'Zdroj jednotlivých fotonů.',
    what: 'Při spuštění simulace vyšle jeden foton směrem, kam míří. Otáčí se po 90°. Polarizace se mění v kartě laseru, klávesou P nad laserem nebo Alt+klikem.',
    physics:
      'Vysílá vždy jen jeden foton. Ten se přesto šíří jako vlna a může projít několika cestami současně. Polarizace udává směr kmitání elektrického pole.',
    math: 'počáteční stav |x, y, →, H⟩',
    tip: 'Na desce může být až 6 laserů. Každý vyšle vlastní foton, simulují se nezávisle a výsledky se sčítají.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Detector', 4, 1, 180]], 'Foton skončí v detektoru: 100 %.'),
  },
  Mirror: {
    name: 'Zrcadlo',
    en: 'Mirror',
    tags: ['Směr'],
    color: '#8468a5',
    short: 'Odrazí foton.',
    what: 'Šikmé zrcadlo stočí foton o 90°, zrcadlo kolmé k dráze ho vrátí zpět. Foton letící podél zrcadla se zastaví. Otáčí se po 45°.',
    physics:
      'Při odrazu zůstane vodorovná složka polarizace beze změny a svislá změní znaménko (fázový posun π). Na výsledek interference to může mít vliv.',
    math: '/ : |→,H⟩ ↦ |↑,H⟩,  |→,V⟩ ↦ −|↑,V⟩',
    tip: 'Dvě zrcadla a dva děliče svazku tvoří Mach–Zehnderův interferometr.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Mirror', 2, 1, 45], ['Detector', 2, 0, 270]], 'Foton se odrazí nahoru do detektoru: 100 %.'),
  },
  BeamSplitter: {
    name: 'Dělič svazku',
    en: 'Beam splitter',
    tags: ['Směr', 'Superpozice'],
    color: '#61dbef',
    short: 'Pošle foton do superpozice dvou cest.',
    what: 'Polopropustná destička. Foton za ní pokračuje dvěma cestami zároveň, rovně a odrazem. Každá má amplitudu 1/√2, tedy pravděpodobnost 50 %. Otáčí se po 45°.',
    physics:
      'Foton se nerozdělí na poloviny, je v superpozici obou cest. Odražená složka získá fázi i (posun o 90°). Kde foton skončí, rozhodne až měření.',
    math: '|→,H⟩ ↦ (|→,H⟩ + i|↑,H⟩) / √2',
    tip: 'Dva děliče a dvě zrcadla tvoří interferometr, který pošle 100 % fotonů do jednoho výstupu.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      '50 % nahoře, 50 % vpravo.',
    ),
  },
  CoatedBeamSplitter: {
    name: 'Pokovený dělič',
    en: 'Coated beam splitter',
    tags: ['Směr', 'Superpozice'],
    color: '#61dbef',
    short: 'Dělič svazku s odrazivou vrstvou.',
    what: 'Funguje jako dělič svazku: každá z obou cest má pravděpodobnost 50 %. Otáčí se po 45°.',
    physics:
      'Destička s odrazivou vrstvou na jedné straně. Ve skutečnosti se fáze odraženého fotonu liší podle strany dopadu; tato simulace ji počítá stejně jako u obyčejného děliče.',
    math: '|→,H⟩ ↦ (|→,H⟩ + i|↑,H⟩) / √2',
    tip: 'V této simulaci je zaměnitelný s obyčejným děličem svazku.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['CoatedBeamSplitter', 2, 1, 45], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      '50 % nahoře, 50 % vpravo.',
    ),
  },
  PolarizingBeamSplitter: {
    name: 'Polarizační dělič',
    en: 'Polarizing beam splitter',
    tags: ['Směr', 'Polarizace'],
    color: '#61dbef',
    short: 'Třídí fotony podle polarizace.',
    what: 'Vodorovně polarizovaný foton (H) propustí rovně, svisle polarizovaný (V) odrazí. Otáčí se po 90°.',
    physics:
      'Diagonálně polarizovaný foton je superpozicí H a V, proto skončí v každém výstupu s pravděpodobností 50 %. Takto se v laboratoři měří polarizace jednotlivých fotonů.',
    math: '|→,H⟩ ↦ |→,H⟩,  |→,V⟩ ↦ |↑,V⟩',
    tip: 'S cukerným roztokem nebo půlvlnnou destičkou z něj vznikne přepínač směru.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0, 45], ['PolarizingBeamSplitter', 2, 1, 0], ['Detector', 2, 0, 270], ['Detector', 4, 1, 180]],
      'Laser je polarizovaný diagonálně: H projde rovně, V se odrazí nahoru, 50 : 50.',
    ),
  },
  CornerCube: {
    name: 'Koutový odražeč',
    en: 'Corner cube',
    tags: ['Směr'],
    color: '#8468a5',
    short: 'Vrátí foton tam, odkud přiletěl.',
    what: 'Ať foton přiletí z kteréhokoli směru, pošle ho zpět po stejné přímce.',
    physics:
      'Tři navzájem kolmá zrcadla. Stejně fungují odrazky na kole i retroreflektory na Měsíci, kterými se laserem měří vzdálenost Země–Měsíc.',
    math: '|→⟩ ↦ |←⟩,  |↑⟩ ↦ |↓⟩',
    tip: 'Dělič svazku a dva odražeče tvoří Michelsonův interferometr.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['CornerCube', 4, 1, 0], ['Detector', 2, 0, 270], ['Detector', 2, 2, 90]],
      'Cesta přes odražeč se vrátí na dělič: 50 % nahoře, 25 % dole, 25 % zpět do laseru.',
    ),
  },
  Detector: {
    name: 'Detektor',
    en: 'Detector',
    tags: ['Měření', 'Cíl'],
    color: '#77d807',
    short: 'Cvakne, když zachytí foton.',
    what: 'Pohltí foton a zaznamená ho. Číslo u detektoru je pravděpodobnost, že foton skončí právě zde. V levelech jsou detektory cílem.',
    physics:
      'Detektor měří polohu fotonu: cvakne s pravděpodobností rovnou součtu |amplituda|² složek, které do něj dorazí (Bornovo pravidlo). Měřením superpozice zanikne.',
    math: 'P(cvak) = Σ |⟨x,y,směr,pol|ψ⟩|²',
    tip: 'V režimu Experiment jsou vidět jednotlivá náhodná cvaknutí.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Detector', 4, 1, 180]], 'Detektor cvakne s pravděpodobností 100 %.'),
  },
  DetectorFour: {
    name: 'Všesměrový detektor',
    en: 'Omnidirectional detector',
    tags: ['Měření', 'Cíl'],
    color: '#77d807',
    short: 'Zachytí foton z kteréhokoli směru.',
    what: 'Detektor, který zachytí foton přilétající z kteréhokoli ze čtyř směrů.',
    physics: 'Stejné měření jako u detektoru, jen nezáleží na tom, odkud foton přiletí.',
    math: 'P(cvak) = Σ |amplituda|²',
    tip: 'Hodí se jako univerzální cíl.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['DetectorFour', 3, 1, 0]], 'Detektor cvakne s pravděpodobností 100 %.'),
  },
  Rock: {
    name: 'Kámen',
    en: 'Rock',
    tags: ['Pohlcení'],
    color: '#615777',
    short: 'Pohltí foton.',
    what: 'Neprůhledná překážka, foton v ní zanikne.',
    physics:
      'Kámen v jedné cestě interferometru působí jako měření, kudy foton letí: interference zmizí a oba detektory cvakají se stejnou pravděpodobností.',
    math: '|ψ⟩ ↦ 0',
    tip: 'Kámen v jedné cestě Mach–Zehnderova interferometru: místo 100 % a 0 % cvakne každý detektor s pravděpodobností 25 %.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Rock', 2, 1, 0], ['Detector', 4, 1, 180]], 'Do detektoru nedoletí nic.'),
  },
  Mine: {
    name: 'Mina',
    en: 'Mine',
    tags: ['Pohlcení', 'Měření'],
    color: '#ff0055',
    short: 'Vybuchne, když pohltí foton.',
    what: 'Pohltí foton a vybuchne. Číslo u miny udává pravděpodobnost výbuchu. V levelech mina vybuchnout nesmí.',
    physics:
      'Elitzurův–Vaidmanův test bomby: díky interferenci lze zjistit, že v cestě mina je, aniž by vybuchla. Viz experiment „Test bomby“.',
    math: 'P(výbuch) = |amplituda na mině|²',
    tip: 'V Mach–Zehnderově interferometru prozradí minu cvaknutí detektoru, který by bez ní nikdy necvakl.',
    demo: demo(
      5,
      3,
      [['Laser', 0, 1, 0], ['BeamSplitter', 2, 1, 45], ['Mine', 4, 1, 0], ['Detector', 2, 0, 270]],
      '50 % detektor, 50 % výbuch.',
    ),
  },
  Absorber: {
    name: 'Šedý filtr',
    en: 'Absorber',
    tags: ['Pohlcení'],
    color: '#5a4278',
    short: 'Pohltí foton s pravděpodobností 50 %.',
    what: 'Neutrální šedý filtr. S pravděpodobností 50 % foton pohltí, jinak ho propustí beze změny.',
    physics:
      'Amplituda se zmenší na 1/√2 původní hodnoty, takže pravděpodobnost (kvadrát absolutní hodnoty amplitudy) klesne na polovinu. Fáze ani polarizace se nemění.',
    math: '|ψ⟩ ↦ |ψ⟩ / √2',
    tip: 'Dva filtry za sebou propustí 25 %.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Absorber', 2, 1, 0], ['Detector', 4, 1, 180]], 'Filtr pohltí 50 %, detektor zachytí 50 %.'),
  },
  Polarizer: {
    name: 'Polarizátor',
    en: 'Polarizer',
    tags: ['Polarizace', 'Pohlcení'],
    color: '#8468a5',
    short: 'Propustí jen jednu polarizaci.',
    what: 'Propustí složku polarizace rovnoběžnou se svou osou, kolmou složku pohltí. Otáčí se po 45°.',
    physics:
      'Malusův zákon: foton projde s pravděpodobností cos²θ, kde θ je úhel mezi jeho polarizací a osou polarizátoru. Za polarizátorem je polarizovaný podél osy.',
    math: '|H⟩ ↦ cos θ · (cos θ |H⟩ + sin θ |V⟩)',
    tip: 'Dva zkřížené polarizátory nepropustí nic. Třetí vložený mezi ně pod 45° propustí 25 %.',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Polarizer', 2, 1, 45], ['Detector', 4, 1, 180]], 'Pod 45° projde cos²45° = 50 %.'),
  },
  QuarterWavePlate: {
    name: 'Čtvrtvlnná destička',
    en: 'Quarter-wave plate',
    tags: ['Polarizace', 'Fáze'],
    color: '#61dbef',
    short: 'Zpozdí jednu složku polarizace o λ/4.',
    what: 'Jednu složku polarizace zpozdí vůči druhé o čtvrt vlny (fázový posun 90°). Otáčí se po 45°.',
    physics:
      'Natočená pod 45° k rovině polarizace mění lineární polarizaci na kruhovou a naopak. Vyrábí se z dvojlomných krystalů, například z křemene nebo slídy.',
    math: '|∥⟩ ↦ |∥⟩,  |⊥⟩ ↦ i |⊥⟩',
    tip: 'Dvě stejně natočené čtvrtvlnné destičky působí jako jedna půlvlnná.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['QuarterWavePlate', 2, 1, 45], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'Kruhová polarizace: polarizační dělič dá 50 : 50.',
    ),
  },
  HalfWavePlate: {
    name: 'Půlvlnná destička',
    en: 'Half-wave plate',
    tags: ['Polarizace', 'Fáze'],
    color: '#61dbef',
    short: 'Překlopí polarizaci podle své osy.',
    what: 'Jednu složku polarizace zpozdí o půl vlny, čímž polarizaci překlopí podle své osy. Otáčí se po 45°.',
    physics:
      'Natočená pod 45° změní vodorovnou polarizaci na svislou a naopak. V laboratoři se používá k nastavení polarizace laseru.',
    math: '|∥⟩ ↦ |∥⟩,  |⊥⟩ ↦ −|⊥⟩',
    tip: 'S polarizačním děličem z ní vznikne přepínač směru.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['HalfWavePlate', 2, 1, 45], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'Z H je V, polarizační dělič ho odrazí nahoru: 100 %.',
    ),
  },
  SugarSolution: {
    name: 'Cukerný roztok',
    en: 'Sugar solution',
    tags: ['Polarizace'],
    color: '#faff1f',
    short: 'Stočí polarizaci o 45°.',
    what: 'Roztok cukru ve vodě. Stočí rovinu polarizace o 45°.',
    physics:
      'Molekuly cukru jsou chirální (liší se od svého zrcadlového obrazu), a proto stáčejí rovinu polarizace. Jev se nazývá optická aktivita a využívá se k měření koncentrace cukru.',
    math: '|H⟩ ↦ (|H⟩ + |V⟩) / √2',
    tip: 'Dva roztoky za sebou stočí polarizaci o 90°: z H se stane V.',
    demo: demo(
      7,
      3,
      [['Laser', 0, 1, 0], ['SugarSolution', 2, 1, 0], ['SugarSolution', 3, 1, 0], ['PolarizingBeamSplitter', 4, 1, 0], ['Detector', 6, 1, 180], ['Detector', 4, 0, 270]],
      'Dvakrát 45° je 90°: z H je V a polarizační dělič ho odrazí nahoru.',
    ),
  },
  FaradayRotator: {
    name: 'Faradayův rotátor',
    en: 'Faraday rotator',
    tags: ['Polarizace', 'Magnetismus'],
    color: '#0071dd',
    short: 'Stáčí polarizaci podle směru letu.',
    what: 'Stočí polarizaci o 45°: ve směru šipky o +45°, proti šipce o −45°. Foton letící napříč pohltí. Otáčí se po 90°.',
    physics:
      'Faradayův jev: magnetické pole v průhledném materiálu stáčí rovinu polarizace. Na rozdíl od cukru se stočení při cestě tam a zpět nevyruší, ale sečte. Využívá se v optických izolátorech.',
    math: 'po šipce: R(+45°),  proti šipce: R(−45°)',
    tip: 'Rotátor a kolmé zrcadlo za ním: po cestě tam a zpět je z H polarizace V. Cukerný roztok by ji vrátil na H.',
    demo: demo(
      6,
      3,
      [['Laser', 0, 1, 0], ['FaradayRotator', 2, 1, 0], ['PolarizingBeamSplitter', 3, 1, 0], ['Detector', 5, 1, 180], ['Detector', 3, 0, 270]],
      'Stočení o 45°: polarizační dělič dá 50 : 50.',
    ),
  },
  Glass: {
    name: 'Sklo',
    en: 'Glass',
    tags: ['Fáze', 'Interference'],
    color: '#61dbef',
    short: 'Zpozdí fázi fotonu o čtvrt vlny.',
    what: 'Ve skle se světlo šíří pomaleji, takže se fáze fotonu posune o čtvrt vlny. Pravděpodobnosti se nezmění, výsledek interference ano.',
    physics:
      'Fázi jednoho fotonu nelze přímo změřit. Projeví se, až když se dvě cesty znovu setkají a interferují. Na zpoždění červeného světla o λ/4 stačí vrstva skla tlustá 0,35 µm.',
    math: '|ψ⟩ ↦ i |ψ⟩',
    tip: 'Sklo v jedné cestě interferometru dá 50 : 50, dvě skla přepnou výstup na druhý detektor.',
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
      'Dvě skla v horní cestě přepnou výstup: 100 % ve spodním detektoru.',
    ),
  },
  VacuumJar: {
    name: 'Vakuová baňka',
    en: 'Vacuum jar',
    tags: ['Fáze', 'Interference'],
    color: '#61dbef',
    short: 'Posune fázi fotonu o −λ/4.',
    what: 'Opak skla: ve vakuu je světlo nepatrně rychlejší než ve vzduchu, takže fáze fotonu se posune o čtvrt vlny dopředu.',
    physics:
      'Index lomu vzduchu je asi 1,0003. Aby se fáze červeného světla posunula o λ/4, stačí nahradit vzduch vakuem v délce asi 0,6 mm.',
    math: '|ψ⟩ ↦ −i |ψ⟩',
    tip: 'Sklo a vakuová baňka ve stejné cestě se navzájem vyruší.',
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
      'Dvě baňky v horní cestě také přepnou výstup: 100 % dole.',
    ),
  },
  Wall: {
    name: 'Zeď',
    en: 'Wall',
    tags: ['Pohlcení'],
    color: '#5a4278',
    short: 'Pohltí foton.',
    what: 'Neprůhledná překážka.',
    physics: 'Foton v ní zanikne stejně jako v kameni.',
    math: '|ψ⟩ ↦ 0',
    tip: '',
    demo: demo(5, 3, [['Laser', 0, 1, 0], ['Wall', 2, 1, 0]], ''),
  },
}

/** Pořadí a skupiny v nabídce nástrojů. */
export const TOOL_GROUPS = [
  { name: 'Zdroj a detektory', items: ['Laser', 'Detector', 'DetectorFour'] },
  { name: 'Zrcadla a děliče', items: ['Mirror', 'BeamSplitter', 'PolarizingBeamSplitter', 'CornerCube', 'CoatedBeamSplitter'] },
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

/** 4. pád názvu prvku pro věty v aktivitě („přidává zrcadlo“). */
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
