import type { AnimState, FlightState } from '../core/types'
import { CAST_GESTURE_DURATION } from './wandGesture'

/** Inputs sampled from the controller each frame. Times are game-clock seconds. */
export interface AnimInputs {
  now: number
  grounded: boolean
  /** Horizontal speed, m/s. */
  speed: number
  verticalVelocity: number
  moveIntent: boolean
  aiming: boolean
  /** Facing angular velocity, rad/s. */
  turnRate: number
  castStartedAt: number
  hitAt: number
  landedAt: number
  landImpact: number
  jumpedAt: number
  airborneSince: number
  flightState: FlightState
  previous: AnimState
  previousSince: number
}

export const ANIM_TIMINGS = {
  /** Covers the whole arm throw so it is never cut off mid-gesture. */
  cast: CAST_GESTURE_DURATION,
  hit: 0.45,
  landSoft: 0.18,
  landHard: 0.42,
  jumpRise: 0.4,
  start: 0.22,
  stop: 0.25,
  walkThreshold: 0.35,
  runThreshold: 5.4,
}

export function resolveAnimState(i: AnimInputs): AnimState {
  switch (i.flightState) {
    case 'Summoning':
    case 'Mounting':
      return 'broomMount'
    case 'TakingOff':
      return 'broomRide'
    case 'Flying':
      return 'fly'
    case 'Landing':
    case 'Dismounting':
      return 'broomLand'
    case 'Grounded':
      break
  }

  if (i.now - i.hitAt < ANIM_TIMINGS.hit) return 'hit'

  if (!i.grounded) {
    const rising = i.verticalVelocity > 0.5 && i.now - i.jumpedAt < ANIM_TIMINGS.jumpRise
    if (rising) return 'jump'
    // Brief ground loss (stairs, bumps) should not flash the fall pose.
    if (i.now - i.airborneSince > 0.18 || i.verticalVelocity < -3) return 'fall'
  }

  if (i.now - i.castStartedAt < ANIM_TIMINGS.cast) return 'cast'

  const landDuration = i.landImpact > 9 ? ANIM_TIMINGS.landHard : ANIM_TIMINGS.landSoft
  if (i.grounded && i.now - i.landedAt < landDuration) return 'land'

  if (i.aiming) return 'aim'

  const since = i.now - i.previousSince
  if (i.moveIntent) {
    if ((i.previous === 'idle' || i.previous === 'stop' || i.previous === 'turn') && i.speed < 1.6) return 'start'
    if (i.previous === 'start' && since < ANIM_TIMINGS.start && i.speed < 2.5) return 'start'
    if (i.speed > ANIM_TIMINGS.runThreshold) return 'run'
    if (i.speed > ANIM_TIMINGS.walkThreshold) return 'walk'
    return 'start'
  }

  if (i.speed > 1.2 && (i.previous === 'run' || i.previous === 'walk')) return 'stop'
  if (i.previous === 'stop' && since < ANIM_TIMINGS.stop && i.speed > 0.2) return 'stop'
  if (Math.abs(i.turnRate) > 2.2 && i.speed < ANIM_TIMINGS.walkThreshold) return 'turn'
  return 'idle'
}

/**
 * Clip fallback chains for skeletal models: the first clip that exists is used,
 * so a model missing e.g. a "turn" clip still animates sensibly.
 */
export const CLIP_FALLBACKS: Record<AnimState, AnimState[]> = {
  idle: ['idle'],
  walk: ['walk', 'idle'],
  run: ['run', 'walk', 'idle'],
  start: ['start', 'walk', 'idle'],
  stop: ['stop', 'idle'],
  turn: ['turn', 'walk', 'idle'],
  jump: ['jump', 'fall', 'idle'],
  fall: ['fall', 'jump', 'idle'],
  land: ['land', 'idle'],
  aim: ['aim', 'idle'],
  cast: ['cast', 'aim', 'idle'],
  hit: ['hit', 'idle'],
  broomMount: ['broomMount', 'broomRide', 'idle'],
  broomRide: ['broomRide', 'fly', 'idle'],
  fly: ['fly', 'broomRide', 'idle'],
  broomLand: ['broomLand', 'broomRide', 'idle'],
}

export function resolveClip(state: AnimState, available: ReadonlySet<string>): AnimState | null {
  for (const s of CLIP_FALLBACKS[state]) if (available.has(s)) return s
  return null
}
