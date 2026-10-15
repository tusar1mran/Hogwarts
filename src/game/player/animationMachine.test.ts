import { describe, expect, it } from 'vitest'
import { resolveAnimState, resolveClip, type AnimInputs } from './animationMachine'

const base: AnimInputs = {
  now: 10,
  grounded: true,
  speed: 0,
  verticalVelocity: 0,
  moveIntent: false,
  aiming: false,
  turnRate: 0,
  castStartedAt: -10,
  hitAt: -10,
  landedAt: -10,
  landImpact: 0,
  jumpedAt: -10,
  airborneSince: 0,
  flightState: 'Grounded',
  previous: 'idle',
  previousSince: 0,
}
const s = (p: Partial<AnimInputs>) => resolveAnimState({ ...base, ...p })

describe('player animation state', () => {
  it('idles when still', () => expect(s({})).toBe('idle'))
  it('starts moving from idle with a start state', () => expect(s({ moveIntent: true, speed: 0.5 })).toBe('start'))
  it('walks and runs by speed', () => {
    expect(s({ moveIntent: true, speed: 3, previous: 'walk' })).toBe('walk')
    expect(s({ moveIntent: true, speed: 8, previous: 'walk' })).toBe('run')
  })
  it('plays a stop when movement input ends at speed', () => expect(s({ speed: 5, previous: 'run' })).toBe('stop'))
  it('turns in place', () => expect(s({ turnRate: 4 })).toBe('turn'))
  it('jumps while rising after a jump', () => expect(s({ grounded: false, verticalVelocity: 6, jumpedAt: 9.9 })).toBe('jump'))
  it('falls when airborne for a while', () => expect(s({ grounded: false, verticalVelocity: -5, airborneSince: 9 })).toBe('fall'))
  it('ignores brief ground loss on stairs', () => expect(s({ grounded: false, verticalVelocity: -0.5, airborneSince: 9.95 })).toBe('idle'))
  it('lands after touching down', () => expect(s({ landedAt: 9.9, landImpact: 5 })).toBe('land'))
  it('aims while the aim button is held', () => expect(s({ aiming: true })).toBe('aim'))
  it('casting overrides aiming', () => expect(s({ aiming: true, castStartedAt: 9.8 })).toBe('cast'))
  it('taking damage overrides everything on the ground', () => expect(s({ castStartedAt: 9.9, hitAt: 9.9, moveIntent: true, speed: 5 })).toBe('hit'))
  it('maps flight states to broom animations', () => {
    expect(s({ flightState: 'Summoning' })).toBe('broomMount')
    expect(s({ flightState: 'TakingOff' })).toBe('broomRide')
    expect(s({ flightState: 'Flying' })).toBe('fly')
    expect(s({ flightState: 'Landing' })).toBe('broomLand')
  })
})

describe('clip fallbacks', () => {
  it('uses the exact clip when available', () => expect(resolveClip('run', new Set(['idle', 'walk', 'run']))).toBe('run'))
  it('falls back to a compatible clip', () => {
    expect(resolveClip('run', new Set(['idle', 'walk']))).toBe('walk')
    expect(resolveClip('fly', new Set(['idle', 'broomRide']))).toBe('broomRide')
    expect(resolveClip('turn', new Set(['idle']))).toBe('idle')
  })
  it('returns null when nothing usable exists', () => expect(resolveClip('walk', new Set())).toBeNull())
})
