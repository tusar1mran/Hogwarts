import { clamp, dampAngle, damp, wrapAngle } from '../core/math'

/** Tunable arcade flight model. All speeds m/s, rates rad/s. */
export interface FlightParams {
  cruiseSpeed: number
  maxSpeed: number
  boostSpeed: number
  acceleration: number
  braking: number
  /** Proportional speed loss per second when coasting. */
  drag: number
  /** How quickly heading follows the camera (1/s). */
  headingFollow: number
  /** How quickly flight pitch follows the camera (1/s). */
  pitchFollow: number
  climbRate: number
  descendRate: number
  /** Sink rate when hovering with no forward speed. */
  gravity: number
  /** Forward speed at which lift fully cancels gravity. */
  liftSpeed: number
  maxAltitude: number
  /** Minimum height kept above the ground while flying normally. */
  groundClearance: number
  maxPitch: number
  maxBank: number
  /** Fraction of forward speed converted into vertical motion by pitch. */
  pitchToClimb: number
}

export const DEFAULT_FLIGHT_PARAMS: FlightParams = {
  cruiseSpeed: 12,
  maxSpeed: 26,
  boostSpeed: 42,
  acceleration: 13,
  braking: 20,
  drag: 0.12,
  headingFollow: 4,
  pitchFollow: 3,
  climbRate: 9,
  descendRate: 11,
  gravity: 1.6,
  liftSpeed: 8,
  maxAltitude: 170,
  groundClearance: 1.6,
  maxPitch: 0.75,
  maxBank: 0.7,
  pitchToClimb: 0.75,
}

export interface FlightBody {
  heading: number
  pitch: number
  bank: number
  speed: number
  vx: number
  vy: number
  vz: number
}

export interface FlightControls {
  /** W = +1, S = -1. */
  throttle: number
  /** Space = +1, Ctrl/C = -1. */
  climb: number
  boost: boolean
  /** Heading the camera looks along (yaw convention: 0 faces -Z). */
  targetHeading: number
  /** Camera pitch, negative looks down. */
  targetPitch: number
}

export interface FlightEnvironment {
  /** Height above the terrain/structure beneath, metres (Infinity if unknown). */
  heightAboveGround: number
  /** Absolute altitude (world Y). */
  altitude: number
}

export const createFlightBody = (heading = 0): FlightBody => ({ heading, pitch: 0, bank: 0, speed: 0, vx: 0, vy: 0, vz: 0 })

/** One integration step. Use `stepFlight` for frame-rate independent results. */
export function integrateFlight(
  b: FlightBody,
  c: FlightControls,
  env: FlightEnvironment,
  dt: number,
  p: FlightParams = DEFAULT_FLIGHT_PARAMS,
): FlightBody {
  // Speed: accelerate, brake, or coast with drag; boost raises the cap.
  const cap = c.boost ? p.boostSpeed : p.maxSpeed
  let speed = b.speed
  if (speed > cap) {
    // Above the cap (boost released): bleed off speed regardless of throttle.
    speed = Math.max(cap, speed - p.braking * 0.6 * dt)
  } else if (c.throttle > 0) {
    speed = Math.min(cap, speed + p.acceleration * (c.boost ? 1.6 : 1) * c.throttle * dt)
  }
  if (c.throttle < 0) speed += p.braking * c.throttle * dt
  else if (c.throttle === 0) speed -= speed * p.drag * dt
  speed = clamp(speed, 0, p.boostSpeed)

  // Heading follows the camera; bank from the turn rate.
  const prevHeading = b.heading
  const heading = wrapAngle(dampAngle(b.heading, c.targetHeading, p.headingFollow, dt))
  const yawRate = wrapAngle(heading - prevHeading) / Math.max(dt, 1e-5)
  const bank = damp(b.bank, clamp(yawRate * 0.45 * Math.min(1, speed / p.cruiseSpeed + 0.2), -p.maxBank, p.maxBank), 6, dt)

  // Pitch from the camera (offset so the default slightly-downward view flies level).
  const pitchTarget = clamp((c.targetPitch + 0.15) * 1.3, -p.maxPitch, p.maxPitch)
  const pitch = damp(b.pitch, pitchTarget, p.pitchFollow, dt)

  // Vertical motion: pitch converts speed to climb, explicit climb input, gravity when slow.
  let vyTarget = Math.sin(pitch) * speed * p.pitchToClimb
  if (c.climb > 0) vyTarget += p.climbRate * c.climb
  else if (c.climb < 0) vyTarget += p.descendRate * c.climb
  const lift = clamp(speed / p.liftSpeed, 0, 1)
  vyTarget -= p.gravity * (1 - lift)

  // Keep clear of the ground unless deliberately descending; never exceed the ceiling.
  if (env.heightAboveGround < p.groundClearance && c.climb >= 0) {
    vyTarget = Math.max(vyTarget, (p.groundClearance - env.heightAboveGround) * 3)
  }
  if (env.altitude > p.maxAltitude) vyTarget = Math.min(vyTarget, -(env.altitude - p.maxAltitude))
  const vy = damp(b.vy, vyTarget, 5, dt)

  const horizontal = speed * Math.cos(pitch * 0.5)
  return {
    heading,
    pitch,
    bank,
    speed,
    vx: -Math.sin(heading) * horizontal,
    vy,
    vz: -Math.cos(heading) * horizontal,
  }
}

const MAX_SUBSTEP = 1 / 120

/** Sub-stepped integration so behaviour is consistent from 30 to 240 fps. */
export function stepFlight(
  b: FlightBody,
  c: FlightControls,
  env: FlightEnvironment,
  dt: number,
  p: FlightParams = DEFAULT_FLIGHT_PARAMS,
): FlightBody {
  const clamped = Math.min(dt, 0.1)
  const steps = Math.max(1, Math.ceil(clamped / MAX_SUBSTEP))
  const h = clamped / steps
  let body = b
  for (let i = 0; i < steps; i++) body = integrateFlight(body, c, env, h, p)
  return body
}
