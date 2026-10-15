import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Texture,
} from 'three'
import * as tex from './textures'

/**
 * Shared material library. Every architectural module reuses these instances, so the
 * castle compiles a handful of shader programs and uploads each texture once.
 */
export interface MaterialLibrary {
  stoneWall: MeshStandardMaterial
  stoneDark: MeshStandardMaterial
  stoneTrim: MeshStandardMaterial
  floor: MeshStandardMaterial
  cobble: MeshStandardMaterial
  roof: MeshStandardMaterial
  wood: MeshStandardMaterial
  woodLight: MeshStandardMaterial
  bookshelf: MeshStandardMaterial
  glassWarm: MeshStandardMaterial
  glassCool: MeshStandardMaterial
  iron: MeshStandardMaterial
  brass: MeshStandardMaterial
  wax: MeshStandardMaterial
  flame: MeshBasicMaterial
  banner: MeshStandardMaterial
  fabricRed: MeshStandardMaterial
  terrainDetail: tex.PbrSet
  glow: Texture
  fog: Texture
  waterNormals: Texture
}

let library: MaterialLibrary | null = null

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0))

function pbr(set: tex.PbrSet, opts: { color?: string; roughness?: number; normalScale?: number } = {}) {
  const m = new MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: opts.roughness ?? 1,
    metalness: 0,
    color: opts.color ? new Color(opts.color) : new Color('#ffffff'),
  })
  const s = opts.normalScale ?? 1
  m.normalScale.set(s, s)
  return m
}

/** Generates textures in small slices so the loading screen keeps animating. */
export async function buildMaterials(onProgress: (fraction: number, label: string) => void): Promise<MaterialLibrary> {
  if (library) return library
  const steps: Array<[string, () => unknown]> = []
  const out: Partial<Record<string, unknown>> = {}
  const add = (key: string, label: string, fn: () => unknown) => steps.push([label, () => (out[key] = fn())])

  add('ashlar', 'Cutting ashlar stone', () =>
    tex.stoneBlocks({ rows: 8, cols: 4, base: [150, 142, 130], variation: 0.28, mortar: 0.018, seed: 1, mortarColor: [70, 66, 60] }),
  )
  add('rubble', 'Weathering foundations', () =>
    tex.stoneBlocks({ rows: 6, cols: 3, base: [96, 92, 88], variation: 0.4, mortar: 0.03, seed: 9, mortarColor: [40, 38, 36] }, 256),
  )
  add('cobble', 'Laying cobbles', () =>
    tex.stoneBlocks({ rows: 10, cols: 10, base: [112, 108, 102], variation: 0.45, mortar: 0.06, seed: 21, mortarColor: [48, 52, 40] }, 256),
  )
  add('flag', 'Polishing flagstones', () => tex.flagstones(256))
  add('slate', 'Splitting roof slate', () => tex.slateRoof(256))
  add('wood', 'Planing timber', () => tex.woodPlanks(256))
  add('detail', 'Shaping the land', () => tex.terrainDetail(256))
  add('misc', 'Binding books and glass', () => ({
    books: tex.bookSpines(512),
    glass: tex.stainedGlass(256),
    glow: tex.radialGlow(128),
    fog: tex.fogPuff(256),
    banner: tex.bannerTexture(256),
    water: tex.waterNormals(256),
  }))

  for (let i = 0; i < steps.length; i++) {
    onProgress(i / steps.length, steps[i][0])
    await yieldToBrowser()
    steps[i][1]()
  }
  onProgress(1, 'Materials ready')

  const ashlar = out.ashlar as tex.PbrSet
  const rubble = out.rubble as tex.PbrSet
  const misc = out.misc as Record<string, Texture>

  const glassWarm = new MeshStandardMaterial({
    color: '#2a1a10',
    emissive: new Color('#ffb066'),
    emissiveMap: misc.glass,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  })
  const glassCool = glassWarm.clone()
  glassCool.emissive = new Color('#88aaff')
  glassCool.emissiveIntensity = 0.9

  const bookshelf = new MeshStandardMaterial({ map: misc.books, roughness: 0.85 })
  const banner = new MeshStandardMaterial({ map: misc.banner, roughness: 0.9, side: DoubleSide })

  library = {
    stoneWall: pbr(ashlar, { color: '#d8d2c8' }),
    stoneDark: pbr(rubble, { color: '#c4beb6', normalScale: 1.3 }),
    stoneTrim: pbr(ashlar, { color: '#e8e2d6', normalScale: 0.4 }),
    floor: pbr(out.flag as tex.PbrSet, { color: '#c8c0b4' }),
    cobble: pbr(out.cobble as tex.PbrSet, { color: '#c8c4bc', normalScale: 1.4 }),
    roof: pbr(out.slate as tex.PbrSet, { color: '#c0c8d8' }),
    wood: pbr(out.wood as tex.PbrSet, { color: '#a08070' }),
    woodLight: pbr(out.wood as tex.PbrSet, { color: '#e0b890' }),
    bookshelf,
    glassWarm,
    glassCool,
    iron: new MeshStandardMaterial({ color: '#2b2b30', metalness: 0.85, roughness: 0.45 }),
    brass: new MeshStandardMaterial({ color: '#b08d48', metalness: 0.9, roughness: 0.32 }),
    wax: new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.6, emissive: new Color('#ffcf8a'), emissiveIntensity: 0.15 }),
    flame: new MeshBasicMaterial({
      map: misc.glow,
      color: new Color('#ffbe6a'),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }),
    banner,
    fabricRed: new MeshStandardMaterial({ color: '#5d1f22', roughness: 0.9 }),
    terrainDetail: out.detail as tex.PbrSet,
    glow: misc.glow,
    fog: misc.fog,
    waterNormals: misc.water,
  }
  return library
}

export function getMaterials(): MaterialLibrary {
  if (!library) throw new Error('Materials requested before buildMaterials() finished')
  return library
}

export const materialsReady = () => library !== null

/** Dispose of all shared GPU resources (used when the whole game unmounts). */
export function disposeMaterials() {
  if (!library) return
  const seen = new Set<unknown>()
  for (const v of Object.values(library)) {
    if (seen.has(v)) continue
    seen.add(v)
    if ((v as Material).isMaterial) {
      const m = v as MeshStandardMaterial
      ;[m.map, m.normalMap, m.roughnessMap, m.emissiveMap].forEach((t) => t && !seen.has(t) && (seen.add(t), t.dispose()))
      m.dispose()
    } else if ((v as Texture).isTexture) {
      ;(v as Texture).dispose()
    }
  }
  library = null
}
