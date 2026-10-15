import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { PerspectiveCamera, Vector3 } from 'three'
import { input } from '../input/InputManager'
import { runtime } from '../core/runtime'
import { clamp, damp } from '../core/math'
import { useSettings } from '../state/settings'
import { useGame } from '../state/gameStore'
import { entityForCollider } from '../entities/registry'
import { isAirborneFlightState } from '../flight/flightMachine'

export const CAMERA_LIMITS = {
  groundPitch: [-1.2, 0.55] as const,
  flightPitch: [-1.0, 0.8] as const,
  minDistance: 3,
  maxDistance: 9,
  aimDistance: 2.4,
}

const MOUSE_SCALE = 0.0022
const AIM_RANGE = 140

const _pivot = new Vector3()
const _dir = new Vector3()
const _right = new Vector3()
const _desired = new Vector3()
const _origin = new Vector3()
const _look = new Vector3()

/**
 * Over-the-shoulder follow camera with mouse orbit, collision avoidance (sphere cast),
 * aim zoom, flight framing and speed-based FOV. Also performs the screen-centre aim raycast
 * used by spellcasting.
 */
export function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const sensitivity = useSettings((s) => s.controls.mouseSensitivity)
  const invertY = useSettings((s) => s.controls.invertY)
  const preferredDistance = useSettings((s) => s.controls.cameraDistance)
  const fov = useSettings((s) => s.graphics.fov)
  const probe = useMemo(() => new rapier.Ball(0.28), [rapier])
  const aimRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }), [rapier])
  const smooth = useRef({
    pivot: new Vector3(),
    distance: 5,
    shoulder: 0.6,
    fov: 60,
    initialised: false,
    zoom: preferredDistance,
  })

  useEffect(() => {
    smooth.current.zoom = preferredDistance
  }, [preferredDistance])

  useFrame((_, rawDt) => {
    const game = useGame.getState()
    if (game.phase !== 'playing') {
      smooth.current.initialised = false
      return
    }
    const dt = Math.min(rawDt, 1 / 20)
    const cam = runtime.camera
    const p = runtime.player
    const flying = isAirborneFlightState(runtime.flight.state)
    const s = smooth.current

    // Mouse orbit (InputManager only accumulates deltas while pointer-locked and enabled).
    const [dx, dy] = input.consumeMouseDelta()
    cam.yaw -= dx * MOUSE_SCALE * sensitivity
    cam.pitch -= dy * MOUSE_SCALE * sensitivity * (invertY ? -1 : 1)
    const limits = flying ? CAMERA_LIMITS.flightPitch : CAMERA_LIMITS.groundPitch
    cam.pitch = clamp(cam.pitch, limits[0], limits[1])
    const wheel = input.consumeWheel()
    if (wheel !== 0) s.zoom = clamp(s.zoom + wheel * 0.6, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance)

    // Pivot at head height, smoothed (vertical more gently so stairs do not bob the view).
    const head = flying ? 1.2 : 1.55
    if (!s.initialised) {
      s.pivot.set(p.position.x, p.position.y + head, p.position.z)
      s.distance = s.zoom
      s.initialised = true
    }
    s.pivot.x = damp(s.pivot.x, p.position.x, flying ? 10 : 16, dt)
    s.pivot.z = damp(s.pivot.z, p.position.z, flying ? 10 : 16, dt)
    s.pivot.y = damp(s.pivot.y, p.position.y + head, flying ? 8 : 10, dt)
    _pivot.copy(s.pivot)

    const aiming = p.aiming && !flying
    const targetShoulder = aiming ? 0.75 : flying ? 0 : 0.55
    s.shoulder = damp(s.shoulder, targetShoulder, 8, dt)
    const targetDistance = aiming ? CAMERA_LIMITS.aimDistance : flying ? s.zoom * 1.45 + Math.min(4, runtime.flight.speed * 0.08) : s.zoom

    // Look direction from yaw/pitch.
    _dir.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch))
    _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw))

    // Collision: sphere-cast from the head (always free space) to the desired shoulder camera spot.
    _desired.copy(_pivot).addScaledVector(_right, s.shoulder).addScaledVector(_dir, -targetDistance)
    _origin.subVectors(_desired, _pivot)
    const fullLength = _origin.length()
    _origin.divideScalar(Math.max(fullLength, 1e-4))
    const hit = world.castShape(
      _pivot,
      { x: 0, y: 0, z: 0, w: 1 },
      _origin,
      probe,
      0,
      fullLength,
      false,
      rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC,
    )
    const allowed = hit ? Math.max(0.35, hit.time_of_impact - 0.05) : fullLength
    // Pull in fast when blocked, ease out slowly when clear.
    s.distance = allowed < s.distance ? damp(s.distance, allowed, 30, dt) : damp(s.distance, allowed, 4, dt)

    camera.position.copy(_pivot).addScaledVector(_origin, s.distance)
    _look.copy(camera.position).add(_dir)
    camera.lookAt(_look)

    // Field of view: narrower when aiming, wider at speed for a sense of velocity.
    const speedFov = flying ? Math.min(14, runtime.flight.speed * 0.3) : 0
    s.fov = damp(s.fov, fov + speedFov - (aiming ? 8 : 0), 6, dt)
    const pc = camera as PerspectiveCamera
    if (Math.abs(pc.fov - s.fov) > 0.01) {
      pc.fov = s.fov
      pc.updateProjectionMatrix()
    }

    cam.position.copy(camera.position)
    cam.forward.copy(_dir)
    cam.distance = s.distance

    // Screen-centre aim ray.
    aimRay.origin = camera.position
    aimRay.dir = _dir
    const aimHit = world.castRay(
      aimRay,
      AIM_RANGE,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (c) => c.handle !== p.colliderHandle,
    )
    runtime.aim.origin.copy(camera.position)
    runtime.aim.direction.copy(_dir)
    if (aimHit) {
      runtime.aim.point.copy(camera.position).addScaledVector(_dir, aimHit.timeOfImpact)
      runtime.aim.hit = true
      runtime.aim.hitEntityId = entityForCollider(aimHit.collider.handle)?.id ?? null
    } else {
      runtime.aim.point.copy(camera.position).addScaledVector(_dir, AIM_RANGE)
      runtime.aim.hit = false
      runtime.aim.hitEntityId = null
    }
  })

  return null
}

/** Slow cinematic orbit around the castle behind the main menu. */
export function MenuCamera() {
  const { camera } = useThree()
  const t = useRef(0)
  useFrame((_, dt) => {
    if (useGame.getState().phase !== 'menu') return
    t.current += Math.min(dt, 0.1)
    const a = 0.35 + t.current * 0.018
    const radius = 175 + Math.sin(t.current * 0.05) * 15
    camera.position.set(Math.sin(a) * radius, 38 + Math.sin(t.current * 0.07) * 6, Math.cos(a) * radius - 10)
    camera.lookAt(0, 22, -22)
    runtime.camera.position.copy(camera.position)
  })
  return null
}
