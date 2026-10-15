import { useLayoutEffect, useMemo, useRef } from 'react'
import { CuboidCollider, CylinderCollider } from '@react-three/rapier'
import { Euler, InstancedMesh, Object3D, Quaternion, Vector3, type Material } from 'three'
import { getMaterials, type MaterialLibrary } from '../environment/materials'
import {
  archFrame,
  archSpandrel,
  columnGeometry,
  gableEnd,
  gothicPane,
  ring,
  scaledBox,
  solidCylinder,
  spireRoof,
  towerBody,
} from './geometry'

type MatKey = {
  [K in keyof MaterialLibrary]: MaterialLibrary[K] extends Material ? K : never
}[keyof MaterialLibrary]

type V3 = [number, number, number]

/* ------------------------------------------------------------------------------------------ */
/* Basic block                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export interface BlockProps {
  position: V3
  size: V3
  material?: MatKey
  rotationY?: number
  collider?: boolean
  tile?: number
  castShadow?: boolean
}

/** A textured stone/wood block with a matching static collider. */
export function Block({ position, size, material = 'stoneWall', rotationY = 0, collider = true, tile = 3, castShadow = true }: BlockProps) {
  const mats = getMaterials()
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh geometry={scaledBox(size[0], size[1], size[2], tile)} material={mats[material]} castShadow={castShadow} receiveShadow />
      {collider && <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Instanced repetition (merlons, balusters, steps)                                            */
/* ------------------------------------------------------------------------------------------ */

export interface InstancedBoxesProps {
  transforms: Array<{ position: V3; rotationY?: number; scale?: V3 }>
  size: V3
  material?: MatKey
  castShadow?: boolean
}

const _obj = new Object3D()

/** Many identical blocks in one draw call. */
export function InstancedBoxes({ transforms, size, material = 'stoneWall', castShadow = true }: InstancedBoxesProps) {
  const ref = useRef<InstancedMesh>(null)
  const mats = getMaterials()
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    transforms.forEach((t, i) => {
      _obj.position.set(...t.position)
      _obj.rotation.set(0, t.rotationY ?? 0, 0)
      if (t.scale) _obj.scale.set(...t.scale)
      else _obj.scale.set(1, 1, 1)
      _obj.updateMatrix()
      mesh.setMatrixAt(i, _obj.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [transforms])
  if (transforms.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[scaledBox(size[0], size[1], size[2], 2), mats[material], transforms.length]}
      castShadow={castShadow}
      receiveShadow
    />
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Walls                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface WallOpening {
  /** Distance of the opening centre from the wall start, metres. */
  at: number
  width: number
  height: number
}

export interface WallWindow {
  at: number
  /** Sill height above the wall base. */
  y: number
  width: number
  height: number
  glass?: 'glassWarm' | 'glassCool'
}

export interface WallSegmentProps {
  from: [number, number]
  to: [number, number]
  base?: number
  height: number
  thickness: number
  openings?: WallOpening[]
  windows?: WallWindow[]
  material?: MatKey
  /** Add merlons along the top. 1 = on the local +Z face, -1 = on the -Z face. */
  crenellated?: 0 | 1 | -1
  plinth?: boolean
}

/**
 * A straight wall between two points with arched doorways and glowing windows.
 * Solid sections and lintels get colliders; the pointed-arch infill is decorative.
 */
export function WallSegment({
  from,
  to,
  base = 0,
  height,
  thickness,
  openings = [],
  windows = [],
  material = 'stoneWall',
  crenellated = 0,
  plinth = true,
}: WallSegmentProps) {
  const mats = getMaterials()
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2

  const { solids, lintels, arches } = useMemo(() => {
    const sorted = [...openings].sort((a, b) => a.at - b.at)
    const solidsOut: Array<{ x0: number; x1: number }> = []
    const lintelsOut: Array<{ x: number; w: number; y0: number }> = []
    const archesOut: Array<{ x: number; w: number; spring: number; rise: number }> = []
    let cursor = 0
    for (const o of sorted) {
      const a = Math.max(0, o.at - o.width / 2)
      const b = Math.min(length, o.at + o.width / 2)
      if (a > cursor + 0.01) solidsOut.push({ x0: cursor, x1: a })
      const rise = o.height - archSpring(o.width, o.height)
      lintelsOut.push({ x: o.at, w: o.width, y0: o.height })
      archesOut.push({ x: o.at, w: o.width, spring: o.height - rise, rise })
      cursor = b
    }
    if (cursor < length - 0.01) solidsOut.push({ x0: cursor, x1: length })
    return { solids: solidsOut, lintels: lintelsOut, arches: archesOut }
  }, [openings, length])

  const merlons = useMemo(() => {
    if (!crenellated) return []
    const out: Array<{ position: V3 }> = []
    const spacing = 1.7
    const count = Math.floor(length / spacing)
    const start = (length - count * spacing) / 2 + spacing / 2
    for (let i = 0; i < count; i++) {
      out.push({ position: [start + i * spacing - length / 2, height + 0.55, crenellated * (thickness / 2 - 0.25)] })
    }
    return out
  }, [crenellated, length, height, thickness])

  const half = length / 2

  return (
    <group position={[cx, base, cz]} rotation-y={-angle}>
      {solids.map((s, i) => {
        const w = s.x1 - s.x0
        const x = (s.x0 + s.x1) / 2 - half
        return (
          <group key={`s${i}`}>
            <mesh position={[x, height / 2, 0]} geometry={scaledBox(w, height, thickness)} material={mats[material]} castShadow receiveShadow />
            <CuboidCollider args={[w / 2, height / 2, thickness / 2]} position={[x, height / 2, 0]} />
            {plinth && (
              <mesh position={[x, 0.6, 0]} geometry={scaledBox(w, 1.2, thickness + 0.35)} material={mats.stoneDark} receiveShadow />
            )}
          </group>
        )
      })}
      {lintels.map((l, i) => {
        const h = height - l.y0
        if (h <= 0.01) return null
        return (
          <group key={`l${i}`}>
            <mesh position={[l.x - half, l.y0 + h / 2, 0]} geometry={scaledBox(l.w, h, thickness)} material={mats[material]} castShadow receiveShadow />
            <CuboidCollider args={[l.w / 2, h / 2, thickness / 2]} position={[l.x - half, l.y0 + h / 2, 0]} />
          </group>
        )
      })}
      {arches.map((a, i) => (
        <group key={`a${i}`} position={[a.x - half, 0, 0]}>
          <mesh position={[0, a.spring, 0]} geometry={archSpandrel(a.w, a.rise, thickness * 0.98)} material={mats[material]} castShadow receiveShadow />
          <mesh position={[0, 0, thickness / 2 + 0.06]} geometry={archFrame(a.w, a.spring, a.rise, 0.45, 0.14)} material={mats.stoneTrim} castShadow receiveShadow />
          <mesh position={[0, 0, -thickness / 2 - 0.06]} geometry={archFrame(a.w, a.spring, a.rise, 0.45, 0.14)} material={mats.stoneTrim} receiveShadow />
        </group>
      ))}
      {windows.map((w, i) => (
        <group key={`w${i}`} position={[w.at - half, w.y, 0]}>
          {[1, -1].map((side) => (
            <group key={side} position={[0, 0, side * (thickness / 2 + 0.03)]} rotation-y={side === 1 ? 0 : Math.PI}>
              <mesh geometry={gothicPane(w.width, w.height)} material={mats[w.glass ?? 'glassWarm']} />
              <mesh
                position={[0, 0, 0.04]}
                geometry={archFrame(w.width, w.height - Math.min(w.width * 0.9, w.height * 0.45), Math.min(w.width * 0.9, w.height * 0.45), 0.3, 0.12)}
                material={mats.stoneTrim}
              />
            </group>
          ))}
        </group>
      ))}
      {merlons.length > 0 && (
        <>
          <InstancedBoxes transforms={merlons} size={[0.9, 1.1, 0.5]} material={material} />
          <CuboidCollider args={[half, 0.55, 0.25]} position={[0, height + 0.55, crenellated * (thickness / 2 - 0.25)]} />
        </>
      )}
      <mesh position={[0, height - 0.15, 0]} geometry={scaledBox(length, 0.3, thickness + 0.25)} material={mats.stoneTrim} receiveShadow />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Towers                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export interface TowerProps {
  x: number
  z: number
  radius: number
  height: number
  roof: 'cone' | 'flat'
  roofHeight?: number
  base?: number
  windowsLit?: boolean
}

/** Round tower: plinth, string courses, lit window slits, and a spire or walkable battlement. */
export function Tower({ x, z, radius, height, roof, roofHeight = radius * 2.4, base = 0, windowsLit = true }: TowerProps) {
  const mats = getMaterials()
  const windows = useMemo(() => {
    const out: Array<{ position: V3; rotationY: number }> = []
    const levels = Math.max(1, Math.floor((height - 6) / 7))
    for (let l = 0; l < levels; l++) {
      const y = 5 + l * 7
      const n = radius > 4 ? 4 : 3
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + l * 0.7
        out.push({ position: [Math.sin(a) * (radius + 0.02), y, Math.cos(a) * (radius + 0.02)], rotationY: a })
      }
    }
    return out
  }, [height, radius])

  const merlons = useMemo(() => {
    if (roof !== 'flat') return []
    const n = Math.max(10, Math.round(radius * 3.2))
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { position: [Math.sin(a) * (radius + 0.35), height + 1.45, Math.cos(a) * (radius + 0.35)] as V3, rotationY: a }
    })
  }, [roof, radius, height])

  const parapetColliders = useMemo(() => {
    if (roof !== 'flat') return []
    const n = 14
    const r = radius + 0.35
    const seg = (2 * Math.PI * r) / n
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { position: [Math.sin(a) * r, height + 1, Math.cos(a) * r] as V3, rotation: [0, a, 0] as V3, half: seg / 2 + 0.1 }
    })
  }, [roof, radius, height])

  return (
    <group position={[x, base, z]}>
      <mesh position={[0, height / 2, 0]} geometry={towerBody(radius, height)} material={mats.stoneWall} castShadow receiveShadow />
      <mesh position={[0, 1, 0]} geometry={solidCylinder(radius + 0.4, radius + 0.6, 2, 28)} material={mats.stoneDark} castShadow receiveShadow />
      <CylinderCollider args={[height / 2, radius + 0.2]} position={[0, height / 2, 0]} />
      {[0.33, 0.66].map((f) => (
        <mesh key={f} position={[0, height * f, 0]} rotation-x={Math.PI / 2} geometry={ring(radius + 0.08, 0.18)} material={mats.stoneTrim} />
      ))}
      {windows.map((w, i) => (
        <group key={i} position={w.position} rotation-y={w.rotationY}>
          <mesh geometry={gothicPane(0.9, 2.2)} material={windowsLit && i % 3 !== 2 ? mats.glassWarm : mats.glassCool} />
        </group>
      ))}
      {roof === 'cone' ? (
        <>
          <mesh position={[0, height, 0]} geometry={solidCylinder(radius + 0.45, radius + 0.2, 1.2, 28)} material={mats.stoneTrim} castShadow />
          <mesh position={[0, height + 0.6, 0]} geometry={spireRoof(radius, roofHeight)} material={mats.roof} castShadow />
          <mesh position={[0, height + 0.6 + roofHeight + 0.8, 0]} geometry={solidCylinder(0.05, 0.12, 2.2, 6)} material={mats.brass} />
          <CylinderCollider args={[roofHeight / 3, radius * 0.9]} position={[0, height + roofHeight / 3, 0]} />
        </>
      ) : (
        <>
          <mesh position={[0, height + 0.25, 0]} geometry={solidCylinder(radius + 0.6, radius + 0.3, 0.5, 28)} material={mats.stoneTrim} receiveShadow castShadow />
          <mesh position={[0, height + 0.52, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[radius + 0.3, 28]} />
            <primitive object={mats.floor} attach="material" />
          </mesh>
          <mesh position={[0, height + 0.9, 0]} geometry={towerBody(radius + 0.55, 0.8, 28)} material={mats.stoneWall} castShadow receiveShadow />
          <InstancedBoxes transforms={merlons} size={[0.8, 0.9, 0.5]} />
          <CylinderCollider args={[0.27, radius + 0.45]} position={[0, height + 0.25, 0]} />
          {parapetColliders.map((c, i) => (
            <CuboidCollider key={i} args={[c.half, 0.9, 0.3]} position={c.position} rotation={c.rotation} />
          ))}
        </>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Columns, stairs, railings, roofs                                                            */
/* ------------------------------------------------------------------------------------------ */

export function Column({ position, height, radius = 0.55 }: { position: V3; height: number; radius?: number }) {
  const mats = getMaterials()
  return (
    <group position={position}>
      <mesh geometry={columnGeometry(radius, height)} material={mats.stoneTrim} castShadow receiveShadow />
      <CylinderCollider args={[height / 2, radius * 1.2]} position={[0, height / 2, 0]} />
    </group>
  )
}

export interface StairsProps {
  /** Bottom-front centre of the flight. */
  from: V3
  /** Top-back centre of the flight. */
  to: V3
  width: number
  material?: MatKey
}

/**
 * A straight flight of steps. Visual treads are instanced; collision is a single smooth ramp
 * so the character controller climbs without snagging on individual steps.
 */
export function Stairs({ from, to, width, material = 'stoneTrim' }: StairsProps) {
  const { steps, ramp, stepSize } = useMemo(() => {
    const a = new Vector3(...from)
    const b = new Vector3(...to)
    const rise = b.y - a.y
    const horiz = new Vector3(b.x - a.x, 0, b.z - a.z)
    const run = horiz.length()
    const dir = horiz.clone().normalize()
    const yaw = Math.atan2(dir.x, dir.z)
    const count = Math.max(2, Math.round(rise / 0.22))
    const tread = run / count
    const stepH = rise / count
    // Each tread is a solid block down to the base of the flight (unit height, scaled per step).
    const out: Array<{ position: V3; rotationY: number; scale: V3 }> = []
    for (let i = 0; i < count; i++) {
      const p = a.clone().addScaledVector(dir, tread * (i + 0.5))
      const h = stepH * (i + 1)
      out.push({ position: [p.x, a.y + h / 2, p.z], rotationY: yaw, scale: [1, h, 1] })
    }
    const slope = Math.atan2(rise, run)
    const len = Math.hypot(rise, run)
    const mid = a.clone().lerp(b, 0.5)
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -slope))
    const thickness = 0.3
    // Offset the ramp down along its normal so its top surface passes through the step nosings.
    const normal = new Vector3(0, 1, 0).applyQuaternion(q)
    mid.addScaledVector(normal, -thickness / 2)
    return {
      steps: out,
      stepSize: [width, 1, tread * 1.02] as V3,
      ramp: { position: [mid.x, mid.y, mid.z] as V3, quaternion: q, half: [width / 2, thickness / 2, len / 2] as V3 },
    }
  }, [from, to, width])

  const rampRotation = useMemo(() => {
    const e = new Euler().setFromQuaternion(ramp.quaternion)
    return [e.x, e.y, e.z] as V3
  }, [ramp])

  return (
    <group>
      <InstancedBoxes transforms={steps} size={stepSize} material={material} />
      <CuboidCollider args={ramp.half} position={ramp.position} rotation={rampRotation} />
    </group>
  )
}

export function Railing({ from, to, y, height = 1.05 }: { from: [number, number]; to: [number, number]; y: number; height?: number }) {
  const mats = getMaterials()
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const balusters = useMemo(() => {
    const n = Math.max(2, Math.floor(length / 0.45))
    return Array.from({ length: n }, (_, i) => ({ position: [-length / 2 + (i + 0.5) * (length / n), height / 2, 0] as V3 }))
  }, [length, height])
  return (
    <group position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation-y={-angle}>
      <InstancedBoxes transforms={balusters} size={[0.12, height, 0.12]} material="wood" castShadow={false} />
      <mesh position={[0, height, 0]} geometry={scaledBox(length, 0.12, 0.22, 2)} material={mats.wood} castShadow />
      <CuboidCollider args={[length / 2, (height + 0.3) / 2, 0.15]} position={[0, (height + 0.3) / 2, 0]} />
    </group>
  )
}

export interface GableRoofProps {
  /** Centre of the roof base (top of the walls). */
  position: V3
  /** Span across the ridge (X before rotation). */
  width: number
  /** Length along the ridge (Z before rotation). */
  length: number
  rise: number
  rotationY?: number
  overhang?: number
}

/** Pitched slate roof with stone gable ends and a ridge cap. */
export function GableRoof({ position, width, length, rise, rotationY = 0, overhang = 0.8 }: GableRoofProps) {
  const mats = getMaterials()
  const half = width / 2 + overhang
  const slopeLen = Math.hypot(half, rise)
  const angle = Math.atan2(rise, half)
  const L = length + overhang * 2
  return (
    <group position={position} rotation-y={rotationY}>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[(side * half) / 2, rise / 2, 0]}
          rotation-z={side * -angle}
          geometry={scaledBox(slopeLen + 0.2, 0.35, L, 4)}
          material={mats.roof}
          castShadow
          receiveShadow
        />
      ))}
      <mesh position={[0, 0, length / 2 - 0.5]} geometry={gableEnd(width, rise, 1)} material={mats.stoneWall} castShadow receiveShadow />
      <mesh position={[0, 0, -length / 2 + 0.5]} geometry={gableEnd(width, rise, 1)} material={mats.stoneWall} castShadow receiveShadow />
      <mesh position={[0, rise + 0.12, 0]} geometry={scaledBox(0.5, 0.4, L, 2)} material={mats.stoneTrim} castShadow />
      {/* Roof collision: one slab per side so flyers can land on and slide off roofs. */}
      {[1, -1].map((side) => (
        <CuboidCollider
          key={`c${side}`}
          args={[slopeLen / 2, 0.3, L / 2]}
          position={[(side * half) / 2, rise / 2, 0]}
          rotation={[0, 0, side * -angle]}
        />
      ))}
    </group>
  )
}

/** Hanging fabric banner with the academy crest. */
export function Banner({ position, rotationY = 0, width = 2.2, height = 5 }: { position: V3; rotationY?: number; width?: number; height?: number }) {
  const mats = getMaterials()
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, -height / 2, 0]}>
        <planeGeometry args={[width, height, 1, 6]} />
        <primitive object={mats.banner} attach="material" />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation-z={Math.PI / 2} geometry={solidCylinder(0.06, 0.06, width + 0.5, 6)} material={mats.brass} />
    </group>
  )
}

/** Height of the springing line of a doorway created by WallSegment (top of a door leaf). */
export const archSpring = (width: number, height: number) => height - Math.min(width * 0.55, height * 0.35)
