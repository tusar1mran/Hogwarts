import { useMemo } from 'react'
import { CuboidCollider } from '@react-three/rapier'
import { Block, GableRoof, Railing, Stairs, WallSegment, archSpring } from '../architecture/Modules'
import { plane, scaledBox, solidCylinder } from '../architecture/geometry'
import { getMaterials } from '../environment/materials'
import { DistanceCull, Flames, MoteField } from '../environment/Atmosphere'
import { LIBRARY, LIBRARY_BALCONY_Y, LIBRARY_HEIGHT } from '../layout'
import { Door } from '../../interaction/Door'

type V3 = [number, number, number]
const H = LIBRARY_HEIGHT
const T = 2
const BY = LIBRARY_BALCONY_Y
const CX = (LIBRARY.minX + LIBRARY.maxX) / 2
const CZ = (LIBRARY.minZ + LIBRARY.maxZ) / 2

/** A bookcase with book-spine faces on its long sides and a collider. */
function Bookcase({ position, length, height = 4, depth = 0.8, rotationY = 0 }: { position: V3; length: number; height?: number; depth?: number; rotationY?: number }) {
  const mats = getMaterials()
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, height / 2, 0]} geometry={scaledBox(length, height, depth, 2)} material={mats.wood} castShadow receiveShadow />
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, height / 2, s * (depth / 2 + 0.005)]} rotation-y={s === 1 ? 0 : Math.PI}>
          <planeGeometry args={[length - 0.2, height - 0.3]} />
          <primitive object={mats.bookshelf} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, height + 0.1, 0]} geometry={scaledBox(length + 0.2, 0.2, depth + 0.2, 2)} material={mats.wood} castShadow />
      <CuboidCollider args={[length / 2, height / 2, depth / 2]} position={[0, height / 2, 0]} />
    </group>
  )
}

function ReadingTable({ position }: { position: V3 }) {
  const mats = getMaterials()
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]} geometry={scaledBox(3, 0.1, 1.4, 2)} material={mats.woodLight} castShadow receiveShadow />
      <mesh position={[0, 0.4, 0]} geometry={scaledBox(2.6, 0.8, 0.2, 1)} material={mats.wood} castShadow />
      <mesh position={[0.9, 1.05, 0]} geometry={solidCylinder(0.05, 0.12, 0.4, 8)} material={mats.brass} />
      <CuboidCollider args={[1.5, 0.45, 0.7]} position={[0, 0.45, 0]} />
    </group>
  )
}

/**
 * The Starlit Library: a tall hall with freestanding bookcases, an upper gallery on two sides
 * reached by a stair, reading tables, and a hidden nook behind the gallery shelves.
 */
export function Library() {
  const mats = getMaterials()

  const flames = useMemo<V3[]>(
    () => [
      [-36.1, 1.28, -18.5],
      [-30.1, 1.28, -34],
      [-24.2, 1.2, -18.5],
      [-43.6, BY + 0.95, -40.3],
      [-24, 4.5, -15.3],
      [-38, 4.5, -15.3],
    ],
    [],
  )

  return (
    <group>
      {/* Walls (local +Z faces outside). */}
      <WallSegment
        from={[-46, -14]}
        to={[-16, -14]}
        height={H}
        thickness={T}
        openings={[{ at: 15, width: 3.6, height: 5.4 }]}
        windows={[5, 25].map((at) => ({ at, y: 3.5, width: 2, height: 5.5 }))}
      />
      <WallSegment from={[-16, -42]} to={[-46, -42]} height={H} thickness={T} windows={[6, 15, 24].map((at) => ({ at, y: 7, width: 2, height: 5 }))} />
      <WallSegment
        from={[-16, -14]}
        to={[-16, -42]}
        height={H}
        thickness={T}
        openings={[{ at: 14, width: 3.6, height: 5.2 }]}
        windows={[5, 23].map((at) => ({ at, y: 7, width: 2, height: 5 }))}
      />
      <WallSegment from={[-46, -42]} to={[-46, -14]} height={H} thickness={T} windows={[6, 14, 22].map((at) => ({ at, y: 7, width: 2, height: 5, glass: 'glassCool' as const }))} />
      <GableRoof position={[CX, H, CZ]} width={30} length={32} rise={8} rotationY={Math.PI / 2} />

      {/* Covered passage to the Grand Hall (between x -15 and -13). */}
      <Block position={[-14, 2.9, -30.1]} size={[2.2, 5.8, 0.6]} />
      <Block position={[-14, 2.9, -25.9]} size={[2.2, 5.8, 0.6]} />
      <Block position={[-14, 6, -28]} size={[2.4, 0.5, 4.8]} material="stoneTrim" />
      <mesh position={[-14, 0.04, -28]} rotation-x={-Math.PI / 2} geometry={plane(2.2, 3.6, 2)} material={mats.floor} receiveShadow />

      {/* Floor. */}
      <mesh position={[CX, 0.04, CZ]} rotation-x={-Math.PI / 2} geometry={plane(28, 26, 3)} material={mats.wood} receiveShadow />

      {/* Upper gallery: north side and west side, supported by timber posts. */}
      <Block position={[-31, BY - 0.2, -38.5]} size={[28, 0.4, 5]} material="wood" tile={2} />
      <Block position={[-42.5, BY - 0.2, -25.5]} size={[5, 0.4, 21]} material="wood" tile={2} />
      {[-36, -31, -26, -21].map((x) => (
        <Block key={`pn${x}`} position={[x, (BY - 0.4) / 2, -36.3]} size={[0.35, BY - 0.4, 0.35]} material="wood" />
      ))}
      {[-31, -26, -21, -16.5].map((z) => (
        <Block key={`pw${z}`} position={[-40.2, (BY - 0.4) / 2, z]} size={[0.35, BY - 0.4, 0.35]} material="wood" />
      ))}
      <Railing from={[-40, -36]} to={[-21.2, -36]} y={BY} />
      <Railing from={[-40, -36]} to={[-40, -15.2]} y={BY} />
      <Railing from={[-17.8, -36]} to={[-17.1, -36]} y={BY} />

      {/* Stair along the east side up to the north gallery. */}
      <Stairs from={[-19.5, 0, -20]} to={[-19.5, BY, -36]} width={3} material="wood" />

      <DistanceCull center={[CX, 5, CZ]} distance={95}>
        {/* Ground floor: freestanding cases and cases against the south wall. */}
        {[-37, -31, -25].map((x) => (
          <Bookcase key={x} position={[x, 0, -26.5]} length={9} rotationY={Math.PI / 2} />
        ))}
        <Bookcase position={[-40, 0, -15.35]} length={9} depth={0.6} height={3} />
        <Bookcase position={[-22, 0, -15.35]} length={8} depth={0.6} height={3} />
        <ReadingTable position={[-37, 0, -18.5]} />
        <ReadingTable position={[-31, 0, -34]} />
        {/* Librarian's desk. */}
        <Block position={[-25, 0.55, -18.5]} size={[3.2, 1.1, 1.2]} material="wood" />

        {/* Gallery shelves against the outer walls. */}
        <Bookcase position={[-30, BY, -40.6]} length={18} depth={0.6} />
        <Bookcase position={[-44.6, BY, -26]} length={18} depth={0.6} rotationY={Math.PI / 2} />
        {/* The nook: two shelves enclose the north-west corner, leaving a narrow gap. */}
        <Bookcase position={[-40.5, BY, -39.3]} length={3.4} depth={0.5} rotationY={Math.PI / 2} />
        <Bookcase position={[-43.4, BY, -37]} length={3.2} depth={0.5} />
        <Block position={[-43.3, BY + 0.45, -40.2]} size={[1, 0.9, 0.8]} material="stoneTrim" />

        <Flames positions={flames} size={0.13} />
        <MoteField center={[CX, 0.3, CZ]} size={[26, 12, 24]} count={180} color="#ffe2b0" pointSize={0.04} speed={0.08} seed={11} intensity={0.6} />
      </DistanceCull>

      <Door id="door-library-south" label="Library Door" position={[-31, 0, -14]} rotationY={0} width={3.6} height={archSpring(3.6, 5.4)} />
      <pointLight position={[-31, 8, -24]} color="#ffbe80" intensity={34} distance={30} decay={1.4} />
    </group>
  )
}
