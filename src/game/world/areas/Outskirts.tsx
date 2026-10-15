import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider } from '@react-three/rapier'
import { Banner, Block, Column, Stairs, Tower, WallSegment } from '../architecture/Modules'
import { archSpandrel, plane, ring, scaledBox, solidCylinder } from '../architecture/geometry'
import { getMaterials } from '../environment/materials'
import { Flames } from '../environment/Atmosphere'
import { BRIDGE, FLIGHT_PLATFORM, RAVINE, TOWERS, TRAINING_YARD } from '../layout'
import { terrainHeight } from '../terrain/heightfield'
import { LampPostSimple } from './props'

type V3 = [number, number, number]

/** Every tower in the layout table. */
export function Towers() {
  return (
    <group>
      {TOWERS.map((t) => (
        <Tower key={t.id} x={t.x} z={t.z} radius={t.radius} height={t.height} roof={t.roof} roofHeight={t.roofHeight} />
      ))}
      {/* Flying buttresses linking the Spire of Dawn to the hall. */}
      {[-6, 6].map((x) => (
        <Block key={x} position={[x * 0.9, 18, -54.5]} size={[1.2, 1.2, 5]} material="stoneTrim" collider={false} />
      ))}
    </group>
  )
}

/** Pilgrim Bridge across the ravine, with arches, piers, parapets and lamps. */
export function Bridge() {
  const mats = getMaterials()
  const length = BRIDGE.maxZ - BRIDGE.minZ
  const cz = (BRIDGE.minZ + BRIDGE.maxZ) / 2
  const w = BRIDGE.halfWidth * 2
  const deck = 1.2
  const bottom = -RAVINE.depth - 4
  const piers = [78, 92]
  const spans: Array<[number, number]> = [
    [BRIDGE.minZ, 78],
    [78, 92],
    [92, BRIDGE.maxZ],
  ]
  const lamps = useMemo<V3[]>(() => [70, 85, 100].flatMap((z) => [[-BRIDGE.halfWidth + 0.3, 0, z] as V3, [BRIDGE.halfWidth - 0.3, 0, z] as V3]), [])
  return (
    <group>
      <Block position={[0, -deck / 2, cz]} size={[w, deck, length]} material="stoneTrim" />
      <mesh position={[0, 0.02, cz]} rotation-x={-Math.PI / 2} geometry={plane(w - 1, length, 3)} material={mats.cobble} receiveShadow />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Block position={[s * (BRIDGE.halfWidth - 0.25), 0.55, cz]} size={[0.5, 1.1, length]} material="stoneWall" />
          <mesh position={[s * (BRIDGE.halfWidth - 0.25), 1.15, cz]} geometry={scaledBox(0.7, 0.12, length, 2)} material={mats.stoneTrim} />
        </group>
      ))}
      {piers.map((z) => (
        <Block key={z} position={[0, (bottom - deck) / 2, z]} size={[w + 0.6, -bottom - deck, 3]} material="stoneDark" />
      ))}
      {spans.map(([a, b]) => {
        const span = b - a - (a === BRIDGE.minZ || b === BRIDGE.maxZ ? 1.5 : 3)
        const rise = Math.min(span * 0.55, 7)
        return (
          <group key={a} position={[0, -deck - rise, (a + b) / 2]} rotation-y={Math.PI / 2}>
            <mesh geometry={archSpandrel(span, rise, w)} material={mats.stoneWall} castShadow receiveShadow />
          </group>
        )
      })}
      {lamps.map((p, i) => (
        <LampPostSimple key={i} position={[p[0], 1.1, p[2]]} />
      ))}
      <Flames positions={lamps.map((p) => [p[0], 1.1 + 2.75, p[2]] as V3)} size={0.28} />
    </group>
  )
}

/** Skyward Platform: round launch pad with a runic inlay, lamps and a broom rack. */
export function FlightPlatform() {
  const mats = getMaterials()
  const [cx, cz] = FLIGHT_PLATFORM.center
  const r = FLIGHT_PLATFORM.radius
  const h = FLIGHT_PLATFORM.height
  const posts = useMemo<V3[]>(() => [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    return [cx + Math.cos(a) * (r - 0.8), h, cz + Math.sin(a) * (r - 0.8)] as V3
  }), [cx, cz, r, h])
  return (
    <group>
      <mesh position={[cx, h / 2, cz]} geometry={solidCylinder(r, r + 0.4, h, 48)} material={mats.stoneTrim} castShadow receiveShadow />
      <mesh position={[cx, h + 0.01, cz]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[r - 0.1, 48]} />
        <primitive object={mats.floor} attach="material" />
      </mesh>
      {[r - 1.4, r - 2.2].map((rr) => (
        <mesh key={rr} position={[cx, h + 0.03, cz]} rotation-x={Math.PI / 2} geometry={ring(rr, 0.07)}>
          <meshStandardMaterial color="#f2d48a" emissive="#ffcc66" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      ))}
      <CylinderCollider args={[h / 2, r + 0.2]} position={[cx, h / 2, cz]} />
      <Stairs from={[cx + r + 3.6, 0, cz]} to={[cx + r - 0.1, h, cz]} width={3} />
      {posts.map((p, i) => (
        <LampPostSimple key={i} position={p} />
      ))}
      <Flames positions={posts.map((p) => [p[0], p[1] + 2.75, p[2]] as V3)} size={0.28} />
      {/* Broom rack. */}
      <group position={[cx - 4, h, cz - 5]} rotation-y={0.6}>
        <Block position={[0, 0.9, 0]} size={[2.6, 0.12, 0.3]} material="wood" collider={false} />
        <Block position={[-1.2, 0.5, 0]} size={[0.15, 1, 0.15]} material="wood" collider={false} />
        <Block position={[1.2, 0.5, 0]} size={[0.15, 1, 0.15]} material="wood" collider={false} />
        <CuboidCollider args={[1.3, 0.5, 0.2]} position={[0, 0.5, 0]} />
      </group>
      <Banner position={[cx + 3, h + 5, cz - 8.2]} rotationY={-0.3} height={3.5} width={1.6} />
      <Block position={[cx + 3, h + 2.5, cz - 8.4]} size={[0.25, 5, 0.25]} material="iron" />
    </group>
  )
}

/** Practice Grounds: paved yard with low parapets, a rune circle and racks. Interactive targets live in TrainingTargets. */
export function TrainingYardStatic() {
  const mats = getMaterials()
  const { minX, maxX, minZ, maxZ } = TRAINING_YARD
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const posts = useMemo<V3[]>(() => [
    [minX + 2, 0, minZ + 2],
    [maxX - 2, 0, minZ + 2],
    [minX + 2, 0, maxZ - 2],
    [maxX - 2, 0, maxZ - 2],
  ], [minX, maxX, minZ, maxZ])
  return (
    <group>
      <mesh position={[cx, 0.03, cz]} rotation-x={-Math.PI / 2} geometry={plane(maxX - minX, maxZ - minZ, 4)} material={mats.floor} receiveShadow />
      {/* Low parapet: north, south, and east with a gap for the forest path. */}
      <WallSegment from={[minX, minZ]} to={[maxX, minZ]} height={1.3} thickness={0.8} plinth={false} />
      <WallSegment from={[maxX, maxZ]} to={[minX, maxZ]} height={1.3} thickness={0.8} plinth={false} />
      <WallSegment from={[maxX, minZ]} to={[maxX, 20]} height={1.3} thickness={0.8} plinth={false} />
      <WallSegment from={[maxX, 28]} to={[maxX, maxZ]} height={1.3} thickness={0.8} plinth={false} />
      {/* Rune circle. */}
      {[3.5, 4.2, 6].map((rr, i) => (
        <mesh key={rr} position={[50, 0.05, 24]} rotation-x={Math.PI / 2} geometry={ring(rr, i === 2 ? 0.05 : 0.09)}>
          <meshStandardMaterial color="#9fd8ff" emissive="#62b6ff" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      {posts.map((p, i) => (
        <LampPostSimple key={i} position={p} />
      ))}
      <Flames positions={posts.map((p) => [p[0], 2.75, p[2]] as V3)} size={0.28} />
      {/* Weapon-free training racks and benches along the north parapet. */}
      {[40, 46].map((x) => (
        <Block key={x} position={[x, 0.3, minZ + 2]} size={[3, 0.6, 0.9]} material="wood" />
      ))}
      <Column position={[42, 0, maxZ - 3]} height={4} radius={0.35} />
      <Column position={[58, 0, maxZ - 3]} height={4} radius={0.35} />
    </group>
  )
}

/** The Drowned Chapel: a ruined chapel on the cliffs above Mirrormere (a secret location). */
export function ChapelRuin() {
  const mats = getMaterials()
  const x = -128
  const z = -10
  const base = terrainHeight(x, z) - 0.6
  return (
    <group position={[x, base, z]}>
      <mesh position={[0, 0.3, 0]} rotation-x={-Math.PI / 2} geometry={plane(14, 20, 3)} material={mats.floor} receiveShadow />
      <Block position={[0, -2.7, 0]} size={[14, 6, 20]} material="stoneDark" />
      <WallSegment from={[-7, 10]} to={[-7, -10]} height={6} thickness={1} windows={[{ at: 6, y: 2, width: 1.6, height: 3, glass: 'glassCool' }]} />
      <WallSegment from={[7, -10]} to={[7, 2]} height={3.5} thickness={1} />
      <WallSegment from={[-7, -10]} to={[2, -10]} height={8} thickness={1} openings={[{ at: 7, width: 3, height: 5 }]} />
      {[-4, 0, 4].map((zz) => (
        <Column key={zz} position={[3, 0.3, zz]} height={zz === 0 ? 2.2 : 5} radius={0.4} />
      ))}
      <Block position={[4.5, 0.6, 6]} size={[1, 0.8, 4.5]} rotationY={0.9} material="stoneTrim" />
      <Block position={[-2, 1, 7]} size={[2.2, 1.4, 1]} material="stoneTrim" />
    </group>
  )
}
