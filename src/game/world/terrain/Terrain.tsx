import { useEffect, useMemo, useRef } from 'react'
import { TrimeshCollider } from '@react-three/rapier'
import type { Collider } from '@dimforge/rapier3d-compat'
import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, PlaneGeometry, RepeatWrapping } from 'three'
import { terrainHeight } from './heightfield'
import { fbm2, ridged2 } from '../../core/noise'
import { smoothstep } from '../../core/math'
import { FOREST, WATER_LEVEL, WORLD_HALF_SIZE } from '../layout'
import { getMaterials } from '../environment/materials'

/** Dirt paths painted into the terrain colours (polyline points in x,z). */
export const PATHS: Array<Array<[number, number]>> = [
  [
    [0, 104],
    [0, 150],
    [8, 220],
    [20, 300],
  ],
  [
    [-30, 30],
    [-52, 29],
  ],
  [
    [80, 24],
    [118, 4],
    [150, -25],
    [178, -50],
    [212, -92],
  ],
  [
    [-40, -6],
    [-90, -10],
    [-122, -10],
  ],
]

function distToSegment(px: number, pz: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)))
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t))
}

export function distanceToPath(x: number, z: number) {
  let d = Infinity
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) d = Math.min(d, distToSegment(x, z, path[i], path[i + 1]))
  return d
}

/** Handle of the terrain collider, used to tell grass footsteps from stone ones. */
export const terrainCollider = { handle: -1 }

const C = {
  grassA: new Color('#3b4a2b'),
  grassB: new Color('#5a6339'),
  moss: new Color('#26362c'),
  rock: new Color('#6d6a64'),
  rockDark: new Color('#4a4846'),
  snow: new Color('#e6eaf0'),
  mud: new Color('#4f4638'),
  dirt: new Color('#6f5f47'),
}

const SEGMENTS = 232

function buildTerrain() {
  const size = WORLD_HALF_SIZE * 2 + 40
  const g = new PlaneGeometry(size, size, SEGMENTS, SEGMENTS)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const col = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, terrainHeight(x, z))
  }
  g.computeVertexNormals()
  const nrm = g.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ny = nrm.getY(i)
    const n = fbm2(x * 0.02, z * 0.02, 3) * 0.5 + 0.5
    col.copy(C.grassA).lerp(C.grassB, n)
    const df = Math.hypot(x - FOREST.center[0], z - FOREST.center[1])
    col.lerp(C.moss, (1 - smoothstep(FOREST.radius * 0.7, FOREST.radius * 1.1, df)) * 0.8)
    const rockiness = smoothstep(0.86, 0.7, ny) + ridged2(x * 0.01, z * 0.01, 2) * 0.15 * smoothstep(40, 120, y)
    col.lerp(n > 0.5 ? C.rock : C.rockDark, Math.min(1, rockiness))
    col.lerp(C.snow, smoothstep(140, 190, y + n * 20) * smoothstep(0.6, 0.85, ny))
    col.lerp(C.mud, smoothstep(WATER_LEVEL + 3, WATER_LEVEL + 0.5, y))
    col.lerp(C.dirt, smoothstep(3.2, 1.2, distanceToPath(x, z)) * 0.9)
    colors[i * 3] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.computeBoundingSphere()

  const vertices = new Float32Array(pos.array as Float32Array)
  const index = g.index!
  const indices = new Uint32Array(index.count)
  for (let i = 0; i < index.count; i++) indices[i] = index.getX(i)
  return { geometry: g, vertices, indices }
}

/** Far mountain ring beyond the playable area (render only, no collision). */
function buildBackdrop() {
  const rings = 24
  const segs = 160
  const r0 = WORLD_HALF_SIZE + 60
  const r1 = 2200
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const col = new Color()
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const r = r0 + (r1 - r0) * t * t
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const crest = ridged2(x * 0.0018 + 4, z * 0.0018, 5)
      const h = terrainHeight(Math.cos(a) * r0, Math.sin(a) * r0) * (1 - smoothstep(0, 0.15, t)) + smoothstep(0, 0.3, t) * (120 + crest * 420) * (1 - smoothstep(0.75, 1, t) * 0.5)
      positions.push(x, h, z)
      col.copy(C.rockDark).lerp(C.rock, crest).lerp(C.snow, smoothstep(250, 380, h))
      colors.push(col.r, col.g, col.b)
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j
      const b = a + segs + 1
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export function Terrain() {
  const { geometry, vertices, indices } = useMemo(buildTerrain, [])
  const backdrop = useMemo(buildBackdrop, [])
  const colliderRef = useRef<Collider>(null)

  const material = useMemo(() => {
    const detail = getMaterials().terrainDetail
    const map = detail.map.clone()
    const normalMap = detail.normalMap.clone()
    for (const t of [map, normalMap]) {
      t.wrapS = t.wrapT = RepeatWrapping
      t.repeat.set(140, 140)
      t.needsUpdate = true
    }
    const m = new MeshStandardMaterial({ vertexColors: true, map, normalMap, roughness: 0.95 })
    m.normalScale.set(0.8, 0.8)
    return m
  }, [])

  const backdropMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1 }), [])

  useEffect(() => {
    if (colliderRef.current) terrainCollider.handle = colliderRef.current.handle
  })

  useEffect(
    () => () => {
      geometry.dispose()
      backdrop.dispose()
      material.map?.dispose()
      material.normalMap?.dispose()
      material.dispose()
      backdropMaterial.dispose()
    },
    [geometry, backdrop, material, backdropMaterial],
  )

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <mesh geometry={backdrop} material={backdropMaterial} />
      <TrimeshCollider ref={colliderRef} args={[vertices, indices]} />
    </group>
  )
}
