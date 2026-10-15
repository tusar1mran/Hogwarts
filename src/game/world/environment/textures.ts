import { CanvasTexture, ClampToEdgeWrapping, LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three'
import { createRng } from '../../core/math'
import { fbm2 } from '../../core/noise'

/**
 * Procedurally generated texture sets. These replace photographic texture assets so the
 * game ships with no third-party image dependencies; they can be swapped for authored
 * PBR textures by changing `materials.ts` only.
 */

export interface PbrSet {
  map: Texture
  normalMap: Texture
  roughnessMap: Texture
}

type Ctx = CanvasRenderingContext2D

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function finish(c: HTMLCanvasElement, srgb: boolean, repeat = true): Texture {
  const t = new CanvasTexture(c)
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace
  t.wrapS = t.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** Builds colour, normal and roughness textures from a shared height function. */
function buildPbr(
  size: number,
  sample: (u: number, v: number) => { height: number; r: number; g: number; b: number; rough: number },
  normalStrength: number,
): PbrSet {
  const [cc, cctx] = canvas(size)
  const [nc, nctx] = canvas(size)
  const [rc, rctx] = canvas(size)
  const color = cctx.createImageData(size, size)
  const normal = nctx.createImageData(size, size)
  const rough = rctx.createImageData(size, size)
  const heights = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sample(x / size, y / size)
      const i = y * size + x
      heights[i] = s.height
      color.data[i * 4] = s.r
      color.data[i * 4 + 1] = s.g
      color.data[i * 4 + 2] = s.b
      color.data[i * 4 + 3] = 255
      const rv = Math.max(0, Math.min(255, s.rough * 255))
      rough.data[i * 4] = rough.data[i * 4 + 1] = rough.data[i * 4 + 2] = rv
      rough.data[i * 4 + 3] = 255
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = heights[y * size + ((x - 1 + size) % size)]
      const r = heights[y * size + ((x + 1) % size)]
      const u = heights[((y - 1 + size) % size) * size + x]
      const d = heights[((y + 1) % size) * size + x]
      let nx = (l - r) * normalStrength
      let ny = (u - d) * normalStrength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * size + x) * 4
      normal.data[i] = (nx * 0.5 + 0.5) * 255
      normal.data[i + 1] = (ny * 0.5 + 0.5) * 255
      normal.data[i + 2] = (nz * 0.5 + 0.5) * 255
      normal.data[i + 3] = 255
    }
  }
  cctx.putImageData(color, 0, 0)
  nctx.putImageData(normal, 0, 0)
  rctx.putImageData(rough, 0, 0)
  return { map: finish(cc, true), normalMap: finish(nc, false), roughnessMap: finish(rc, false) }
}

interface BlockOptions {
  rows: number
  cols: number
  base: [number, number, number]
  variation: number
  mortar: number
  seed: number
  mortarColor: [number, number, number]
}

/** Ashlar stone blocks in running bond, with chipped edges and per-block tint. */
export function stoneBlocks(o: BlockOptions, size = 512): PbrSet {
  const rng = createRng(o.seed)
  const tints: number[] = []
  for (let i = 0; i < o.rows * o.cols * 2; i++) tints.push(rng())
  return buildPbr(
    size,
    (u, v) => {
      const row = Math.floor(v * o.rows)
      const offset = row % 2 === 0 ? 0 : 0.5
      const cu = u * o.cols + offset
      const col = Math.floor(cu)
      const fu = cu - col
      const fv = v * o.rows - row
      const edge = Math.min(fu, 1 - fu, (fv * o.cols) / o.rows, ((1 - fv) * o.cols) / o.rows)
      const chip = fbm2(u * 40 + 3, v * 40, 3) * 0.02
      const inMortar = edge < o.mortar + chip
      const tint = tints[(row * o.cols + (((col % o.cols) + o.cols) % o.cols)) % tints.length]
      const grain = fbm2(u * 24, v * 24, 4)
      const fine = fbm2(u * 120, v * 120, 2)
      if (inMortar) {
        const m = o.mortarColor
        const k = 0.85 + fine * 0.15
        return { height: 0, r: m[0] * k, g: m[1] * k, b: m[2] * k, rough: 0.95 }
      }
      const bevel = Math.min(1, (edge - o.mortar) * 18)
      const k = 1 + (tint - 0.5) * o.variation + grain * 0.18 + fine * 0.06
      const stain = Math.max(0, fbm2(u * 6 + 9, v * 3, 3)) * 0.35
      return {
        height: 0.55 * bevel + grain * 0.25 + fine * 0.08,
        r: o.base[0] * k * (1 - stain * 0.5),
        g: o.base[1] * k * (1 - stain * 0.45),
        b: o.base[2] * k * (1 - stain * 0.3),
        rough: 0.78 + grain * 0.12,
      }
    },
    6,
  )
}

/** Overlapping slate shingles for roofs. */
export function slateRoof(size = 512): PbrSet {
  const rows = 14
  const cols = 9
  const rng = createRng(77)
  const tints = Array.from({ length: rows * cols * 2 }, () => rng())
  return buildPbr(
    size,
    (u, v) => {
      const row = Math.floor(v * rows)
      const offset = row % 2 ? 0.5 : 0
      const cu = u * cols + offset
      const col = Math.floor(cu)
      const fu = cu - col
      const fv = v * rows - row
      // Rounded shingle bottoms.
      const curve = Math.pow(Math.abs(fu - 0.5) * 2, 2) * 0.22
      const inGap = fv > 1 - curve - 0.04 || fu < 0.03 || fu > 0.97
      const t = tints[(row * cols + (((col % cols) + cols) % cols)) % tints.length]
      const n = fbm2(u * 50, v * 50, 3)
      const k = 0.8 + t * 0.35 + n * 0.1
      if (inGap) return { height: 0, r: 18, g: 20, b: 26, rough: 0.9 }
      return { height: 0.3 + fv * 0.6 + n * 0.1, r: 52 * k, g: 58 * k, b: 74 * k, rough: 0.55 + n * 0.15 }
    },
    5,
  )
}

/** Dark varnished planks. */
export function woodPlanks(size = 512, tone: [number, number, number] = [92, 60, 38]): PbrSet {
  const planks = 6
  const rng = createRng(13)
  const tints = Array.from({ length: planks * 4 }, () => rng())
  return buildPbr(
    size,
    (u, v) => {
      const p = Math.floor(u * planks)
      const fu = u * planks - p
      const seg = Math.floor(v * 2 + (p % 2) * 0.5)
      const t = tints[(p * 2 + seg) % tints.length]
      const grain = Math.sin((v * 60 + fbm2(u * 8, v * 2, 3) * 6) * Math.PI) * 0.5 + 0.5
      const gap = fu < 0.025 || fu > 0.975
      const k = 0.75 + t * 0.4 + grain * 0.15
      if (gap) return { height: 0, r: 25, g: 16, b: 10, rough: 0.9 }
      return { height: 0.5 + grain * 0.15, r: tone[0] * k, g: tone[1] * k, b: tone[2] * k, rough: 0.5 + grain * 0.2 }
    },
    3,
  )
}

/** Large worn flagstones for interior floors and the courtyard. */
export function flagstones(size = 512): PbrSet {
  return stoneBlocks(
    { rows: 4, cols: 4, base: [118, 112, 104], variation: 0.35, mortar: 0.02, seed: 5, mortarColor: [50, 46, 42] },
    size,
  )
}

/** Tileable grayscale detail used to break up terrain vertex colours. */
export function terrainDetail(size = 512): PbrSet {
  return buildPbr(
    size,
    (u, v) => {
      const n = fbm2(u * 32, v * 32, 5) * 0.5 + 0.5
      const f = fbm2(u * 140, v * 140, 2) * 0.5 + 0.5
      const c = 170 + n * 60 + f * 25
      return { height: n * 0.7 + f * 0.3, r: c, g: c, b: c, rough: 0.85 + f * 0.1 }
    },
    3,
  )
}

/** Book spines filling a shelf, used on bookcase fronts. */
export function bookSpines(size = 512): Texture {
  const [c, ctx] = canvas(size)
  const rng = createRng(31)
  const palette = ['#5b1f24', '#22344f', '#2f4a2c', '#5a4320', '#3b2547', '#6b5a3a', '#1f2a2f', '#7a3b22']
  ctx.fillStyle = '#1a120c'
  ctx.fillRect(0, 0, size, size)
  const shelves = 5
  const shelfH = size / shelves
  for (let s = 0; s < shelves; s++) {
    let x = 0
    const top = s * shelfH
    while (x < size) {
      const w = 6 + rng() * 14
      const h = shelfH * (0.62 + rng() * 0.3)
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)]
      ctx.fillRect(x, top + shelfH - h - 6, w - 1, h)
      ctx.fillStyle = 'rgba(214,180,100,0.55)'
      ctx.fillRect(x + 1, top + shelfH - h + 6, w - 3, 2)
      ctx.fillRect(x + 1, top + shelfH - 18, w - 3, 2)
      if (rng() > 0.85) x += 8 + rng() * 10
      x += w
    }
    ctx.fillStyle = '#3a2618'
    ctx.fillRect(0, top + shelfH - 6, size, 6)
  }
  return finish(c, true)
}

/** Pointed stained-glass window, used as an emissive map. */
export function stainedGlass(size = 256): Texture {
  const [c, ctx] = canvas(size)
  const rng = createRng(101)
  ctx.fillStyle = '#120c08'
  ctx.fillRect(0, 0, size, size)
  const colors = ['#f2b55c', '#d9893a', '#6f9fd8', '#c0503f', '#e8d38a', '#8f6bc8']
  const cell = size / 8
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)]
      ctx.globalAlpha = 0.65 + rng() * 0.35
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4)
    }
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#0c0805'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(size / 2, size * 0.35, size * 0.2, 0, Math.PI * 2)
  ctx.moveTo(size / 2, 0)
  ctx.lineTo(size / 2, size)
  ctx.moveTo(0, size * 0.62)
  ctx.lineTo(size, size * 0.62)
  ctx.stroke()
  return finish(c, true, false)
}

/** Soft radial glow sprite for flames, particles and fog. */
export function radialGlow(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): Texture {
  const [c, ctx] = canvas(size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'))
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return finish(c, true, false)
}

/** Wispy fog puff for layered mist. */
export function fogPuff(size = 256): Texture {
  const [c, ctx] = canvas(size)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5
      const dy = y / size - 0.5
      const r = Math.hypot(dx, dy) * 2
      const n = fbm2(x * 0.025, y * 0.025, 4) * 0.5 + 0.5
      const a = Math.max(0, 1 - r) ** 1.6 * (0.45 + n * 0.75)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = Math.min(255, a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return finish(c, true, false)
}

/** Academy banner: deep blue field with a gold star-and-tower crest (original design). */
export function bannerTexture(size = 256): Texture {
  const [c, ctx] = canvas(size)
  ctx.fillStyle = '#1b2748'
  ctx.fillRect(0, 0, size, size * 2)
  ctx.fillStyle = '#c9a85a'
  ctx.fillRect(0, 0, size, 10)
  ctx.fillRect(10, 0, 6, size)
  ctx.fillRect(size - 16, 0, 6, size)
  ctx.beginPath()
  const cx = size / 2
  const cy = size * 0.42
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size * 0.2 : size * 0.08
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const fn = i === 0 ? 'moveTo' : 'lineTo'
    ctx[fn](cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(cx - 14, size * 0.66, 28, size * 0.22)
  ctx.fillRect(cx - 24, size * 0.62, 48, 10)
  return finish(c, true, false)
}

/** Grayscale wave normal map for water. */
export function waterNormals(size = 256): Texture {
  const [c, ctx] = canvas(size)
  const img = ctx.createImageData(size, size)
  const h = (x: number, y: number) =>
    fbm2((x / size) * 8, (y / size) * 8, 4) + Math.sin((x / size) * Math.PI * 8) * 0.15
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (h(x - 1, y) - h(x + 1, y)) * 3
      const ny = (h(x, y - 1) - h(x, y + 1)) * 3
      const len = Math.hypot(nx, ny, 1)
      const i = (y * size + x) * 4
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return finish(c, false)
}
