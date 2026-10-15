// Kreslení fotonu jako vlnového balíčku – port komponenty AppPhoton z Quantum Game 2.
// Gaussova obálka (fialová) + elektrické pole: výchylka = složka H, barva = složka V.

const N = 96
const SIGMA = 0.3
const K = 20
const zs = Array.from({ length: N }, (_, i) => -1 + (2 * i) / (N - 1))
const gauss = (z) => Math.exp((-z * z) / (2 * SIGMA * SIGMA))
const wavelet = zs.map((z) => [Math.cos(K * z) * gauss(z), Math.sin(K * z) * gauss(z)])

// barevná škála pole: fialová → růžová → žlutá (stejná jako v originále)
const STOPS = [
  [-1, [92, 0, 211]],
  [0, [255, 0, 85]],
  [1, [255, 222, 62]],
]
const BUCKETS = 24
const BUCKET_COLORS = Array.from({ length: BUCKETS + 1 }, (_, i) => {
  const v = -1 + (2 * i) / BUCKETS
  const [a, b] = v < 0 ? [STOPS[0], STOPS[1]] : [STOPS[1], STOPS[2]]
  const t = (v - a[0]) / (b[0] - a[0])
  const c = a[1].map((x, j) => Math.round(x + (b[1][j] - x) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
})

let gaussPath = null
function getGaussPath() {
  if (gaussPath) return gaussPath
  const p = new Path2D()
  zs.forEach((z, i) => (i === 0 ? p.moveTo(z, gauss(z)) : p.lineTo(z, gauss(z))))
  for (let i = N - 1; i >= 0; i--) p.lineTo(zs[i], -gauss(zs[i]))
  p.closePath()
  gaussPath = p
  return p
}

/**
 * @param ctx  2D kontext
 * @param x,y  střed fotonu v pixelech
 * @param dir  0 →, 1 ↑, 2 ←, 3 ↓
 * @param a,b  komplexní amplitudy [re, im] pro H a V
 * @param unit počet pixelů na jednotku (dlaždice = 2.4 jednotky)
 */
export function drawPhoton(ctx, x, y, dir, a, b, unit, alphaScale = 1) {
  const intensity = a[0] * a[0] + a[1] * a[1] + b[0] * b[0] + b[1] * b[1]
  if (intensity < 1e-4) return
  const norm = Math.sqrt(intensity)
  const ar = a[0] / norm
  const ai = a[1] / norm
  const br = b[0] / norm
  const bi = b[1] / norm

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((-dir * Math.PI) / 2)
  ctx.scale(unit, unit)
  ctx.globalAlpha = Math.min(1, intensity) * alphaScale

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, 'rgba(92,0,211,1)')
  g.addColorStop(1, 'rgba(92,0,211,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(92,0,211,1)'
  ctx.fill(getGaussPath())

  // elektrické pole – segmenty seskupené podle barvy
  const ys = new Float32Array(N)
  const cs = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const [w0, w1] = wavelet[i]
    ys[i] = ar * w0 + ai * w1
    cs[i] = br * w0 + bi * w1
  }
  ctx.lineCap = 'round'
  const groups = new Map()
  for (let i = 0; i < N - 1; i++) {
    const avg = (cs[i] + cs[i + 1]) / 2
    const bucket = Math.max(0, Math.min(BUCKETS, Math.round(((avg + 1) / 2) * BUCKETS)))
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(i)
  }
  for (const [bucket, idxs] of groups) {
    const v = -1 + (2 * bucket) / BUCKETS
    ctx.strokeStyle = BUCKET_COLORS[bucket]
    ctx.lineWidth = 0.07 + v * 0.06
    ctx.beginPath()
    for (const i of idxs) {
      ctx.moveTo(zs[i], ys[i])
      ctx.lineTo(zs[i + 1], ys[i + 1])
    }
    ctx.stroke()
  }
  ctx.restore()
}
