import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import {
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  Vector2,
  type Object3D,
} from 'three'
import type { AnimState } from '../core/types'
import { dampFactor } from '../core/math'

/**
 * Procedural humanoid: a real joint hierarchy (hips, spine, chest, neck, head, shoulders,
 * elbows, wrists, hips, knees, ankles) dressed in an academy robe, belt, boots and a wand.
 *
 * This is a documented stand-in for a skinned GLB character (see ASSETS.md). It is not a
 * realistic model; it exists so every animation state is visible and testable without
 * third-party art. Gameplay never depends on it: the same AnimState drives a GLB if present.
 */

export interface RigAppearance {
  robe: string
  trim: string
  skin: string
  hair: string
  boots?: string
  hat?: boolean
  beard?: boolean
  /** Uniform scale, 1 = 1.8 m tall. */
  scale?: number
  hood?: boolean
  wand?: boolean
}

export type Joint =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'upperArmL'
  | 'upperArmR'
  | 'forearmL'
  | 'forearmR'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'footL'
  | 'footR'
  | 'robe'

export const JOINTS: Joint[] = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'robe']

type Rot = [number, number, number]
export type Pose = Partial<Record<Joint, Rot>> & { hipsY?: number }

export interface PoseParams {
  t: number
  phase: number
  /** 0..1 progress of a one-shot (cast, land, hit). */
  oneShot: number
  aimPitch: number
  turn: number
}

const S = Math.sin

/** Pose library. Each entry returns joint rotations in radians (x forward-swing for limbs). */
export const POSES: Record<AnimState, (p: PoseParams) => Pose> = {
  idle: ({ t }) => ({
    chest: [S(t * 1.6) * 0.025, 0, 0],
    head: [S(t * 0.7) * 0.03, S(t * 0.35) * 0.12, 0],
    upperArmL: [0.05, 0, -0.1],
    upperArmR: [0.15, 0, 0.12],
    forearmL: [0.2, 0, 0],
    forearmR: [0.55, 0, 0],
    thighL: [0.02, 0, -0.03],
    thighR: [-0.02, 0, 0.03],
    hipsY: S(t * 1.6) * 0.005,
  }),
  walk: ({ phase }) => ({
    hips: [0, S(phase) * 0.08, 0],
    spine: [-0.05, 0, 0],
    chest: [0, -S(phase) * 0.1, 0],
    upperArmL: [-S(phase) * 0.45, 0, -0.08],
    upperArmR: [S(phase) * 0.3 + 0.2, 0, 0.1],
    forearmL: [0.25, 0, 0],
    forearmR: [0.6, 0, 0],
    thighL: [S(phase) * 0.5, 0, 0],
    thighR: [-S(phase) * 0.5, 0, 0],
    shinL: [-(0.1 + 0.6 * Math.max(0, Math.cos(phase))), 0, 0],
    shinR: [-(0.1 + 0.6 * Math.max(0, -Math.cos(phase))), 0, 0],
    footL: [0.1, 0, 0],
    footR: [0.1, 0, 0],
    robe: [-0.06, 0, S(phase) * 0.03],
    hipsY: -Math.abs(S(phase)) * 0.035,
  }),
  run: ({ phase }) => ({
    hips: [0, S(phase) * 0.12, 0],
    spine: [-0.28, 0, 0],
    chest: [0, -S(phase) * 0.16, 0],
    head: [0.18, 0, 0],
    upperArmL: [-S(phase) * 0.85, 0, -0.15],
    upperArmR: [S(phase) * 0.7 + 0.2, 0, 0.15],
    forearmL: [1.2, 0, 0],
    forearmR: [1.1, 0, 0],
    thighL: [S(phase) * 0.95, 0, 0],
    thighR: [-S(phase) * 0.95, 0, 0],
    shinL: [-(0.2 + 1.2 * Math.max(0, Math.cos(phase))), 0, 0],
    shinR: [-(0.2 + 1.2 * Math.max(0, -Math.cos(phase))), 0, 0],
    footL: [0.2, 0, 0],
    footR: [0.2, 0, 0],
    robe: [-0.2, 0, S(phase) * 0.05],
    hipsY: -Math.abs(S(phase)) * 0.07 - 0.03,
  }),
  start: ({ phase }) => ({
    spine: [-0.18, 0, 0],
    upperArmL: [-S(phase) * 0.3, 0, -0.1],
    upperArmR: [0.3, 0, 0.12],
    forearmR: [0.6, 0, 0],
    thighL: [S(phase) * 0.35 + 0.1, 0, 0],
    thighR: [-S(phase) * 0.35, 0, 0],
    shinL: [-0.3, 0, 0],
    shinR: [-0.2, 0, 0],
    robe: [-0.08, 0, 0],
    hipsY: -0.02,
  }),
  stop: () => ({
    spine: [0.16, 0, 0],
    upperArmL: [0.35, 0, -0.25],
    upperArmR: [0.45, 0, 0.25],
    forearmR: [0.7, 0, 0],
    thighL: [0.35, 0, 0],
    thighR: [-0.25, 0, 0],
    shinL: [-0.2, 0, 0],
    shinR: [-0.45, 0, 0],
    robe: [0.12, 0, 0],
    hipsY: -0.05,
  }),
  turn: ({ turn, t }) => ({
    hips: [0, turn * 0.25, 0],
    chest: [0, turn * 0.15, 0],
    thighL: [S(t * 12) * 0.25, 0, 0],
    thighR: [-S(t * 12) * 0.25, 0, 0],
    shinL: [-0.25, 0, 0],
    upperArmR: [0.2, 0, 0.15],
    forearmR: [0.55, 0, 0],
  }),
  jump: () => ({
    spine: [-0.1, 0, 0],
    upperArmL: [-0.5, 0, -0.55],
    upperArmR: [-0.3, 0, 0.55],
    forearmL: [0.4, 0, 0],
    forearmR: [0.6, 0, 0],
    thighL: [0.8, 0, 0],
    thighR: [-0.15, 0, 0],
    shinL: [-1.0, 0, 0],
    shinR: [-0.35, 0, 0],
    robe: [0.15, 0, 0],
    hipsY: 0.02,
  }),
  fall: ({ t }) => ({
    spine: [0.1, 0, 0],
    upperArmL: [0, 0, -1.05 + S(t * 9) * 0.1],
    upperArmR: [0, 0, 1.05 - S(t * 9) * 0.1],
    forearmL: [0.3, 0, 0],
    forearmR: [0.3, 0, 0],
    thighL: [0.35, 0, -0.05],
    thighR: [0.05, 0, 0.05],
    shinL: [-0.6, 0, 0],
    shinR: [-0.35, 0, 0],
    robe: [0.3, 0, S(t * 7) * 0.05],
  }),
  land: ({ oneShot }) => {
    const k = Math.sin(Math.min(1, oneShot) * Math.PI)
    return {
      spine: [-0.35 * k, 0, 0],
      upperArmL: [0.3 * k, 0, -0.35 * k],
      upperArmR: [0.4 * k, 0, 0.35 * k],
      forearmR: [0.6, 0, 0],
      thighL: [0.95 * k, 0, 0],
      thighR: [0.85 * k, 0, 0],
      shinL: [-1.5 * k, 0, 0],
      shinR: [-1.4 * k, 0, 0],
      footL: [0.55 * k, 0, 0],
      footR: [0.55 * k, 0, 0],
      hipsY: -0.28 * k,
    }
  },
  aim: ({ aimPitch, t }) => ({
    spine: [-0.05, 0, 0],
    chest: [0, -0.32, 0],
    head: [-aimPitch * 0.4, 0.3, 0],
    upperArmR: [1.45 + aimPitch, 0.05, 0.08],
    forearmR: [0.08, 0, 0],
    handR: [0.05, 0, 0],
    upperArmL: [0.5, 0, -0.25],
    forearmL: [0.9, 0, 0],
    thighL: [0.18, 0, -0.05],
    thighR: [-0.12, 0, 0.08],
    hipsY: S(t * 1.6) * 0.004 - 0.02,
  }),
  cast: ({ oneShot, aimPitch }) => {
    // Wind-up then a sharp forward flick.
    const flick = oneShot < 0.3 ? -oneShot / 0.3 : -1 + Math.min(1, (oneShot - 0.3) / 0.25) * 1.6
    return {
      chest: [0, -0.35 - flick * 0.12, 0],
      spine: [-0.08 + flick * 0.06, 0, 0],
      head: [-aimPitch * 0.4, 0.3, 0],
      upperArmR: [1.5 + aimPitch + flick * 0.35, 0.05, 0.1],
      forearmR: [0.15 - flick * 0.45, 0, 0],
      handR: [-flick * 0.4, 0, 0],
      upperArmL: [0.4, 0, -0.35],
      forearmL: [0.8, 0, 0],
      thighL: [0.22, 0, -0.05],
      thighR: [-0.15, 0, 0.08],
      hipsY: -0.03,
    }
  },
  hit: ({ oneShot }) => {
    const k = Math.sin(Math.min(1, oneShot) * Math.PI)
    return {
      spine: [0.35 * k, 0, 0.1 * k],
      chest: [0.15 * k, 0.2 * k, 0],
      head: [0.35 * k, 0, 0],
      upperArmL: [-0.3 * k, 0, -0.7 * k],
      upperArmR: [-0.2 * k, 0, 0.7 * k],
      thighL: [-0.2 * k, 0, 0],
      thighR: [0.25 * k, 0, 0],
      shinR: [-0.35 * k, 0, 0],
      hipsY: -0.06 * k,
    }
  },
  broomMount: ({ oneShot }) => ({
    spine: [-0.35, 0, 0],
    upperArmL: [0.9, 0, -0.1],
    upperArmR: [0.9, 0, 0.1],
    forearmL: [0.3, 0, 0],
    forearmR: [0.3, 0, 0],
    thighL: [0.6 + oneShot * 0.4, 0, -0.15],
    thighR: [0.5, 0, 0.15],
    shinL: [-0.7, 0, 0],
    shinR: [-0.6, 0, 0],
    hipsY: -0.18,
  }),
  broomRide: ({ t }) => ({
    spine: [-0.4, 0, 0],
    head: [0.3, 0, 0],
    upperArmL: [1.05, 0, -0.08],
    upperArmR: [1.05, 0, 0.08],
    forearmL: [0.35, 0, 0],
    forearmR: [0.35, 0, 0],
    thighL: [1.25, 0, -0.2],
    thighR: [1.25, 0, 0.2],
    shinL: [-1.25, 0, 0],
    shinR: [-1.25, 0, 0],
    footL: [0.3, 0, 0],
    footR: [0.3, 0, 0],
    robe: [0.65 + S(t * 9) * 0.04, 0, S(t * 6) * 0.04],
    hipsY: -0.05,
  }),
  fly: ({ t }) => ({
    spine: [-0.55, 0, 0],
    head: [0.45, 0, 0],
    upperArmL: [1.15, 0, -0.08],
    upperArmR: [1.15, 0, 0.08],
    forearmL: [0.25, 0, 0],
    forearmR: [0.25, 0, 0],
    thighL: [1.15, 0, -0.18],
    thighR: [1.15, 0, 0.18],
    shinL: [-1.45, 0, 0],
    shinR: [-1.45, 0, 0],
    footL: [0.4, 0, 0],
    footR: [0.4, 0, 0],
    robe: [0.9 + S(t * 14) * 0.06, 0, S(t * 9) * 0.06],
    hipsY: -0.05,
  }),
  broomLand: () => ({
    spine: [-0.2, 0, 0],
    upperArmL: [0.95, 0, -0.1],
    upperArmR: [0.95, 0, 0.1],
    forearmL: [0.3, 0, 0],
    forearmR: [0.3, 0, 0],
    thighL: [0.55, 0, -0.15],
    thighR: [0.45, 0, 0.15],
    shinL: [-0.5, 0, 0],
    shinR: [-0.4, 0, 0],
    robe: [0.25, 0, 0],
    hipsY: -0.08,
  }),
}

/** Blend weights per state, smoothed so transitions cross-fade instead of snapping. */
export class PoseBlender {
  weights = new Map<AnimState, number>()
  private acc: Record<string, Rot> = {}

  update(target: AnimState, dt: number, speed = 12) {
    if (!this.weights.has(target)) this.weights.set(target, 0)
    const f = dampFactor(speed, dt)
    for (const [state, w] of this.weights) {
      const goal = state === target ? 1 : 0
      const next = w + (goal - w) * f
      if (next < 0.001 && goal === 0) this.weights.delete(state)
      else this.weights.set(state, next)
    }
  }

  /** Writes blended rotations into the joint objects. */
  apply(joints: Record<Joint, Object3D>, params: PoseParams, baseHipsY: number) {
    let total = 0
    let hipsY = 0
    for (const j of JOINTS) {
      const a = (this.acc[j] ??= [0, 0, 0])
      a[0] = a[1] = a[2] = 0
    }
    for (const [state, w] of this.weights) {
      const pose = POSES[state](params)
      total += w
      hipsY += (pose.hipsY ?? 0) * w
      for (const j of JOINTS) {
        const r = pose[j]
        if (!r) continue
        const a = this.acc[j]
        a[0] += r[0] * w
        a[1] += r[1] * w
        a[2] += r[2] * w
      }
    }
    const inv = total > 0 ? 1 / total : 0
    for (const j of JOINTS) {
      const a = this.acc[j]
      joints[j].rotation.set(a[0] * inv, a[1] * inv, a[2] * inv)
    }
    joints.hips.position.y = baseHipsY + hipsY * inv
  }
}

export interface HumanoidHandle {
  joints: Record<Joint, Object3D>
  wandTip: Object3D | null
  /** The wand group under handR (holds the wand mesh + wandTip empty); settable so the aim correction can orient it. */
  wandRoot: Object3D | null
  root: Group
}

/** Builds the joint hierarchy with meshes. Shared geometries keep NPCs cheap. */
export const HumanoidRig = forwardRef<HumanoidHandle, { appearance: RigAppearance }>(function HumanoidRig({ appearance }, ref) {
  const root = useRef<Group>(null)
  const jointRefs = useRef<Partial<Record<Joint, Object3D>>>({})
  const wandTip = useRef<Object3D>(null)
  const wandRoot = useRef<Object3D>(null)

  const mats = useMemo(
    () => ({
      robe: new MeshStandardMaterial({ color: appearance.robe, roughness: 0.85 }),
      trim: new MeshStandardMaterial({ color: appearance.trim, roughness: 0.6, metalness: 0.2 }),
      skin: new MeshStandardMaterial({ color: appearance.skin, roughness: 0.65 }),
      hair: new MeshStandardMaterial({ color: appearance.hair, roughness: 0.9 }),
      boots: new MeshStandardMaterial({ color: appearance.boots ?? '#2a1d16', roughness: 0.55 }),
      leather: new MeshStandardMaterial({ color: '#4a3020', roughness: 0.6 }),
      brass: new MeshStandardMaterial({ color: '#c49a4a', roughness: 0.3, metalness: 0.9 }),
      wand: new MeshStandardMaterial({ color: '#3a2618', roughness: 0.5 }),
      wandTip: new MeshStandardMaterial({ color: '#cfeaff', emissive: new Color('#7fc8ff'), emissiveIntensity: 2.5, toneMapped: false }),
      eye: new MeshStandardMaterial({ color: '#1a1410', roughness: 0.3 }),
    }),
    [appearance],
  )

  const geo = useMemo(() => {
    const skirtPts: Vector2[] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      skirtPts.push(new Vector2(0.17 + Math.pow(t, 1.4) * 0.27, -t * 0.88))
    }
    const sleevePts = [
      [0.06, 0],
      [0.065, -0.2],
      [0.075, -0.24],
      [0.1, -0.29],
      [0.11, -0.3],
    ].map(([x, y]) => new Vector2(x, y))
    return {
      skirt: new LatheGeometry(skirtPts, 18),
      torso: new CapsuleGeometry(0.16, 0.26, 6, 14),
      head: new SphereGeometry(0.115, 18, 14),
      hairCap: new SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hood: new SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
      upperArm: new CapsuleGeometry(0.055, 0.2, 4, 8).translate(0, -0.14, 0),
      sleeve: new LatheGeometry(sleevePts, 10),
      hand: new SphereGeometry(0.045, 8, 6),
      thigh: new CapsuleGeometry(0.07, 0.3, 4, 8).translate(0, -0.21, 0),
      shin: new CapsuleGeometry(0.058, 0.3, 4, 8).translate(0, -0.21, 0),
      boot: new BoxGeometry(0.11, 0.09, 0.24).translate(0, -0.03, -0.05),
      belt: new TorusGeometry(0.175, 0.022, 6, 20),
      collar: new TorusGeometry(0.105, 0.03, 6, 16),
      buckle: new BoxGeometry(0.06, 0.05, 0.02),
      pouch: new BoxGeometry(0.08, 0.09, 0.05),
      strap: new BoxGeometry(0.035, 0.6, 0.02),
      wand: new CylinderGeometry(0.007, 0.012, 0.34, 6).translate(0, -0.17, 0),
      wandTip: new SphereGeometry(0.018, 8, 6),
      eye: new SphereGeometry(0.014, 6, 4),
      hat: new CylinderGeometry(0.0, 0.16, 0.38, 14).translate(0, 0.19, 0),
      brim: new CylinderGeometry(0.24, 0.24, 0.015, 18),
      beard: new SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6),
    }
  }, [])

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose())
      Object.values(geo).forEach((g) => g.dispose())
    },
    [mats, geo],
  )

  useImperativeHandle(
    ref,
    () => ({
      joints: jointRefs.current as Record<Joint, Object3D>,
      wandTip: wandTip.current,
      wandRoot: wandRoot.current,
      root: root.current as Group,
    }),
    [],
  )

  const j = (name: Joint) => (o: Object3D | null) => {
    if (o) jointRefs.current[name] = o
  }
  const scale = appearance.scale ?? 1

  return (
    <group ref={root} scale={scale}>
      <group ref={j('hips')} position={[0, 0.98, 0]}>
        {/* Robe skirt sways from the waist. */}
        <group ref={j('robe')}>
          <mesh geometry={geo.skirt} material={mats.robe} castShadow position={[0, 0.02, 0]} />
        </group>
        <mesh geometry={geo.belt} material={mats.leather} rotation-x={Math.PI / 2} position={[0, 0.05, 0]} />
        <mesh geometry={geo.buckle} material={mats.brass} position={[0, 0.05, -0.19]} />
        <mesh geometry={geo.pouch} material={mats.leather} position={[0.15, 0.0, -0.09]} rotation-y={0.5} />
        <group ref={j('spine')} position={[0, 0.1, 0]}>
          <group ref={j('chest')} position={[0, 0.16, 0]}>
            <mesh geometry={geo.torso} material={mats.robe} castShadow scale={[1, 1, 0.78]} position={[0, 0.04, 0]} />
            <mesh geometry={geo.strap} material={mats.leather} position={[0, 0.05, -0.13]} rotation-z={0.6} />
            <mesh geometry={geo.collar} material={mats.trim} rotation-x={Math.PI / 2} position={[0, 0.27, 0]} />
            {appearance.hood !== false && <mesh geometry={geo.hood} material={mats.robe} position={[0, 0.25, 0.09]} rotation-x={2.2} />}
            <group ref={j('neck')} position={[0, 0.3, 0]}>
              <group ref={j('head')} position={[0, 0.1, 0]}>
                <mesh geometry={geo.head} material={mats.skin} castShadow />
                <mesh geometry={geo.hairCap} material={mats.hair} rotation-x={-0.35} position={[0, 0.012, 0.012]} />
                <mesh geometry={geo.eye} material={mats.eye} position={[-0.04, 0.015, -0.105]} />
                <mesh geometry={geo.eye} material={mats.eye} position={[0.04, 0.015, -0.105]} />
                {appearance.beard && <mesh geometry={geo.beard} material={mats.hair} position={[0, -0.06, -0.05]} />}
                {appearance.hat && (
                  <group position={[0, 0.08, 0]}>
                    <mesh geometry={geo.brim} material={mats.robe} />
                    <mesh geometry={geo.hat} material={mats.robe} rotation-x={0.12} castShadow />
                  </group>
                )}
              </group>
            </group>
            {/* Arms: shoulder -> elbow -> wrist. Character right is +X (faces -Z). */}
            {(['L', 'R'] as const).map((side) => {
              const sx = side === 'R' ? 1 : -1
              return (
                <group key={side} ref={j(side === 'R' ? 'upperArmR' : 'upperArmL')} position={[sx * 0.21, 0.2, 0]}>
                  <mesh geometry={geo.upperArm} material={mats.robe} castShadow />
                  <group ref={j(side === 'R' ? 'forearmR' : 'forearmL')} position={[0, -0.29, 0]}>
                    <mesh geometry={geo.sleeve} material={mats.robe} castShadow />
                    {side === 'R' ? (
                      <group ref={j('handR')} position={[0, -0.32, 0]}>
                        <mesh geometry={geo.hand} material={mats.skin} />
                        {appearance.wand !== false && (
                          <group ref={wandRoot} rotation-x={0.25} position={[0, -0.02, -0.02]}>
                            <mesh geometry={geo.wand} material={mats.wand} />
                            <mesh geometry={geo.wandTip} material={mats.wandTip} position={[0, -0.34, 0]} />
                            <object3D ref={wandTip} position={[0, -0.36, 0]} />
                          </group>
                        )}
                      </group>
                    ) : (
                      <mesh geometry={geo.hand} material={mats.skin} position={[0, -0.32, 0]} />
                    )}
                  </group>
                </group>
              )
            })}
          </group>
        </group>
        {/* Legs: hip -> knee -> ankle. */}
        {(['L', 'R'] as const).map((side) => {
          const sx = side === 'R' ? 1 : -1
          return (
            <group key={side} ref={j(side === 'R' ? 'thighR' : 'thighL')} position={[sx * 0.1, -0.04, 0]}>
              <mesh geometry={geo.thigh} material={mats.robe} />
              <group ref={j(side === 'R' ? 'shinR' : 'shinL')} position={[0, -0.43, 0]}>
                <mesh geometry={geo.shin} material={mats.boots} castShadow />
                <group ref={j(side === 'R' ? 'footR' : 'footL')} position={[0, -0.43, 0]}>
                  <mesh geometry={geo.boot} material={mats.boots} castShadow />
                </group>
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
})
