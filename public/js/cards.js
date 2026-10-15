// „Karty schopností“ – jako ukázka schopností šampiona v LoL:
// ikona, štítky, animovaná ukázka na mini desce a vysvětlení (co dělá / fyzika / matematika / tip).

import { ELEMENTS, demoContent, iconSvg, POLARIZATION_LABELS } from './elements.js'
import { ELEMENT_META } from './room-core.js'
import { simulate } from './qt.js'
import { DemoPlayer } from './board.js'
import { h } from './dom.js'

const simCache = new Map()
function demoSim(t) {
  if (!simCache.has(t)) {
    const content = demoContent(t)
    simCache.set(t, content ? { content, sim: simulate(content) } : null)
  }
  return simCache.get(t)
}

/**
 * @param t typ prvku
 * @param opts { compact, piece, actions: [{label, onClick, kind, title}], onClose, demo (bool) }
 * @returns { el, destroy }
 */
export function abilityCard(t, opts = {}) {
  const info = ELEMENTS[t]
  if (!info) return { el: h('div'), destroy() {} }
  const rotations = ELEMENT_META[t]?.rotations ?? 1
  const piece = opts.piece

  const demoHost = h('div', { class: 'ac-demo-board' })
  const demoNote = info.demo?.note ? h('div', { class: 'ac-demo-note' }, info.demo.note) : null

  const rows = [
    ['Co dělá', info.what],
    ['Fyzika', info.physics],
    ['Matematika', info.math, 'mono'],
    ['Tip', info.tip],
  ].filter(([, v]) => v)

  const meta = []
  if (rotations > 1) meta.push(`⟲ ${rotations} ${rotations === 4 ? 'polohy' : 'poloh'}`)
  else meta.push('neotáčí se')
  if (piece?.lk === 2) meta.push('🔩 přišroubovaný')
  else if (piece?.lk === 1) meta.push('📌 jen otáčet')
  if (piece && t === 'Laser') {
    const pl = POLARIZATION_LABELS[piece.p || 0]
    meta.push(`polarizace ${pl.arrow} ${pl.short}`)
  }

  const el = h(
    'div',
    { class: `ability-card ${opts.compact ? 'compact' : ''}`, style: { '--accent': info.color || '#ff0055' } },
    h(
      'div',
      { class: 'ac-head' },
      h('div', { class: 'ac-icon', html: iconSvg(t, piece?.r || 0, 56) }),
      h(
        'div',
        { class: 'ac-title' },
        h('div', { class: 'ac-name' }, info.name),
        h('div', { class: 'ac-en' }, info.en),
        h('div', { class: 'ac-tags' }, info.tags.map((tag) => h('span', { class: 'ac-tag' }, tag))),
      ),
      opts.onClose ? h('button', { class: 'ac-close', 'aria-label': 'Zavřít', onClick: opts.onClose }, '×') : null,
    ),
    opts.demo === false ? null : h('div', { class: 'ac-demo' }, demoHost, demoNote),
    h('div', { class: 'ac-short' }, info.short),
    opts.compact
      ? h('p', { class: 'ac-what' }, info.what)
      : h(
          'dl',
          { class: 'ac-rows' },
          rows.map(([k, v, cls]) => [h('dt', {}, k), h('dd', { class: cls || '' }, v)]),
        ),
    h('div', { class: 'ac-meta' }, meta.join(' · ')),
    opts.actions?.length
      ? h(
          'div',
          { class: 'ac-actions' },
          opts.actions.map((a) => h('button', { class: `btn ${a.kind || ''}`, title: a.title || '', onClick: a.onClick }, a.label)),
        )
      : null,
  )

  let player = null
  if (opts.demo !== false) {
    const d = demoSim(t)
    if (d) {
      // board potřebuje znát velikost hostitele – spustíme až po vložení do DOM
      requestAnimationFrame(() => {
        if (!el.isConnected) return
        player = new DemoPlayer(demoHost, d.content, d.sim)
      })
    }
  }
  return {
    el,
    destroy() {
      player?.destroy()
      player = null
    },
  }
}
