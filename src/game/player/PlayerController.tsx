import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import type { Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import { input } from '../input/InputManager'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { clamp, damp, dampAngle, wrapAngle } from '../core/math'
import { useGame, isGameplayActive } from '../state/gameStore'
import { useHud } from '../state/hudStore'
import { useProgression } from '../state/progressionStore'
import { areaAt, WATER_LEVEL, WORLD_HALF_SIZE } from '../world/layout'
import { terrainHeight } from '../world/terrain/heightfield'
import { terrainCollider } from '../world/terrain/Terrain'
import { createFlightMachine, isAirborneFlightState, stepFlightMachine, type FlightMachine } from '../flight/flightMachine'
import { createFlightBody, DEFAULT_FLIGHT_PARAMS, stepFlight, type FlightBody } from '../flight/flightPhysics'
import { resolveAnimState } from './animationMachine'
import { respawnAtSafePosition } from './playerActions'

/** Capsule: total height 1.8 m, feet at the body origin minus CAPSULE_CENTER. */
export const CAPSULE_HALF = 0.55
export const CAPSULE_RADIUS = 0.35
export const CAPSULE_CENTER = CAPSULE_HALF + CAPSULE_RADIUS

export const MOVE = {
  walkSpeed: 4.2,
  runSpeed: 8.2,
  aimSpeed: 2.6,
  groundAccel: 12,
  airAccel: 2.5,
  gravity: 24,
  jumpVelocity: 8.4,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
  maxFall: 48,
}

const _forward = new Vector3()
const _right = new Vector3()
const _wish = new Vector3()
const _desired = new Vector3()
const _next = new Vector3()
const _rayOrigin = { x: 0, y: 0, z: 0 }
const _rayDir = { x: 0, y: -1, z: 0 }

/**
 * Third-person character controller. Ground movement uses Rapier's kinematic character
 * controller; broom flight delegates to the dedicated flight state machine and flight model,
 * but shares the same collider and collision resolution so walls stop both.
 */
export function PlayerController() {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<Collider>(null)
  const controller = useRef<KinematicCharacterController | null>(null)
  const { world, rapier } = useRapier()
  const probeRay = useRef(new rapier.Ray(_rayOrigin, _rayDir))

  const state = useRef({
    vy: 0,
    lastGroundedAt: 0,
    jumpRequestedAt: -10,
    airborneSince: 0,
    wasGrounded: true,
    stride: 0,
    safeTimer: 0,
    areaTimer: 0,
    regenTimer: 0,
    flightToggle: false,
    flight: createFlightMachine() as FlightMachine,
    flightBody: createFlightBody() as FlightBody,
    animSince: 0,
    lastFacing: 0,
    groundCollider: -1,
  })

  useEffect(() => {
    const c = world.createCharacterController(0.03)
    c.setUp({ x: 0, y: 1, z: 0 })
    c.setSlideEnabled(true)
    c.setMaxSlopeClimbAngle((52 * Math.PI) / 180)
    c.setMinSlopeSlideAngle((58 * Math.PI) / 180)
    c.enableAutostep(0.45, 0.2, false)
    c.enableSnapToGround(0.45)
    c.setApplyImpulsesToDynamicBodies(true)
    c.setCharacterMass(75)
    controller.current = c
    return () => {
      try {
        world.removeCharacterController(c)
      } catch {
        // world already disposed
      }
      controller.current = null
    }
  }, [world])

  useEffect(() => {
    const unsub = input.onPress((action) => {
      if (action === 'jump') state.current.jumpRequestedAt = runtime.time
      if (action === 'toggleBroom') state.current.flightToggle = true
    })
    return () => {
      unsub()
    }
  }, [])

  // Register handles so queries can exclude the player.
  useEffect(() => {
    if (body.current) runtime.player.bodyHandle = body.current.handle
    if (collider.current) runtime.player.colliderHandle = collider.current.handle
  })

  /** Distance from the feet to whatever is below (structure or terrain), Infinity if nothing. */
  const groundProbe = (pos: Vector3, maxDist: number): { dist: number; handle: number } => {
    _rayOrigin.x = pos.x
    _rayOrigin.y = pos.y + 0.3
    _rayOrigin.z = pos.z
    probeRay.current.origin = _rayOrigin
    probeRay.current.dir = _rayDir
    const hit = world.castRay(probeRay.current, maxDist + 0.3, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, collider.current ?? undefined, body.current ?? undefined)
    if (!hit) return { dist: Infinity, handle: -1 }
    return { dist: hit.timeOfImpact - 0.3, handle: hit.collider.handle }
  }

  useFrame((_, rawDt) => {
    const rb = body.current
    const col = collider.current
    const cc = controller.current
    if (!rb || !col || !cc) return
    const game = useGame.getState()
    const active = isGameplayActive(game)
    const simulate = game.phase === 'playing' && (active || game.overlay === 'dialogue')
    const dt = Math.min(rawDt, 1 / 20)
    const s = state.current
    const p = runtime.player
    const now = runtime.time

    // Teleports (spawn, respawn, Blink Step) bypass collision resolution.
    if (p.teleportTo) {
      const t = p.teleportTo
      rb.setTranslation({ x: t.x, y: t.y + CAPSULE_CENTER, z: t.z }, true)
      rb.setNextKinematicTranslation({ x: t.x, y: t.y + CAPSULE_CENTER, z: t.z })
      p.position.copy(t)
      p.teleportTo = null
      s.vy = 0
      s.flight = { state: runtime.flight.state, time: 0 }
      s.flightBody = createFlightBody(p.facing)
      return
    }
    if (!simulate) return

    const pos = rb.translation()
    _next.set(pos.x, pos.y - CAPSULE_CENTER, pos.z)
    const camYaw = runtime.camera.yaw
    _forward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw))
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw))

    // ---- Flight state machine -------------------------------------------------------------
    const below = groundProbe(_next, 220)
    const overWater = terrainHeight(_next.x, _next.z) < WATER_LEVEL && below.dist > _next.y - WATER_LEVEL - 0.5
    const heightAboveGround = Math.min(below.dist, overWater ? _next.y - WATER_LEVEL : Infinity)
    const fb = s.flightBody
    const descending = input.isDown('descend') || fb.vy < -0.5
    const machine = stepFlightMachine(
      s.flight,
      {
        toggle: active && s.flightToggle && !p.controlsLocked,
        hasBroom: useProgression.getState().progression.hasBroom,
        grounded: p.grounded,
        nearGround: heightAboveGround < 1.3 && fb.speed < 7 && descending,
        overWater,
        interrupted: now - p.hitAt < 0.05,
      },
      dt,
    )
    s.flightToggle = false
    if (machine.blocked) useHud.getState().fizzle(machine.blocked)
    if (machine.changed) {
      const from = s.flight.state
      events.emit({ type: 'flight:state', from, to: machine.state })
      useProgression.getState().dispatch({ type: 'flightState', state: machine.state })
      if (machine.state === 'TakingOff') {
        s.flightBody = { ...createFlightBody(p.facing), speed: 2 }
        runtime.camera.yaw = p.facing
      }
    }
    s.flight = { state: machine.state, time: machine.time }
    runtime.flight.state = machine.state
    runtime.flight.stateTime = machine.time
    const flying = isAirborneFlightState(machine.state)

    // ---- Movement ---------------------------------------------------------------------------
    const moveX = input.axis('moveLeft', 'moveRight')
    const moveZ = input.axis('moveBack', 'moveForward')
    const locked = p.controlsLocked || game.overlay === 'dialogue'
    const busy = machine.state === 'Summoning' || machine.state === 'Mounting' || machine.state === 'Dismounting'

    if (flying) {
      const steer = locked ? 0 : moveX
      runtime.camera.yaw = wrapAngle(runtime.camera.yaw - steer * 1.5 * dt)
      let body: FlightBody
      if (machine.state === 'TakingOff') {
        body = { ...fb, vy: damp(fb.vy, 7, 4, dt), speed: damp(fb.speed, 5, 2, dt) }
        body.vx = -Math.sin(body.heading) * body.speed
        body.vz = -Math.cos(body.heading) * body.speed
      } else if (machine.state === 'Landing') {
        const sink = -clamp(heightAboveGround * 0.9, 3.5, 14)
        const speed = damp(fb.speed, 0, 1.6, dt)
        body = { ...fb, speed, vy: damp(fb.vy, sink, 4, dt), pitch: damp(fb.pitch, 0, 3, dt), bank: damp(fb.bank, 0, 3, dt) }
        body.vx = -Math.sin(body.heading) * speed
        body.vz = -Math.cos(body.heading) * speed
      } else {
        body = stepFlight(
          fb,
          {
            throttle: locked ? 0 : moveZ,
            climb: locked ? 0 : (input.isDown('ascend') ? 1 : 0) - (input.isDown('descend') ? 1 : 0),
            boost: !locked && input.isDown('sprint'),
            targetHeading: runtime.camera.yaw,
            targetPitch: runtime.camera.pitch,
          },
          { heightAboveGround, altitude: _next.y },
          dt,
          DEFAULT_FLIGHT_PARAMS,
        )
      }
      _desired.set(body.vx * dt, body.vy * dt, body.vz * dt)
      cc.computeColliderMovement(col, _desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS)
      const m = cc.computedMovement()
      // Hitting a wall bleeds speed instead of grinding along it at full tilt.
      const wanted = Math.hypot(_desired.x, _desired.z)
      const got = Math.hypot(m.x, m.z)
      if (wanted > 1e-4 && got < wanted * 0.6) body.speed *= Math.max(0.2, 1 - dt * 4)
      s.flightBody = body
      p.grounded = cc.computedGrounded()
      p.velocity.set(m.x / dt, m.y / dt, m.z / dt)
      p.facing = body.heading
      s.vy = 0
      _next.x += m.x
      _next.y += m.y
      _next.z += m.z
      runtime.flight.speed = body.speed
      runtime.flight.bank = body.bank
      runtime.flight.pitch = body.pitch
      runtime.flight.heading = body.heading
      runtime.flight.boosting = input.isDown('sprint') && moveZ > 0
      runtime.flight.altitude = Number.isFinite(heightAboveGround) ? heightAboveGround : 0
      if (machine.forceGround && Number.isFinite(below.dist)) _next.y -= Math.max(0, below.dist)
    } else {
      // Ground locomotion, camera-relative.
      _wish.set(0, 0, 0)
      if (!locked && !busy) _wish.addScaledVector(_right, moveX).addScaledVector(_forward, moveZ)
      const moving = _wish.lengthSq() > 0.01
      if (moving) _wish.normalize()
      p.aiming = !locked && input.isAimHeld()
      p.sprinting = moving && !p.aiming && input.isDown('sprint')
      const target = p.aiming ? MOVE.aimSpeed : p.sprinting ? MOVE.runSpeed : MOVE.walkSpeed
      const accel = p.grounded ? MOVE.groundAccel : MOVE.airAccel
      p.velocity.x = damp(p.velocity.x, _wish.x * target, accel, dt)
      p.velocity.z = damp(p.velocity.z, _wish.z * target, accel, dt)

      // Jump with coyote time and input buffering.
      const canJump = !locked && !busy && now - s.lastGroundedAt < MOVE.coyoteTime
      if (canJump && now - s.jumpRequestedAt < MOVE.jumpBuffer) {
        s.vy = MOVE.jumpVelocity
        s.jumpRequestedAt = -10
        s.lastGroundedAt = -10
        p.jumpedAt = now
        events.emit({ type: 'player:jumped' })
      }
      s.vy = Math.max(-MOVE.maxFall, s.vy - MOVE.gravity * dt)

      _desired.set(p.velocity.x * dt, s.vy * dt, p.velocity.z * dt)
      cc.computeColliderMovement(col, _desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS)
      const m = cc.computedMovement()
      const grounded = cc.computedGrounded()
      if (s.vy > 0 && m.y < _desired.y * 0.5) s.vy = 0 // bumped head
      if (grounded && s.vy < 0) s.vy = -1

      if (grounded) {
        if (!s.wasGrounded) {
          p.landedAt = now
          p.landImpact = -p.velocity.y
          events.emit({ type: 'player:landed', impact: p.landImpact })
        }
        s.lastGroundedAt = now
      } else if (s.wasGrounded) {
        s.airborneSince = now
      }
      s.wasGrounded = grounded
      p.grounded = grounded
      p.velocity.y = m.y / dt
      _next.x += m.x
      _next.y += m.y
      _next.z += m.z

      // Facing: towards the camera when aiming/casting, otherwise towards movement.
      const casting = now - p.castStartedAt < 0.4
      if (p.aiming || casting) p.facing = dampAngle(p.facing, camYaw, 18, dt)
      else if (moving) p.facing = dampAngle(p.facing, Math.atan2(-_wish.x, -_wish.z), 11, dt)
      runtime.flight.speed = 0
    }

    // ---- World limits, water and safe positions ------------------------------------------
    const limit = WORLD_HALF_SIZE - 6
    _next.x = clamp(_next.x, -limit, limit)
    _next.z = clamp(_next.z, -limit, limit)
    rb.setNextKinematicTranslation({ x: _next.x, y: _next.y + CAPSULE_CENTER, z: _next.z })
    p.position.copy(_next)
    p.speed = Math.hypot(p.velocity.x, p.velocity.z)

    if (!flying && _next.y < WATER_LEVEL - 0.6) {
      respawnAtSafePosition('The icy water drives you back to the shore.')
      return
    }
    s.safeTimer -= dt
    if (s.safeTimer <= 0) {
      s.safeTimer = 0.5
      if (p.grounded && !flying && !overWater && _next.y > WATER_LEVEL + 1) p.lastSafePosition.copy(_next)
    }

    // ---- Health regeneration ------------------------------------------------------------
    if (now - p.hitAt > 5 && p.health < p.maxHealth) p.health = Math.min(p.maxHealth, p.health + 6 * dt)

    // ---- Area, surface and footsteps -----------------------------------------------------
    s.areaTimer -= dt
    if (s.areaTimer <= 0) {
      s.areaTimer = 0.25
      const area = areaAt(_next.x, _next.y, _next.z)
      if (area.id !== p.area) {
        p.area = area.id
        events.emit({ type: 'area:changed', areaId: area.id })
      }
      s.groundCollider = below.handle
      p.surface = below.handle === terrainCollider.handle && !area.interior ? 'grass' : area.surface === 'grass' ? 'stone' : area.surface
    }
    if (p.grounded && !flying && p.speed > 0.6) {
      s.stride += p.speed * dt
      const strideLength = p.sprinting ? 1.7 : 1.15
      if (s.stride > strideLength) {
        s.stride = 0
        events.emit({ type: 'footstep', surface: p.surface, running: p.sprinting, x: _next.x, y: _next.y, z: _next.z })
      }
    }

    // ---- Animation state --------------------------------------------------------------------
    const turnRate = wrapAngle(p.facing - s.lastFacing) / Math.max(dt, 1e-4)
    s.lastFacing = p.facing
    const next = resolveAnimState({
      now,
      grounded: p.grounded,
      speed: p.speed,
      verticalVelocity: p.velocity.y,
      moveIntent: !locked && (moveX !== 0 || moveZ !== 0),
      aiming: p.aiming,
      turnRate,
      castStartedAt: p.castStartedAt,
      hitAt: p.hitAt,
      landedAt: p.landedAt,
      landImpact: p.landImpact,
      jumpedAt: p.jumpedAt,
      airborneSince: s.airborneSince,
      flightState: machine.state,
      previous: p.animState,
      previousSince: s.animSince,
    })
    if (next !== p.animState) {
      p.animState = next
      s.animSince = now
    }
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, 2, 0]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[CAPSULE_HALF, CAPSULE_RADIUS]} />
    </RigidBody>
  )
}
