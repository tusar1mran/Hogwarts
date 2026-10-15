import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Quaternion, Vector3 } from 'three'
import { runtime } from '../core/runtime'
import { clamp, damp, dampFactor } from '../core/math'
import type { AnimState } from '../core/types'
import { HumanoidRig, PoseBlender, type HumanoidHandle, type RigAppearance } from './HumanoidRig'
import { ANIM_TIMINGS, resolveClip } from './animationMachine'
import { CLIP_MAP } from '../assets/manifest'
import { CharacterAvatar, characterLibraryAvailable, type AvatarController } from './CharacterAvatar'
import { STUDENT_OUTFIT } from './characterModel'
import { FLIGHT_TIMINGS, isAirborneFlightState, isBroomVisible } from '../flight/flightMachine'
import { clampWorldAimPitch, wandAimRotation } from './wandAim'
import { BroomModel } from '../world/BroomModel'
import { applyGesture, poseWandArm, wandGesturePose, type GesturePose } from './wandGesture'

/** Current wand gesture pose, or null when the player is not casting on the ground. */
function currentGesture(): GesturePose | null {
  const p = runtime.player
  if (p.castStartedAt < 0 || runtime.flight.state !== 'Grounded') return null
  const pose = wandGesturePose(runtime.time - p.castStartedAt)
  return pose.weight > 0 ? pose : null
}

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
const _parentQuat = new Quaternion()
const _localAim = new Vector3()
const _aimRot = new Quaternion()

function ProceduralAvatar() {
  const root = useRef<Group>(null)
  const rig = useRef<HumanoidHandle>(null)
  const blender = useMemo(() => new PoseBlender(), [])
  const anim = useRef({ phase: 0, lastState: 'idle' as AnimState, since: 0, t: 0, flightRoll: 0, flightPitch: 0, aimK: 0, wandRest: null as Quaternion | null })

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

    const oneShotDuration = p.animState === 'land' ? (p.landImpact > 9 ? 0.42 : 0.2) : p.animState === 'hit' ? 0.45 : p.animState === 'cast' ? ANIM_TIMINGS.cast : 0.6
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

    // Point the wand along the aim direction while aiming or during the cast flick, but only
    // on the ground so it never fights the broom riding pose. Done after blender.apply (which
    // sets the hand/wand group's base rotation) and before sampling the tip below.
    const casting = p.castStartedAt >= 0 && runtime.time - p.castStartedAt < ANIM_TIMINGS.cast
    const wantAim = (p.aiming || casting) && !flightPose && !isAirborneFlightState(runtime.flight.state)
    a.aimK = a.aimK + ((wantAim ? 1 : 0) - a.aimK) * dampFactor(12, dt)
    // Throw: the arm thrusts out along
    // the aim; the wand group follows below (aim + wrist flick).
    const gesture = currentGesture()
    if (gesture) {
      const arm = { upper: r.joints.upperArmR, fore: r.joints.forearmR, hand: r.joints.handR, tip: null }
      poseWandArm(arm, gesture, p.facing, clampWorldAimPitch(runtime.aim.direction), { fore: 0.45, hand: 0 })
    }
    // The pose blender does not drive the wand group, so restore its rest rotation each frame
    // before layering aim and gesture on top; otherwise the corrections would accumulate.
    if (r.wandRoot) {
      a.wandRest ??= r.wandRoot.quaternion.clone()
      r.wandRoot.quaternion.copy(a.wandRest)
    }
    if (a.aimK > 0.001 && r.wandRoot && r.wandRoot.parent) {
      const worldAim = clampWorldAimPitch(runtime.aim.direction)
      // Bring the clamped world aim into the wand group's parent space, then build the rotation.
      r.wandRoot.parent.getWorldQuaternion(_parentQuat).invert()
      _localAim.copy(worldAim).applyQuaternion(_parentQuat)
      _aimRot.copy(wandAimRotation(_localAim))
      r.wandRoot.quaternion.slerp(_aimRot, a.aimK)
    }
    if (gesture && r.wandRoot) applyGesture(r.wandRoot, gesture, p.facing, 0.8)

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

  })

  // Runs after the mixer has posed the skeleton, so the wand gesture layers over the cast clip
  // and the tip position (projectile origin) includes it.
  const afterAnimate = useCallback(() => {
    const c = ctrl.current
    const p = runtime.player
    if (!c) return
    const gesture = currentGesture()
    if (gesture) {
      const arm = { upper: c.wandUpperArm, fore: c.wandForearm, hand: c.wandHand, tip: c.wandTip }
      poseWandArm(arm, gesture, p.facing, clampWorldAimPitch(runtime.aim.direction))
    }
    if (c.wandTip) c.wandTip.getWorldPosition(runtime.wandTip)
    else runtime.wandTip.set(p.position.x, p.position.y + 1.4, p.position.z)
  }, [])

  return (
    <group ref={outer}>
      <group ref={seat}>
        <group rotation-y={Math.PI}>
          <CharacterAvatar ref={ctrl} body="male" hair={['parted']} outfit={STUDENT_OUTFIT} onAfterAnimate={afterAnimate} />
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
