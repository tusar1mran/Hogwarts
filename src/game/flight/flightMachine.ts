import type { FlightState } from '../core/types'

/** Durations (seconds) of the timed transition states. */
export const FLIGHT_TIMINGS = {
  Summoning: 0.7,
  Mounting: 0.45,
  TakingOff: 0.9,
  Dismounting: 0.45,
  /** Safety net: a landing that has not touched ground by then is resolved by snapping to it. */
  LandingTimeout: 10,
}

export interface FlightMachine {
  state: FlightState
  time: number
}

export interface FlightMachineInput {
  /** F pressed this frame. */
  toggle: boolean
  /** The player has picked up a broom and may summon it. */
  hasBroom: boolean
  /** Character controller reports ground contact. */
  grounded: boolean
  /** Close to the ground while slow and descending: flying should turn into landing. */
  nearGround: boolean
  overWater: boolean
  /** Player was hit this frame (interrupts summoning/mounting). */
  interrupted: boolean
}

export interface FlightStepResult extends FlightMachine {
  changed: boolean
  /** Explains why a requested transition was refused (shown to the player). */
  blocked?: string
  /** Set when the landing timed out and the controller must snap to the ground. */
  forceGround?: boolean
}

export const createFlightMachine = (): FlightMachine => ({ state: 'Grounded', time: 0 })

/** States where the broom flight controller (not the walking controller) owns movement. */
export const isAirborneFlightState = (s: FlightState) => s === 'TakingOff' || s === 'Flying' || s === 'Landing'

/** States where the broom is visible. */
export const isBroomVisible = (s: FlightState) => s !== 'Grounded'

export function stepFlightMachine(m: FlightMachine, input: FlightMachineInput, dt: number): FlightStepResult {
  const t = m.time + dt
  const to = (state: FlightState, extra: Partial<FlightStepResult> = {}): FlightStepResult => ({
    state,
    time: 0,
    changed: state !== m.state,
    ...extra,
  })
  const stay = (extra: Partial<FlightStepResult> = {}): FlightStepResult => ({ state: m.state, time: t, changed: false, ...extra })

  switch (m.state) {
    case 'Grounded':
      if (input.toggle) {
        if (!input.hasBroom) return stay({ blocked: 'You have no broom. Find one on the grounds first.' })
        if (!input.grounded) return stay({ blocked: 'You need solid footing to summon the broom.' })
        if (input.overWater) return stay({ blocked: 'You cannot summon the broom here.' })
        return to('Summoning')
      }
      return stay()
    case 'Summoning':
      if (input.toggle || input.interrupted) return to('Grounded')
      return t >= FLIGHT_TIMINGS.Summoning ? to('Mounting') : stay()
    case 'Mounting':
      if (input.interrupted) return to('Grounded')
      return t >= FLIGHT_TIMINGS.Mounting ? to('TakingOff') : stay()
    case 'TakingOff':
      if (input.toggle) return to('Landing')
      return t >= FLIGHT_TIMINGS.TakingOff ? to('Flying') : stay()
    case 'Flying':
      if (input.toggle) {
        if (input.overWater) return stay({ blocked: 'There is nowhere to land over the water.' })
        return to('Landing')
      }
      if (input.nearGround && !input.overWater) return to('Landing')
      return stay()
    case 'Landing':
      if (input.grounded) return to('Dismounting')
      if (input.toggle) return to('Flying')
      if (t >= FLIGHT_TIMINGS.LandingTimeout) return to('Dismounting', { forceGround: true })
      return stay()
    case 'Dismounting':
      return t >= FLIGHT_TIMINGS.Dismounting ? to('Grounded') : stay()
  }
}
