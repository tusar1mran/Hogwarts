import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { runtime } from '../core/runtime'
import { clamp, damp } from '../core/math'
import type { AnimState } from '../core/types'
import { HumanoidRig, PoseBlender, type HumanoidHandle, type RigAppearance } from './HumanoidRig'
import { resolveClip } from './animationMachine'
import { CLIP_MAP } from '../assets/manifest'
import { CharacterAvatar, characterLibraryAvailable, type AvatarController } from './CharacterAvatar'
import { STUDENT_OUTFIT } from './characterModel'
import { FLIGHT_TIMINGS, isBroomVisible } from '../flight/flightMachine'

export const PLAYER_APPEARANCE: RigAppearance = {
  robe: '#1d2238',
  trim: '#b8913f',
  skin: '#d9a982',
  hair: '#3a2416',
  boots: '#2b1d14',
  hood: true,
  wand: true,
}

const ONE_SHOT: AnimState[] = ['jump', 'land', 'cast', 'hit', 'broomMount', 'broomLand']

/* ------------------------------------------------------------------------------------------ */
/* Broom                                                                                       */
/* ------------------------------------------------------------------------------------------ */

function BroomModel() {
  const parts = useMemo(() => {
    const handle = new CylinderGeometry(0.028, 0.035, 2.0, 8)
    handle.rotateX(Math.PI / 2)
    const bristles = new ConeGeometry(0.2, 0.75, 12, 1, true)
    bristles.rotateX(-Math.PI / 2)
    bristles.translate(0, 0, 1.15)
    const band = new TorusGeometry(0.06, 0.015, 6, 12)
    const glow = new SphereGeometry(0.06, 8, 6)
    return {
      handle,
      bristles,
      band,
      glow,
      wood: new MeshStandardMaterial({ color: '#5a3a22', roughness: 0.45 }),
      straw: new MeshStandardMaterial({ color: '#b08a4a', roughness: 0.9, side: 2 }),
      brass: new MeshStandardMaterial({ color: '#c9a050', metalness: 0.9, roughness: 0.3 }),
      glowMat: new MeshBasicMaterial({ color: new Color('#9fd8ff'), transparent: true, opacity: 0.9, blending: AdditiveBlending, toneMapped: false }),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => (p as { dispose: () => void }).dispose())
    },
    [parts],
  )
  return (
    <group>
      <mesh geometry={parts.handle} material={parts.wood} castShadow />
      <mesh geometry={parts.bristles} material={parts.straw} castShadow />
      <mesh geometry={parts.band} material={parts.brass} position={[0, 0, 0.78]} />
      <mesh geometry={parts.band} material={parts.brass} position={[0, 0, 0.84]} />
      <mesh geometry={parts.glow} material={parts.glowMat} position={[0, 0, -1.02]} />
    </group>
  )
}

/** Broom that spirals down when summoned, slides under the rider, and banks with the flight. */
function Broom() {
  const ref = useRef<Group>(null)
  const scale = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const f = runtime.flight
    const p = runtime.player
    const visible = isBroomVisible(f.state)
    scale.current = damp(scale.current, visible ? 1 : 0, visible ? 6 : 10, dt)
    g.visible = scale.current > 0.02
    if (!g.visible) return
    g.scale.setScalar(scale.current)
    const fx = -Math.sin(p.facing)
    const fz = -Math.cos(p.facing)
    if (f.state === 'Summoning') {
      // Spiral in from above and in front.
      const t = Math.min(1, f.stateTime / FLIGHT_TIMINGS.Summoning)
      const a = t * Math.PI * 3
      const r = (1 - t) * 2.5 + 0.9
      g.position.set(p.position.x + fx * 0.9 + Math.cos(a) * r * 0.4, p.position.y + 0.9 + (1 - t) * 4, p.position.z + fz * 0.9 + Math.sin(a) * r * 0.4)
      g.rotation.set(0, p.facing + a * 0.3, 0)
    } else if (f.state === 'Mounting' || f.state === 'Dismounting') {
      const t = Math.min(1, f.stateTime / FLIGHT_TIMINGS.Mounting)
      const k = f.state === 'Mounting' ? t : 1 - t
      g.position.set(p.position.x + fx * (0.9 - k * 0.9) , p.position.y + 0.85 - k * 0.05, p.position.z + fz * (0.9 - k * 0.9))
      g.rotation.set(0, p.facing, 0)
    } else {
      g.position.set(p.position.x, p.position.y + 0.82, p.position.z)
      g.rotation.set(f.pitch * 0.8, f.heading, f.bank, 'YXZ')
    }
  })
  return (
    <group ref={ref} visible={false}>
      <BroomModel />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Procedural avatar                                                                           */
/* ------------------------------------------------------------------------------------------ */

const _tip = new Vector3()

function ProceduralAvatar() {
  const root = useRef<Group>(null)
  const rig = useRef<HumanoidHandle>(null)
  const blender = useMemo(() => new PoseBlender(), [])
  const anim = useRef({ phase: 0, lastState: 'idle' as AnimState, since: 0, t: 0, flightRoll: 0, flightPitch: 0 })

  useFrame((_, rawDt) => {
    const g = root.current
    const r = rig.current
    if (!g || !r?.joints?.hips) return
    const dt = Math.min(rawDt, 0.05)
    const p = runtime.player
    const a = anim.current
    a.t += dt
    if (p.animState !== a.lastState) {
      a.lastState = p.animState
      a.since = a.t
    }
    // Stride phase advances with distance travelled (no foot sliding at any speed).
    const stride = p.sprinting ? 2.1 : 1.5
    a.phase += (p.speed / stride) * Math.PI * dt

    const oneShotDuration = p.animState === 'land' ? (p.landImpact > 9 ? 0.42 : 0.2) : p.animState === 'hit' ? 0.45 : p.animState === 'cast' ? 0.42 : 0.6
    const oneShot = clamp((a.t - a.since) / oneShotDuration, 0, 1)
    blender.update(p.animState, dt, ONE_SHOT.includes(p.animState) ? 18 : 10)
    blender.apply(
      r.joints,
      { t: a.t, phase: a.phase, oneShot, aimPitch: runtime.camera.pitch, turn: Math.sign(runtime.camera.yaw - p.facing) },
      0.98,
    )

    // Root transform: position, facing, and broom banking while flying.
    const flightPose = p.animState === 'fly' || p.animState === 'broomRide' || p.animState === 'broomLand'
    a.flightRoll = damp(a.flightRoll, flightPose ? runtime.flight.bank : 0, 6, dt)
    a.flightPitch = damp(a.flightPitch, flightPose ? runtime.flight.pitch * 0.8 : 0, 6, dt)
    g.position.copy(p.position)
    if (flightPose) g.position.y += 0.05
    g.rotation.set(a.flightPitch, p.facing, a.flightRoll, 'YXZ')

    if (r.wandTip) {
      r.wandTip.getWorldPosition(_tip)
      runtime.wandTip.copy(_tip)
    } else {
      runtime.wandTip.set(p.position.x, p.position.y + 1.4, p.position.z)
    }
  })

  return (
    <group ref={root}>
      <HumanoidRig ref={rig} appearance={PLAYER_APPEARANCE} />
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Dressed skinned character (bundled CC0 model + animation library)                           */
/* ------------------------------------------------------------------------------------------ */

const _pelvis = new Vector3()

function RealisticAvatar() {
  const outer = useRef<Group>(null)
  const seat = useRef<Group>(null)
  const ctrl = useRef<AvatarController>(null)
  const anim = useRef({ state: '' as string, clip: '', roll: 0, pitch: 0, seatOffset: 0 })

  useFrame((_, rawDt) => {
    const c = ctrl.current
    const g = outer.current
    const s = seat.current
    if (!c || !g || !s) return
    const dt = Math.min(rawDt, 0.05)
    const p = runtime.player
    const a = anim.current

    // Pick the clip for the current state; one-shot clips flow into their follow-up loop.
    const spec = CLIP_MAP[p.animState]
    let clip = spec.clip
    const playing = c.current()
    if (p.animState === 'jump' && playing?.getClip().name === 'Jump_Start' && !playing.isRunning()) clip = 'Jump_Loop'
    if (!c.has(clip)) {
      const fallback = resolveClip(p.animState, new Set(Object.entries(CLIP_MAP).filter(([, v]) => c.has(v.clip)).map(([k]) => k)))
      clip = fallback ? CLIP_MAP[fallback].clip : 'Idle_Loop'
    }
    if (clip !== a.clip || (spec.once && p.animState !== a.state)) {
      c.play(clip, { once: spec.once && clip === spec.clip, fade: spec.once ? 0.12 : 0.22 })
      a.clip = clip
    }
    a.state = p.animState
    // Match locomotion playback to ground speed so feet do not slide.
    const action = c.current()
    if (action && spec.speedRef) action.setEffectiveTimeScale(Math.min(1.6, Math.max(0.6, p.speed / spec.speedRef)))
    else if (action) action.setEffectiveTimeScale(1)

    // Root transform: glTF faces +Z, the game's facing 0 is -Z.
    const flying = p.animState === 'fly' || p.animState === 'broomRide' || p.animState === 'broomLand' || p.animState === 'broomMount'
    a.roll = damp(a.roll, flying ? runtime.flight.bank : 0, 6, dt)
    a.pitch = damp(a.pitch, flying ? runtime.flight.pitch * 0.8 : 0, 6, dt)
    g.position.copy(p.position)
    g.rotation.set(a.pitch, p.facing, a.roll, 'YXZ')

    // Sit the pelvis on the broom handle while seated.
    let target = 0
    if (flying && runtime.flight.state !== 'Summoning' && c.pelvis) {
      c.pelvis.getWorldPosition(_pelvis)
      const pelvisLocal = _pelvis.y - g.position.y - a.seatOffset
      target = 0.82 + 0.1 - pelvisLocal
    }
    a.seatOffset = damp(a.seatOffset, target, 8, dt)
    s.position.y = a.seatOffset

    if (c.wandTip) c.wandTip.getWorldPosition(runtime.wandTip)
    else runtime.wandTip.set(p.position.x, p.position.y + 1.4, p.position.z)
  })

  return (
    <group ref={outer}>
      <group ref={seat}>
        <group rotation-y={Math.PI}>
          <CharacterAvatar ref={ctrl} body="male" hair={['parted']} outfit={STUDENT_OUTFIT} />
        </group>
      </group>
    </group>
  )
}

class AvatarErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[avatar] character model failed to load; using the procedural fallback.', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Uses the dressed skinned character when its files are available, otherwise the procedural rig. */
export function PlayerAvatar() {
  const [mode, setMode] = useState<'checking' | 'procedural' | 'model'>('checking')
  useEffect(() => {
    let alive = true
    void characterLibraryAvailable().then((ok) => alive && setMode(ok ? 'model' : 'procedural'))
    return () => {
      alive = false
    }
  }, [])
  const fallback = <ProceduralAvatar />
  return (
    <>
      {mode === 'model' ? (
        <AvatarErrorBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <RealisticAvatar />
          </Suspense>
        </AvatarErrorBoundary>
      ) : (
        fallback
      )}
      <Broom />
    </>
  )
}

export { AvatarErrorBoundary }
