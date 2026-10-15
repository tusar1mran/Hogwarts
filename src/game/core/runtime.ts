import { Vector3 } from 'three'
import type { AnimState, FlightState, SurfaceKind } from './types'
import type { AreaId } from '../world/layout'

/**
 * Mutable per-frame game state shared between systems.
 *
 * High-frequency data (transforms, velocities, aim rays) lives here instead of React
 * state so the frame loop never triggers React re-renders. React UI samples what it
 * needs at a throttled rate (see HudSync).
 */
export const runtime = {
  time: 0,
  frame: 0,

  player: {
    position: new Vector3(),
    velocity: new Vector3(),
    /** Facing yaw of the avatar (radians, 0 = facing -Z). */
    facing: 0,
    grounded: true,
    speed: 0,
    sprinting: false,
    aiming: false,
    /** Time the current cast animation started (-1 when not casting). */
    castStartedAt: -1,
    /** Colour of the wand-tip trail for the current cast. */
    castColor: '#9fd8ff',
    hitAt: -1,
    landedAt: -1,
    landImpact: 0,
    jumpedAt: -1,
    animState: 'idle' as AnimState,
    surface: 'stone' as SurfaceKind,
    area: 'approach' as AreaId,
    health: 100,
    maxHealth: 100,
    shieldUntil: 0,
    lastSafePosition: new Vector3(),
    /** Rapier handles so queries can exclude the player. */
    bodyHandle: -1,
    colliderHandle: -1,
    /** Teleport request consumed by the controller (Blink Step, respawn). */
    teleportTo: null as Vector3 | null,
    controlsLocked: false,
  },

  camera: {
    /** 0 = looking towards -Z. Forward = (-sin yaw, 0, -cos yaw). */
    yaw: 0,
    pitch: -0.12,
    distance: 5.5,
    position: new Vector3(),
    forward: new Vector3(0, 0, -1),
  },

  aim: {
    origin: new Vector3(),
    direction: new Vector3(0, 0, -1),
    point: new Vector3(),
    hit: false,
    hitEntityId: null as string | null,
  },

  wandTip: new Vector3(),

  flight: {
    state: 'Grounded' as FlightState,
    stateTime: 0,
    speed: 0,
    altitude: 0,
    bank: 0,
    pitch: 0,
    heading: 0,
    boosting: false,
  },

  perf: {
    fps: 60,
    frameMs: 16.7,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    dpr: 1,
  },
}

export type Runtime = typeof runtime

export function resetRuntimePlayer(position: Vector3, facing: number) {
  const p = runtime.player
  p.position.copy(position)
  p.lastSafePosition.copy(position)
  p.velocity.set(0, 0, 0)
  p.facing = facing
  p.grounded = true
  p.health = p.maxHealth
  p.shieldUntil = 0
  p.castStartedAt = -1
  p.hitAt = -1
  p.teleportTo = position.clone()
  runtime.flight.state = 'Grounded'
  runtime.flight.stateTime = 0
  runtime.flight.speed = 0
  runtime.camera.yaw = facing
  runtime.camera.pitch = -0.12
}
