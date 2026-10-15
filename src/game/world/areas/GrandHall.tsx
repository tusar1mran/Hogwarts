import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { InstancedMesh, Matrix4, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { Banner, Block, Column, GableRoof, Stairs, WallSegment, type WallWindow } from '../architecture/Modules'
import { archFrame, archSpandrel, plane, ring, scaledBox, solidCylinder } from '../architecture/geometry'
import { getMaterials } from '../environment/materials'
import { DistanceCull, Flames, LightShaft, MoteField, getSharedFlameMaterial } from '../environment/Atmosphere'
import { GRAND_HALL, GRAND_HALL_HEIGHT } from '../layout'
import { createRng } from '../../core/math'
import { SUN_DIRECTION } from '../environment/Lighting'

type V3 = [number, number, number]
const H = GRAND_HALL_HEIGHT
const T = 2
const CX = 0
const CZ = (GRAND_HALL.minZ + GRAND_HALL.maxZ) / 2

const COLUMN_Z = [-8, -14, -20, -26, -32, -38, -44]
const SIDE_WINDOWS: WallWindow[] = [6, 12, 18, 30, 36, 42].map((at) => ({ at, y: 4.5, width: 2.2, height: 7.5 }))

/** Floating candles that bob gently; matrices update only while the hall is visible. */
function FloatingCandles({ count = 150 }: { count?: number }) {
  const candles = useRef<InstancedMesh>(null)
  const flames = useRef<InstancedMesh>(null)
  const mats = getMaterials()
  const data = useMemo(() => {
    const rng = createRng(42)
    return Array.from({ length: count }, () => ({
      x: (rng() - 0.5) * 20,
      y: 7.5 + rng() * 5,
      z: -6 - rng() * 38,
      phase: rng() * Math.PI * 2,
      h: 0.25 + rng() * 0.25,
    }))
  }, [count])
  const flameGeom = useMemo(() => {
    const g = new PlaneGeometry(1, 1.6)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const obj = useMemo(() => new Object3D(), [])
  const parentVisible = useRef(true)

  useFrame((state) => {
    const c = candles.current
    const f = flames.current
    if (!c || !f) return
    // Skip the CPU work when the cull wrapper hid us.
    parentVisible.current = c.parent?.visible ?? true
    if (!parentVisible.current) return
    const t = state.clock.elapsedTime
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const y = d.y + Math.sin(t * 0.8 + d.phase) * 0.18
      obj.position.set(d.x, y, d.z)
      obj.scale.set(1, d.h / 0.35, 1)
      obj.updateMatrix()
      c.setMatrixAt(i, obj.matrix)
      obj.position.y = y + d.h / 2 + 0.02
      obj.scale.setScalar(0.11)
      obj.updateMatrix()
      f.setMatrixAt(i, obj.matrix)
    }
    c.instanceMatrix.needsUpdate = true
    f.instanceMatrix.needsUpdate = true
  })

  useLayoutEffect(() => {
    // Generous fixed bounds so frustum culling never clips the swarm.
    for (const m of [candles.current, flames.current]) {
      if (!m) continue
      m.computeBoundingSphere()
      if (m.boundingSphere) {
        m.boundingSphere.center.set(0, 10, CZ)
        m.boundingSphere.radius = 30
      }
    }
  }, [])

  return (
    <group>
      <instancedMesh ref={candles} args={[solidCylinder(0.045, 0.05, 0.35, 6), mats.wax, count]} />
      <instancedMesh ref={flames} args={[flameGeom, getSharedFlameMaterial(), count]} />
    </group>
  )
}

function Chandelier({ position }: { position: V3 }) {
  const mats = getMaterials()
  const candleCount = 12
  const flames = useMemo<V3[]>(
    () =>
      Array.from({ length: candleCount }, (_, i) => {
        const a = (i / candleCount) * Math.PI * 2
        return [position[0] + Math.cos(a) * 1.6, position[1] + 0.45, position[2] + Math.sin(a) * 1.6] as V3
      }),
    [position],
  )
  return (
    <group>
      <group position={position}>
        <mesh rotation-x={Math.PI / 2} geometry={ring(1.6, 0.07)} material={mats.iron} />
        <mesh rotation-x={Math.PI / 2} position={[0, -0.4, 0]} geometry={ring(0.8, 0.06)} material={mats.iron} />
        <mesh position={[0, (H + 9 - position[1]) / 2, 0]} geometry={solidCylinder(0.04, 0.04, H + 9 - position[1], 4)} material={mats.iron} />
        {flames.map((p, i) => (
          <mesh key={i} position={[p[0] - position[0], 0.2, p[2] - position[2]]} geometry={solidCylinder(0.05, 0.05, 0.35, 6)} material={mats.wax} />
        ))}
      </group>
      <Flames positions={flames} size={0.16} />
    </group>
  )
}

function Table({ x, z0, z1 }: { x: number; z0: number; z1: number }) {
  const mats = getMaterials()
  const len = Math.abs(z1 - z0)
  const cz = (z0 + z1) / 2
  return (
    <group position={[x, 0, cz]}>
      <mesh position={[0, 0.82, 0]} geometry={scaledBox(1.6, 0.12, len, 2)} material={mats.woodLight} castShadow receiveShadow />
      {[-len / 2 + 0.6, 0, len / 2 - 0.6].map((dz) => (
        <mesh key={dz} position={[0, 0.4, dz]} geometry={scaledBox(1.2, 0.8, 0.18, 1)} material={mats.wood} castShadow />
      ))}
      {[-1.25, 1.25].map((dx) => (
          <mesh key={dx} position={[dx, 0.42, 0]} geometry={scaledBox(0.45, 0.1, len, 2)} material={mats.wood} castShadow receiveShadow />
        ))}
      <CuboidCollider args={[0.8, 0.45, len / 2]} position={[0, 0.45, 0]} />
      {[-1.25, 1.25].map((dx) => (
        <CuboidCollider key={`b${dx}`} args={[0.25, 0.24, len / 2]} position={[dx, 0.24, 0]} />
      ))}
    </group>
  )
}

/** Window light shaft oriented along the sun direction, two crossed planes for volume. */
function WindowShaft({ window }: { window: V3 }) {
  const { position, quaternion, length } = useMemo(() => {
    const from = new Vector3(...window)
    const dir = SUN_DIRECTION.clone().negate() // direction light travels
    const len = Math.min(18, (from.y - 0.2) / Math.max(0.05, -dir.y))
    const to = from.clone().addScaledVector(dir, len)
    const y = from.clone().sub(to).normalize()
    const x = new Vector3().crossVectors(y, new Vector3(0, 1, 0)).normalize()
    const z = new Vector3().crossVectors(x, y)
    const m = new Matrix4().makeBasis(x, y, z)
    const mid = from.clone().lerp(to, 0.5)
    return { position: mid, quaternion: new Quaternion().setFromRotationMatrix(m), length: len }
  }, [window])
  return (
    <group position={position} quaternion={quaternion}>
      <LightShaft position={[0, 0, 0]} rotation={[0, 0, 0]} width={2.4} length={length} />
      <LightShaft position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]} width={2.4} length={length} />
    </group>
  )
}

/**
 * The Grand Hall: a long nave with columns and pointed arcades, two long tables, a raised
 * high table, chandeliers, floating candles, banners and slanting window light.
 */
export function GrandHall() {
  const mats = getMaterials()
  const torchFlames = useMemo<V3[]>(
    () => COLUMN_Z.flatMap((z) => [[-7.3, 4.3, z] as V3, [7.3, 4.3, z] as V3]),
    [],
  )

  return (
    <group>
      {/* Walls (local +Z of each segment faces outside). */}
      <WallSegment
        from={[-12, -2]}
        to={[12, -2]}
        height={H}
        thickness={T}
        openings={[{ at: 12, width: 4.5, height: 7 }]}
        windows={[{ at: 12, y: 9.2, width: 4, height: 5.6 }]}
      />
      <WallSegment from={[12, -50]} to={[-12, -50]} height={H} thickness={T} windows={[{ at: 12, y: 5.5, width: 5, height: 9 }]} />
      <WallSegment from={[12, -2]} to={[12, -50]} height={H} thickness={T} windows={SIDE_WINDOWS} />
      <WallSegment
        from={[-12, -50]}
        to={[-12, -2]}
        height={H}
        thickness={T}
        openings={[{ at: 22, width: 3.6, height: 5.2 }]}
        windows={SIDE_WINDOWS.filter((w) => Math.abs(w.at - 22) > 4)}
      />
      <GableRoof position={[CX, H, CZ]} width={26} length={50} rise={10} />
      {/* Ceiling beams under the roof (visible from inside). */}
      {COLUMN_Z.map((z) => (
        <mesh key={z} position={[0, H - 0.3, z]} geometry={scaledBox(22, 0.5, 0.5, 2)} material={mats.wood} />
      ))}

      {/* Floor and runner carpet. */}
      <mesh position={[0, 0.04, CZ]} rotation-x={-Math.PI / 2} geometry={plane(22, 46, 4)} material={mats.floor} receiveShadow />
      <mesh position={[0, 0.06, CZ + 2]} rotation-x={-Math.PI / 2} geometry={plane(3, 38, 0)} material={mats.fabricRed} receiveShadow />

      {/* Colonnade with pointed arcades. */}
      {COLUMN_Z.map((z) => (
        <group key={z}>
          <Column position={[-6.5, 0, z]} height={9} />
          <Column position={[6.5, 0, z]} height={9} />
        </group>
      ))}
      {COLUMN_Z.slice(0, -1).map((z, i) => {
        const z2 = COLUMN_Z[i + 1]
        const mid = (z + z2) / 2
        const span = Math.abs(z2 - z) - 1.2
        return [-6.5, 6.5].map((x) => (
          <group key={`${x}:${z}`} position={[x, 9, mid]} rotation-y={Math.PI / 2}>
            <mesh geometry={archSpandrel(span, 2.6, 0.9)} material={mats.stoneTrim} castShadow />
            <mesh position={[0, 2.6, 0]} geometry={scaledBox(span + 1.2, 1.4, 0.9, 2)} material={mats.stoneTrim} castShadow />
            <mesh position={[0, -0.01, 0]} geometry={archFrame(span, 0.01, 2.6, 0.25, 0.95)} material={mats.stoneDark} />
          </group>
        ))
      })}

      {/* High-table dais at the north end. */}
      <Block position={[0, 0.3, -46.5]} size={[20, 0.6, 6]} material="floor" />
      <Stairs from={[0, 0, -42.2]} to={[0, 0.6, -43.5]} width={6} />

      <DistanceCull center={[0, 6, CZ]} distance={110}>
        <Table x={-3} z0={-8} z1={-40} />
        <Table x={3} z0={-8} z1={-40} />
        {/* High table on the dais. */}
        <Block position={[0, 1.42, -47.4]} size={[12, 0.12, 1.6]} material="woodLight" collider={false} />
        <Block position={[0, 1.0, -47.4]} size={[11.5, 0.8, 1.2]} material="wood" />
        {/* Braziers either side of the dais. */}
        {[-8, 8].map((x) => (
          <group key={x} position={[x, 0.6, -45]}>
            <mesh position={[0, 0.6, 0]} geometry={solidCylinder(0.12, 0.2, 1.2, 8)} material={mats.iron} castShadow />
            <mesh position={[0, 1.3, 0]} geometry={solidCylinder(0.7, 0.35, 0.4, 12)} material={mats.iron} castShadow />
            <CuboidCollider args={[0.5, 0.75, 0.5]} position={[0, 0.75, 0]} />
          </group>
        ))}
        <FloatingCandles />
        <Chandelier position={[0, 10, -14]} />
        <Chandelier position={[0, 10, -26]} />
        <Chandelier position={[0, 10, -38]} />
        <Banner position={[-10.9, 13, -11]} rotationY={Math.PI / 2} />
        <Banner position={[-10.9, 13, -35]} rotationY={Math.PI / 2} />
        <Banner position={[10.9, 13, -11]} rotationY={-Math.PI / 2} />
        <Banner position={[10.9, 13, -35]} rotationY={-Math.PI / 2} />
        <Flames positions={torchFlames} size={0.24} />
        <Flames positions={[[-8, 2.0, -45], [8, 2.0, -45]]} size={0.75} />
        {[-38, -14].map((z) => (
          <WindowShaft key={z} window={[-11.2, 10.5, z]} />
        ))}
        <MoteField center={[0, 0.5, CZ]} size={[20, 12, 44]} count={220} color="#ffd9a0" pointSize={0.05} speed={0.12} seed={7} intensity={0.7} />
      </DistanceCull>
      {/* Lights stay outside DistanceCull: hiding a light changes the light count and recompiles every shader. */}
      <pointLight position={[0, 9, -16]} color="#ffbb78" intensity={70} distance={36} decay={1.3} />
      <pointLight position={[0, 9, -38]} color="#ffb070" intensity={70} distance={36} decay={1.3} />
    </group>
  )
}
