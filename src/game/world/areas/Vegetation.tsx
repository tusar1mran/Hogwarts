import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useRapier } from '@react-three/rapier'
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createRng } from '../../core/math'
import { valueNoise2 } from '../../core/noise'
import { terrainHeight, terrainNormal } from '../terrain/heightfield'
import { distanceToPath } from '../terrain/Terrain'
import { FOREST, PLATEAU, WATER_LEVEL, WORLD_HALF_SIZE } from '../layout'
import { getMaterials } from '../environment/materials'
import { MistLayer, MoteField } from '../environment/Atmosphere'
import { Block } from '../architecture/Modules'

type V3 = [number, number, number]

interface Placement {
  x: number
  y: number
  z: number
  scale: number
  height: number
  rot: number
}

/* ------------------------------------------------------------------------------------------ */
/* Placement (deterministic)                                                                    */
/* ------------------------------------------------------------------------------------------ */

const inPlateau = (x: number, z: number, pad: number) =>
  x > PLATEAU.minX - pad && x < PLATEAU.maxX + pad && z > PLATEAU.minZ - pad && z < PLATEAU.maxZ + pad

function placeGiantTrees(): Placement[] {
  const rng = createRng(2024)
  const out: Placement[] = []
  for (let tries = 0; tries < 4000 && out.length < 46; tries++) {
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * FOREST.radius * 0.95
    const x = FOREST.center[0] + Math.cos(a) * r
    const z = FOREST.center[1] + Math.sin(a) * r
    if (distanceToPath(x, z) < 7) continue
    if (Math.hypot(x - 215, z + 95) < 14) continue // keep the shrine clearing open
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 15)) continue
    const scale = 1.4 + rng() * 1.1
    out.push({ x, y: terrainHeight(x, z) - 0.5, z, scale, height: 22 + rng() * 14, rot: rng() * Math.PI * 2 })
  }
  return out
}

function placePines(): Placement[] {
  const rng = createRng(77)
  const out: Placement[] = []
  for (let tries = 0; tries < 20000 && out.length < 520; tries++) {
    const x = (rng() * 2 - 1) * (WORLD_HALF_SIZE - 20)
    const z = (rng() * 2 - 1) * (WORLD_HALF_SIZE - 20)
    if (inPlateau(x, z, 10)) continue
    if (Math.hypot(x - FOREST.center[0], z - FOREST.center[1]) < FOREST.radius * 0.85) continue
    const y = terrainHeight(x, z)
    if (y < WATER_LEVEL + 2 || y > 150) continue
    if (terrainNormal(x, z, 2)[1] < 0.78) continue
    if (distanceToPath(x, z) < 5) continue
    // Clustered density: noise decides groves vs open meadows.
    const density = valueNoise2(x * 0.012, z * 0.012) * 0.5 + 0.5
    if (rng() > density * density * 1.6 + 0.05) continue
    const scale = 0.8 + rng() * 0.8
    out.push({ x, y: y - 0.3, z, scale, height: 9 + rng() * 9, rot: rng() * Math.PI * 2 })
  }
  return out
}

function placeRocks(): Placement[] {
  const rng = createRng(5)
  const out: Placement[] = []
  for (let tries = 0; tries < 6000 && out.length < 150; tries++) {
    const x = (rng() * 2 - 1) * 420
    const z = (rng() * 2 - 1) * 420
    if (inPlateau(x, z, 4)) continue
    const y = terrainHeight(x, z)
    if (y < WATER_LEVEL - 4) continue
    if (distanceToPath(x, z) < 4) continue
    const scale = 0.6 + rng() * rng() * 3.2
    out.push({ x, y: y - scale * 0.3, z, scale, height: scale, rot: rng() * Math.PI * 2 })
  }
  return out
}

function placeForestFloor(count: number, seed: number, near: Placement[]): Placement[] {
  const rng = createRng(seed)
  const out: Placement[] = []
  for (let i = 0; i < count * 3 && out.length < count; i++) {
    // Half cluster around tree roots, half scattered.
    let x: number
    let z: number
    if (rng() < 0.55 && near.length) {
      const t = near[Math.floor(rng() * near.length)]
      const a = rng() * Math.PI * 2
      const r = t.scale * 2.2 + rng() * 5
      x = t.x + Math.cos(a) * r
      z = t.z + Math.sin(a) * r
    } else {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * FOREST.radius
      x = FOREST.center[0] + Math.cos(a) * r
      z = FOREST.center[1] + Math.sin(a) * r
    }
    if (distanceToPath(x, z) < 1.5) continue
    out.push({ x, y: terrainHeight(x, z), z, scale: 0.5 + rng() * 1.2, height: 1, rot: rng() * Math.PI * 2 })
  }
  return out
}

/* ------------------------------------------------------------------------------------------ */
/* Geometry                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function giantTrunkGeometry() {
  const pts: Vector2[] = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const flare = 1 + 1.4 * Math.pow(1 - t, 7)
    pts.push(new Vector2(Math.max(0.05, flare * (1 - 0.6 * t)), t))
  }
  const g = new LatheGeometry(pts, 14)
  // Gnarl the trunk a little.
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 1 + valueNoise2(Math.atan2(z, x) * 2, y * 6) * 0.12
    p.setXYZ(i, x * n, y, z * n)
  }
  g.computeVertexNormals()
  return g
}

function blobGeometry(seed: number, detail = 2) {
  const g = new IcosahedronGeometry(1, detail)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 1 + valueNoise2(x * 2.3 + seed, z * 2.3 + y * 1.7) * 0.22
    p.setXYZ(i, x * n, y * n * 0.8, z * n)
  }
  g.computeVertexNormals()
  return g
}

function pineGeometry() {
  const trunk = new CylinderGeometry(0.12, 0.2, 1, 6)
  trunk.translate(0, 0.5, 0)
  const parts: BufferGeometry[] = [trunk]
  const layers = [
    [0.55, 0.42, 0.25],
    [0.45, 0.36, 0.45],
    [0.32, 0.3, 0.65],
  ]
  for (const [r, h, y] of layers) {
    const c = new ConeGeometry(r, h, 8)
    c.translate(0, y + h / 2, 0)
    parts.push(c)
  }
  // Trunk and foliage stay separate geometries so each gets its own instanced material.
  const foliage = mergeGeometries(parts.slice(1))!
  return { trunk, foliage }
}

/* ------------------------------------------------------------------------------------------ */
/* Instanced helpers                                                                            */
/* ------------------------------------------------------------------------------------------ */

const _o = new Object3D()

function Instances({
  geometry,
  material,
  items,
  transform,
  castShadow = true,
}: {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  items: Placement[]
  transform: (p: Placement, o: Object3D, index: number) => void
  castShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    items.forEach((p, i) => {
      _o.position.set(0, 0, 0)
      _o.rotation.set(0, 0, 0)
      _o.scale.set(1, 1, 1)
      transform(p, _o, i)
      _o.updateMatrix()
      m.setMatrixAt(i, _o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items, transform])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow />
}

/** Creates fixed colliders imperatively: far cheaper than hundreds of collider components. */
function useStaticColliders(kind: 'cylinder' | 'ball', items: Array<{ x: number; y: number; z: number; r: number; h: number }>) {
  const { world, rapier } = useRapier()
  useEffect(() => {
    const created = items.map((c) => {
      const desc =
        kind === 'cylinder'
          ? rapier.ColliderDesc.cylinder(c.h / 2, c.r).setTranslation(c.x, c.y + c.h / 2, c.z)
          : rapier.ColliderDesc.ball(c.r).setTranslation(c.x, c.y, c.z)
      return world.createCollider(desc)
    })
    return () => {
      created.forEach((c) => {
        try {
          world.removeCollider(c, false)
        } catch {
          // World may already be freed during teardown.
        }
      })
    }
  }, [world, rapier, kind, items])
}

/* ------------------------------------------------------------------------------------------ */
/* Components                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export function Vegetation() {
  const mats = getMaterials()
  const giants = useMemo(placeGiantTrees, [])
  const pines = useMemo(placePines, [])
  const rocks = useMemo(placeRocks, [])
  const mushrooms = useMemo(() => placeForestFloor(420, 9, giants), [giants])
  const flowers = useMemo(() => placeForestFloor(520, 19, giants), [giants])

  const geoms = useMemo(() => {
    const pine = pineGeometry()
    return {
      giantTrunk: giantTrunkGeometry(),
      blob: blobGeometry(3.1),
      pineTrunk: pine.trunk,
      pineFoliage: pine.foliage,
      rock: (() => {
        const g = new DodecahedronGeometry(1, 1)
        const p = g.attributes.position
        for (let i = 0; i < p.count; i++) {
          const n = 1 + valueNoise2(p.getX(i) * 3, p.getZ(i) * 3 + p.getY(i)) * 0.25
          p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.75, p.getZ(i) * n)
        }
        g.computeVertexNormals()
        return g
      })(),
      stem: new CylinderGeometry(0.05, 0.08, 0.5, 6).translate(0, 0.25, 0),
      cap: new SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.48, 0),
      bulb: new IcosahedronGeometry(0.1, 0),
      fruit: new IcosahedronGeometry(0.35, 1),
    }
  }, [])

  const materials = useMemo(
    () => ({
      bark: new MeshStandardMaterial({ color: '#3b3029', roughness: 0.95, map: mats.wood.map, normalMap: mats.wood.normalMap }),
      giantLeaves: new MeshStandardMaterial({ color: '#173a3a', roughness: 0.85, emissive: new Color('#0b3a44'), emissiveIntensity: 0.35 }),
      pineBark: new MeshStandardMaterial({ color: '#3a2d22', roughness: 1 }),
      pineLeaves: new MeshStandardMaterial({ color: '#1e3320', roughness: 0.92 }),
      stem: new MeshStandardMaterial({ color: '#cfd8d0', roughness: 0.7, emissive: new Color('#3c6070'), emissiveIntensity: 0.4 }),
      cap: new MeshStandardMaterial({ color: '#3fd4e0', emissive: new Color('#2fb8ff'), emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false }),
      bulb: new MeshStandardMaterial({ color: '#c09bff', emissive: new Color('#a070ff'), emissiveIntensity: 2.6, toneMapped: false }),
      fruit: new MeshStandardMaterial({ color: '#9ff0ff', emissive: new Color('#55ddff'), emissiveIntensity: 3, toneMapped: false }),
      rock: mats.stoneDark,
    }),
    [mats],
  )

  useEffect(
    () => () => {
      Object.values(geoms).forEach((g) => g.dispose())
      Object.entries(materials).forEach(([k, m]) => k !== 'rock' && m.dispose())
    },
    [geoms, materials],
  )

  // Canopy: five blobs per giant tree.
  const canopy = useMemo(() => {
    const out: Placement[] = []
    const rng = createRng(99)
    for (const t of giants) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rng()
        const r = i === 0 ? 0 : t.scale * (2.5 + rng() * 2)
        out.push({
          x: t.x + Math.cos(a) * r,
          y: t.y + t.height * (i === 0 ? 1.02 : 0.82 + rng() * 0.12),
          z: t.z + Math.sin(a) * r,
          scale: t.scale * (i === 0 ? 5.2 : 3.8 + rng() * 1.4),
          height: 1,
          rot: rng() * 6,
        })
      }
    }
    return out
  }, [giants])

  const fruit = useMemo(() => {
    const out: Placement[] = []
    const rng = createRng(123)
    for (const c of canopy) {
      if (rng() > 0.6) continue
      const a = rng() * Math.PI * 2
      out.push({ x: c.x + Math.cos(a) * c.scale * 0.9, y: c.y - c.scale * 0.55, z: c.z + Math.sin(a) * c.scale * 0.9, scale: 0.7 + rng() * 0.6, height: 1, rot: 0 })
    }
    return out
  }, [canopy])

  useStaticColliders(
    'cylinder',
    useMemo(() => giants.map((t) => ({ x: t.x, y: t.y, z: t.z, r: t.scale * 0.95, h: t.height * 0.8 })), [giants]),
  )
  useStaticColliders(
    'cylinder',
    useMemo(() => pines.map((t) => ({ x: t.x, y: t.y, z: t.z, r: 0.3 * t.scale, h: t.height * 0.6 })), [pines]),
  )
  useStaticColliders(
    'ball',
    useMemo(() => rocks.map((t) => ({ x: t.x, y: t.y + t.scale * 0.2, z: t.z, r: t.scale * 0.8, h: 0 })), [rocks]),
  )

  const mist = useMemo(() => {
    const rng = createRng(55)
    const out: Array<{ position: V3; scale: number }> = []
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * FOREST.radius
      const x = FOREST.center[0] + Math.cos(a) * r
      const z = FOREST.center[1] + Math.sin(a) * r
      out.push({ position: [x, terrainHeight(x, z) + 1.5 + rng() * 2, z], scale: 14 + rng() * 14 })
    }
    // Ravine and cliff mist around the plateau.
    for (let i = 0; i < 40; i++) {
      const x = -110 + rng() * 220
      out.push({ position: [x, -19 + rng() * 6, 85 + (rng() - 0.5) * 8], scale: 12 + rng() * 10 })
    }
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2
      const r = 70 + rng() * 80
      const x = -205 + Math.cos(a) * r
      const z = 70 + Math.sin(a) * r
      out.push({ position: [x, WATER_LEVEL + 3 + rng() * 8, z], scale: 24 + rng() * 26 })
    }
    return out
  }, [])

  return (
    <group>
      <Instances
        geometry={geoms.giantTrunk}
        material={materials.bark}
        items={giants}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.rotation.y = p.rot
          o.scale.set(p.scale, p.height, p.scale)
        }}
      />
      <Instances
        geometry={geoms.blob}
        material={materials.giantLeaves}
        items={canopy}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.rotation.y = p.rot
          o.scale.setScalar(p.scale)
        }}
      />
      <Instances
        geometry={geoms.fruit}
        material={materials.fruit}
        items={fruit}
        castShadow={false}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.scale.setScalar(p.scale)
        }}
      />
      <Instances
        geometry={geoms.pineTrunk}
        material={materials.pineBark}
        items={pines}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.scale.set(p.scale, p.height, p.scale)
        }}
      />
      <Instances
        geometry={geoms.pineFoliage}
        material={materials.pineLeaves}
        items={pines}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.rotation.y = p.rot
          o.scale.set(p.height * 0.42, p.height, p.height * 0.42)
        }}
      />
      <Instances
        geometry={geoms.rock}
        material={materials.rock}
        items={rocks}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.rotation.set(p.rot * 0.3, p.rot, 0)
          o.scale.setScalar(p.scale)
        }}
      />
      <Instances
        geometry={geoms.stem}
        material={materials.stem}
        items={mushrooms}
        castShadow={false}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.scale.setScalar(p.scale)
        }}
      />
      <Instances
        geometry={geoms.cap}
        material={materials.cap}
        items={mushrooms}
        castShadow={false}
        transform={(p, o) => {
          o.position.set(p.x, p.y, p.z)
          o.scale.setScalar(p.scale)
        }}
      />
      <Instances
        geometry={geoms.bulb}
        material={materials.bulb}
        items={flowers}
        castShadow={false}
        transform={(p, o) => {
          o.position.set(p.x, p.y + 0.25 * p.scale, p.z)
          o.scale.setScalar(p.scale)
        }}
      />
      <MoteField
        center={[FOREST.center[0], terrainHeight(FOREST.center[0], FOREST.center[1]), FOREST.center[1]]}
        size={[FOREST.radius * 1.8, 16, FOREST.radius * 1.8]}
        count={700}
        color="#7fe8ff"
        pointSize={0.16}
        speed={0.35}
        seed={21}
      />
      <MistLayer puffs={mist} opacity={0.24} />
      <Shrine />
    </group>
  )
}

/** Standing stones around a glowing crystal deep in the Glimmerwood. */
function Shrine() {
  const x = 215
  const z = -95
  const y = terrainHeight(x, z)
  const stones = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        return { position: [x + Math.cos(a) * 6.5, y + 1.6, z + Math.sin(a) * 6.5] as V3, rot: -a }
      }),
    [y, x, z],
  )
  return (
    <group>
      {stones.map((s, i) => (
        <Block key={i} position={s.position} size={[1.1, 3.6 + (i % 3) * 0.6, 0.7]} rotationY={s.rot} material="stoneDark" />
      ))}
      <Block position={[x, y + 0.4, z]} size={[2.2, 0.8, 2.2]} material="stoneTrim" />
      <mesh position={[x, y + 2.2, z]}>
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#b4f4ff" emissive="#55e0ff" emissiveIntensity={3.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

