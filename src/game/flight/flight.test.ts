import { describe, expect, it } from 'vitest'
import { FLIGHT_TIMINGS, createFlightMachine, stepFlightMachine, type FlightMachine, type FlightMachineInput } from './flightMachine'
import { DEFAULT_FLIGHT_PARAMS, createFlightBody, stepFlight, type FlightControls } from './flightPhysics'

const idle: FlightMachineInput = { toggle: false, hasBroom: true, grounded: true, nearGround: false, overWater: false, interrupted: false }

function run(m: FlightMachine, input: Partial<FlightMachineInput>, seconds: number, dt = 1 / 60) {
  let s = m
  for (let t = 0; t < seconds; t += dt) {
    const r = stepFlightMachine(s, { ...idle, ...input }, dt)
    s = { state: r.state, time: r.time }
  }
  return s
}

describe('flight state machine', () => {
  it('goes Grounded -> Summoning -> Mounting -> TakingOff -> Flying', () => {
    let m = createFlightMachine()
    const r = stepFlightMachine(m, { ...idle, toggle: true }, 1 / 60)
    expect(r.state).toBe('Summoning')
    m = { state: r.state, time: r.time }
    m = run(m, {}, FLIGHT_TIMINGS.Summoning + 0.05)
    expect(m.state).toBe('Mounting')
    m = run(m, {}, FLIGHT_TIMINGS.Mounting + 0.05)
    expect(m.state).toBe('TakingOff')
    m = run(m, { grounded: false }, FLIGHT_TIMINGS.TakingOff + 0.05)
    expect(m.state).toBe('Flying')
  })

  it('refuses to summon without a broom', () => {
    const r = stepFlightMachine(createFlightMachine(), { ...idle, toggle: true, grounded: true, overWater: false, hasBroom: false }, 0.016)
    expect(r.state).toBe('Grounded')
    expect(r.blocked).toBeTruthy()
  })

  it('summons once a broom has been collected', () => {
    const r = stepFlightMachine(createFlightMachine(), { ...idle, toggle: true, grounded: true, overWater: false, hasBroom: true }, 0.016)
    expect(r.state).toBe('Summoning')
  })

  it('refuses to summon while airborne or over water', () => {
    expect(stepFlightMachine(createFlightMachine(), { ...idle, toggle: true, grounded: false }, 0.016).state).toBe('Grounded')
    const r = stepFlightMachine(createFlightMachine(), { ...idle, toggle: true, overWater: true }, 0.016)
    expect(r.state).toBe('Grounded')
    expect(r.blocked).toBeTruthy()
  })

  it('cancels summoning when F is pressed again or the player is hit', () => {
    const summoning: FlightMachine = { state: 'Summoning', time: 0.1 }
    expect(stepFlightMachine(summoning, { ...idle, toggle: true }, 0.016).state).toBe('Grounded')
    expect(stepFlightMachine(summoning, { ...idle, interrupted: true }, 0.016).state).toBe('Grounded')
  })

  it('lands on toggle, then dismounts on touching the ground', () => {
    let r = stepFlightMachine({ state: 'Flying', time: 3 }, { ...idle, grounded: false, toggle: true }, 0.016)
    expect(r.state).toBe('Landing')
    r = stepFlightMachine({ state: r.state, time: r.time }, { ...idle, grounded: true }, 0.016)
    expect(r.state).toBe('Dismounting')
    const done = run({ state: r.state, time: r.time }, {}, FLIGHT_TIMINGS.Dismounting + 0.05)
    expect(done.state).toBe('Grounded')
  })

  it('does not allow landing over water', () => {
    const r = stepFlightMachine({ state: 'Flying', time: 1 }, { ...idle, grounded: false, toggle: true, overWater: true }, 0.016)
    expect(r.state).toBe('Flying')
    expect(r.blocked).toBeTruthy()
  })

  it('turns low, slow descent into a landing automatically', () => {
    expect(stepFlightMachine({ state: 'Flying', time: 1 }, { ...idle, grounded: false, nearGround: true }, 0.016).state).toBe('Landing')
  })

  it('never stays stuck in Landing: times out and forces the player to the ground', () => {
    const r = stepFlightMachine({ state: 'Landing', time: FLIGHT_TIMINGS.LandingTimeout }, { ...idle, grounded: false }, 0.016)
    expect(r.state).toBe('Dismounting')
    expect(r.forceGround).toBe(true)
  })

  it('can abort a landing and keep flying', () => {
    expect(stepFlightMachine({ state: 'Landing', time: 0.5 }, { ...idle, grounded: false, toggle: true }, 0.016).state).toBe('Flying')
  })
})

describe('flight physics', () => {
  const controls = (c: Partial<FlightControls> = {}): FlightControls => ({ throttle: 0, climb: 0, boost: false, targetHeading: 0, targetPitch: -0.15, ...c })
  const env = { heightAboveGround: 50, altitude: 60 }

  const simulate = (c: FlightControls, seconds: number, dt: number) => {
    let b = createFlightBody()
    for (let t = 0; t < seconds; t += dt) b = stepFlight(b, c, env, dt)
    return b
  }

  it('accelerates up to but not beyond the maximum speed', () => {
    const b = simulate(controls({ throttle: 1 }), 10, 1 / 60)
    expect(b.speed).toBeCloseTo(DEFAULT_FLIGHT_PARAMS.maxSpeed, 0)
    expect(b.speed).toBeLessThanOrEqual(DEFAULT_FLIGHT_PARAMS.maxSpeed + 0.01)
  })

  it('boost raises the speed cap', () => {
    const b = simulate(controls({ throttle: 1, boost: true }), 10, 1 / 60)
    expect(b.speed).toBeGreaterThan(DEFAULT_FLIGHT_PARAMS.maxSpeed + 5)
  })

  it('brakes to a stop', () => {
    let b = { ...createFlightBody(), speed: 20 }
    for (let i = 0; i < 120; i++) b = stepFlight(b, controls({ throttle: -1 }), env, 1 / 60)
    expect(b.speed).toBe(0)
  })

  it('is stable across frame rates', () => {
    const at30 = simulate(controls({ throttle: 1, targetHeading: 1 }), 3, 1 / 30)
    const at144 = simulate(controls({ throttle: 1, targetHeading: 1 }), 3, 1 / 144)
    expect(Math.abs(at30.speed - at144.speed)).toBeLessThan(0.6)
    expect(Math.abs(at30.heading - at144.heading)).toBeLessThan(0.05)
  })

  it('climbs with climb input and keeps clear of the ground', () => {
    let b = createFlightBody()
    for (let i = 0; i < 60; i++) b = stepFlight(b, controls({ climb: 1 }), env, 1 / 60)
    expect(b.vy).toBeGreaterThan(5)
    let low = createFlightBody()
    for (let i = 0; i < 60; i++) low = stepFlight(low, controls(), { heightAboveGround: 0.3, altitude: 0.3 }, 1 / 60)
    expect(low.vy).toBeGreaterThan(0)
  })

  it('banks into turns', () => {
    let b = { ...createFlightBody(), speed: 20 }
    for (let i = 0; i < 20; i++) b = stepFlight(b, controls({ throttle: 1, targetHeading: 1.5 }), env, 1 / 60)
    expect(b.bank).toBeGreaterThan(0.05)
  })
})
