import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector2,
} from 'three'

/**
 * Cached, UV-correct geometry builders for architecture. UVs are scaled to world size so
 * textures keep a constant texel density on any module size (one texture repeat = `tile` metres).
 */

const cache = new Map<string, BufferGeometry>()

function cached<T extends BufferGeometry>(key: string, build: () => T): T {
  let g = cache.get(key) as T | undefined
  if (!g) {
    g = build()
    cache.set(key, g)
  }
  return g
}

const k = (...parts: number[]) => parts.map((p) => p.toFixed(3)).join(':')

/** Box whose UVs repeat every `tile` metres on every face. */
export function scaledBox(w: number, h: number, d: number, tile = 3): BoxGeometry {
  return cached(`box:${k(w, h, d, tile)}`, () => {
    const g = new BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
    const dims: Array<[number, number]> = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ]
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile)
      }
    }
    uv.needsUpdate = true
    return g
  })
}

function scaleCylinderUv(g: BufferGeometry, circumference: number, height: number, tile: number) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circumference) / tile, (uv.getY(i) * height) / tile)
  uv.needsUpdate = true
}

export function towerBody(radius: number, height: number, segments = 28, tile = 3) {
  return cached(`tower:${k(radius, height, segments)}`, () => {
    const g = new CylinderGeometry(radius, radius * 1.04, height, segments, 1, true)
    scaleCylinderUv(g, Math.PI * 2 * radius, height, tile)
    return g
  })
}

export function solidCylinder(rTop: number, rBottom: number, height: number, segments = 20, tile = 3) {
  return cached(`cyl:${k(rTop, rBottom, height, segments)}`, () => {
    const g = new CylinderGeometry(rTop, rBottom, height, segments)
    scaleCylinderUv(g, Math.PI * 2 * Math.max(rTop, rBottom), height, tile)
    return g
  })
}

/** Slightly concave spire roof with a flared eave. */
export function spireRoof(radius: number, height: number, segments = 24) {
  return cached(`spire:${k(radius, height, segments)}`, () => {
    const pts: Vector2[] = []
    const n = 12
    pts.push(new Vector2(radius * 1.22, -0.4))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const r = radius * 1.15 * Math.pow(1 - t, 1.35)
      pts.push(new Vector2(Math.max(r, 0.02), t * height))
    }
    const g = new LatheGeometry(pts, segments)
    scaleCylinderUv(g, Math.PI * 2 * radius, height, 2.5)
    return g
  })
}

export function ring(radius: number, tube: number) {
  return cached(`ring:${k(radius, tube)}`, () => new TorusGeometry(radius, tube, 6, 36))
}

/** Column with moulded base and capital, height measured from the floor. */
export function columnGeometry(radius: number, height: number) {
  return cached(`column:${k(radius, height)}`, () => {
    const r = radius
    const pts = [
      [0, 0],
      [r * 1.55, 0],
      [r * 1.55, 0.35],
      [r * 1.3, 0.5],
      [r * 1.1, 0.62],
      [r, 0.8],
      [r * 0.94, height - 1.1],
      [r * 1.05, height - 0.9],
      [r * 1.12, height - 0.75],
      [r * 1.5, height - 0.35],
      [r * 1.6, height - 0.3],
      [r * 1.6, height],
      [0, height],
    ].map(([x, y]) => new Vector2(x, y))
    const g = new LatheGeometry(pts, 20)
    scaleCylinderUv(g, Math.PI * 2 * r, height, 2)
    return g
  })
}

/** Outline of a pointed (two-centred) gothic arch, from the springing line upwards. */
function pointedArchPoints(width: number, rise: number, segments = 10): Vector2[] {
  const half = width / 2
  // Radius of each arc so that the two arcs meet at the apex `rise` above the springing line.
  const radius = (half * half + rise * rise) / (2 * half)
  const pts: Vector2[] = []
  // Left arc: centre at (radius - half, 0) relative to the left jamb at (-half, 0).
  const cxL = -half + radius
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const yy = t * rise
    const xx = cxL - Math.sqrt(Math.max(0, radius * radius - yy * yy))
    pts.push(new Vector2(xx, yy))
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments
    const yy = t * rise
    const xx = -(cxL - Math.sqrt(Math.max(0, radius * radius - yy * yy)))
    pts.push(new Vector2(xx, yy))
  }
  return pts
}

/** Solid infill between a rectangle's top and a pointed arch (the spandrels), extruded to `depth`. */
export function archSpandrel(width: number, rise: number, depth: number) {
  return cached(`spandrel:${k(width, rise, depth)}`, () => {
    const half = width / 2
    const s = new Shape()
    s.moveTo(-half, 0)
    s.lineTo(-half, rise)
    s.lineTo(half, rise)
    s.lineTo(half, 0)
    const pts = pointedArchPoints(width, rise).reverse()
    for (const p of pts) s.lineTo(p.x, p.y)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 })
    g.translate(0, 0, -depth / 2)
    scaleUvPlanar(g, 3)
    return g
  })
}

/** Moulded frame around a pointed opening (jambs + arch), extruded to `depth`. */
export function archFrame(width: number, springHeight: number, rise: number, band: number, depth: number) {
  return cached(`archframe:${k(width, springHeight, rise, band, depth)}`, () => {
    const outer = new Shape()
    const half = width / 2 + band
    const outerPts = pointedArchPoints(width + band * 2, rise + band * 1.2)
    outer.moveTo(-half, -springHeight)
    for (const p of outerPts) outer.lineTo(p.x, p.y)
    outer.lineTo(half, -springHeight)
    outer.closePath()
    const hole = new Path()
    const innerPts = pointedArchPoints(width, rise)
    hole.moveTo(-width / 2, -springHeight)
    for (const p of innerPts) hole.lineTo(p.x, p.y)
    hole.lineTo(width / 2, -springHeight)
    hole.closePath()
    outer.holes.push(hole)
    const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 4 })
    g.translate(0, springHeight, -depth / 2)
    scaleUvPlanar(g, 2)
    return g
  })
}

/** Flat pointed-arch pane (glass), origin at bottom centre. */
export function gothicPane(width: number, height: number) {
  return cached(`pane:${k(width, height)}`, () => {
    const rise = Math.min(width * 0.9, height * 0.45)
    const spring = height - rise
    const s = new Shape()
    s.moveTo(-width / 2, 0)
    for (const p of pointedArchPoints(width, rise)) s.lineTo(p.x, p.y + spring)
    s.lineTo(width / 2, 0)
    s.closePath()
    const g = new ShapeGeometry(s, 4)
    // Normalise UVs to 0..1 so the stained-glass texture fills the pane.
    const uv = g.attributes.uv
    const pos = g.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height)
    uv.needsUpdate = true
    return g
  })
}

function scaleUvPlanar(g: BufferGeometry, tile: number) {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile)
  uv.needsUpdate = true
}

/** Triangular prism used for gable ends. Origin at bottom centre, extends along Z by depth. */
export function gableEnd(width: number, rise: number, depth: number) {
  return cached(`gable:${k(width, rise, depth)}`, () => {
    const s = new Shape()
    s.moveTo(-width / 2, 0)
    s.lineTo(0, rise)
    s.lineTo(width / 2, 0)
    s.closePath()
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false })
    g.translate(0, 0, -depth / 2)
    scaleUvPlanar(g, 3)
    return g
  })
}

export function plane(w: number, h: number, tile = 0) {
  return cached(`plane:${k(w, h, tile)}`, () => {
    const g = new PlaneGeometry(w, h)
    if (tile > 0) {
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile)
      uv.needsUpdate = true
    }
    return g
  })
}

export function disposeGeometryCache() {
  cache.forEach((g) => g.dispose())
  cache.clear()
}
