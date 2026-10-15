import { useMemo } from 'react'
import { CylinderCollider } from '@react-three/rapier'
import { Banner, Block, InstancedBoxes, Stairs, WallSegment, archSpring } from '../architecture/Modules'
import { plane, ring, scaledBox, solidCylinder } from '../architecture/geometry'
import { getMaterials } from '../environment/materials'
import { Flames, MoteField } from '../environment/Atmosphere'
import { COURTYARD, CURTAIN_WALL } from '../layout'
import { Door } from '../../interaction/Door'

type V3 = [number, number, number]

const H = CURTAIN_WALL.height
const T = CURTAIN_WALL.thickness

/** Lamp post with an iron cage and a flame on top. Returns the flame position for batching. */
function LampPost({ position }: { position: V3 }) {
  const mats = getMaterials()
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} geometry={solidCylinder(0.35, 0.45, 0.6, 8)} material={mats.stoneDark} castShadow />
      <mesh position={[0, 2.1, 0]} geometry={solidCylinder(0.08, 0.1, 3.2, 8)} material={mats.iron} castShadow />
      <mesh position={[0, 3.85, 0]} geometry={solidCylinder(0.28, 0.18, 0.5, 6)} material={mats.iron} />
      <CylinderCollider args={[1.8, 0.3]} position={[0, 1.8, 0]} />
    </group>
  )
}

export const lampFlame = (p: V3): V3 => [p[0], p[1] + 3.72, p[2]]

function Fountain() {
  const mats = getMaterials()
  return (
    <group position={[0, 0, 24]}>
      <mesh position={[0, 0.45, 0]} geometry={solidCylinder(5.2, 5.4, 0.9, 40)} material={mats.stoneTrim} castShadow receiveShadow />
      <mesh position={[0, 0.82, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[4.7, 40]} />
        <meshStandardMaterial color="#1a3442" roughness={0.05} metalness={0.4} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, 0.92, 0]} rotation-x={Math.PI / 2} geometry={ring(5.05, 0.22)} material={mats.stoneTrim} />
      <mesh position={[0, 2.4, 0]} geometry={solidCylinder(0.7, 1.1, 3.2, 12)} material={mats.stoneTrim} castShadow />
      <mesh position={[0, 4.6, 0]} geometry={solidCylinder(0.0, 0.55, 1.6, 4)} material={mats.stoneTrim} castShadow />
      {/* Floating crystal above the obelisk. */}
      <mesh position={[0, 6.1, 0]} rotation-y={0.4}>
        <octahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#9fd8ff" emissive="#5fb8ff" emissiveIntensity={2.4} roughness={0.2} toneMapped={false} />
      </mesh>
      <CylinderCollider args={[0.45, 5.3]} position={[0, 0.45, 0]} />
      <CylinderCollider args={[2.2, 1]} position={[0, 2.2, 0]} />
    </group>
  )
}

const LAMPS: V3[] = [
  [-9, 0, 8],
  [9, 0, 8],
  [-9, 0, 40],
  [9, 0, 40],
  [-24, 0, 24],
  [24, 0, 24],
]

/**
 * Entrance courtyard: curtain walls with a gate, a battlement walkway reached by stairs,
 * the central fountain, lamps and the Grand Hall doors on its north side.
 */
export function Courtyard() {
  const mats = getMaterials()
  const flames = useMemo<V3[]>(
    () => [
      ...LAMPS.map(lampFlame),
      // Gate torches (inside and outside).
      [-5.2, 4.2, 51.6],
      [5.2, 4.2, 51.6],
      [-5.2, 4.2, 48.4],
      [5.2, 4.2, 48.4],
      // Hall door torches.
      [-3.8, 4, -0.7],
      [3.8, 4, -0.7],
    ],
    [],
  )

  const portcullis = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ position: [-3.2 + i * 0.8, archSpring(7, 8.5) + 1.1, 50] as V3 })),
    [],
  )

  const crates = useMemo(
    () => [
      { position: [-26.5, 0.6, 6] as V3, rotationY: 0.2 },
      { position: [-26.8, 0.6, 7.4] as V3, rotationY: -0.1 },
      { position: [-26.6, 1.8, 6.7] as V3, rotationY: 0.5 },
      { position: [26.2, 0.6, 42] as V3, rotationY: 0.3 },
      { position: [25.6, 0.6, 43.5] as V3, rotationY: 0 },
    ],
    [],
  )

  return (
    <group>
      {/* Cobbled floor (visual; the terrain collider beneath is flat). */}
      <mesh
        position={[(COURTYARD.minX + COURTYARD.maxX) / 2, 0.03, (COURTYARD.minZ + COURTYARD.maxZ) / 2 - 1]}
        rotation-x={-Math.PI / 2}
        geometry={plane(COURTYARD.maxX - COURTYARD.minX, COURTYARD.maxZ - COURTYARD.minZ + 2, 4)}
        material={mats.cobble}
        receiveShadow
      />
      {/* Paved forecourt outside the gate leading to the bridge. */}
      <mesh position={[0, 0.03, 58.5]} rotation-x={-Math.PI / 2} geometry={plane(10, 15, 4)} material={mats.cobble} receiveShadow />

      {/* South wall with the main gate; merlons face outwards (+Z). */}
      <WallSegment from={[-30, 50]} to={[30, 50]} height={H} thickness={T} openings={[{ at: 30, width: 7, height: 8.5 }]} crenellated={1} />
      {/* East wall: opening to the Practice Grounds. */}
      <WallSegment from={[30, 0]} to={[30, 50]} height={H} thickness={T} openings={[{ at: 25, width: 6, height: 6.5 }]} crenellated={-1} />
      {/* West wall: opening towards the Skyward Platform. */}
      <WallSegment from={[-30, 50]} to={[-30, 0]} height={H} thickness={T} openings={[{ at: 20, width: 6, height: 6.5 }]} crenellated={-1} />
      {/* North wall either side of the Grand Hall. */}
      <WallSegment from={[-30, 0]} to={[-13, 0]} height={H} thickness={T} crenellated={-1} />
      <WallSegment from={[13, 0]} to={[30, 0]} height={H} thickness={T} crenellated={-1} />

      {/* Raised portcullis and gate banners. */}
      <InstancedBoxes transforms={portcullis} size={[0.12, 2.2, 0.12]} material="iron" />
      <Banner position={[-6.5, 8.6, 51.25]} />
      <Banner position={[6.5, 8.6, 51.25]} />
      <Banner position={[-6.5, 8.6, 48.75]} rotationY={Math.PI} />
      <Banner position={[6.5, 8.6, 48.75]} rotationY={Math.PI} />

      {/* Stairs up to the south battlement walkway, with a landing at the top. */}
      <Stairs from={[-27, 0, 47.5]} to={[-10, H, 47.5]} width={3} />
      <Block position={[-8, H - 0.2, 47.5]} size={[4, 0.4, 3]} material="stoneTrim" />
      <Block position={[-8, (H - 0.4) / 2, 47.5]} size={[1.2, H - 0.4, 1.2]} material="stoneDark" />

      <Fountain />
      {LAMPS.map((p, i) => (
        <LampPost key={i} position={p} />
      ))}

      {/* Stone benches. */}
      {[
        [-13, 0.3, 24, Math.PI / 2],
        [13, 0.3, 24, Math.PI / 2],
        [0, 0.3, 14, 0],
        [0, 0.3, 34, 0],
      ].map(([x, y, z, r], i) => (
        <Block key={i} position={[x, y, z]} size={[3.2, 0.6, 0.9]} rotationY={r} material="stoneTrim" />
      ))}

      {crates.map((c, i) => (
        <Block key={i} position={c.position} size={[1.2, 1.2, 1.2]} rotationY={c.rotationY} material="wood" tile={1.2} />
      ))}

      {/* Low hedges along the inner walls. */}
      {[
        [-20, 0.6, 3, 10, 1.2],
        [20, 0.6, 3, 10, 1.2],
      ].map(([x, y, z, w, d], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh geometry={scaledBox(w, 1.2, d, 2)} castShadow receiveShadow>
            <meshStandardMaterial color="#26381f" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Grand Hall great doors live here because they open onto the courtyard. */}
      <Door id="door-grand-hall" label="Great Doors" position={[0, 0, -2]} rotationY={0} width={4.5} height={archSpring(4.5, 7)} thickness={0.3} />

      <Flames positions={flames} size={0.32} />
      <MoteField center={[0, 0.5, 25]} size={[56, 14, 46]} count={160} color="#a8d8ff" pointSize={0.09} speed={0.25} seed={4} intensity={0.8} />
    </group>
  )
}
