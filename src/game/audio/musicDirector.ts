import type { AreaId } from '../world/layout'

export type MusicState = 'menu' | 'castle' | 'hall' | 'forest' | 'flight' | 'combat' | 'interior' | 'silent'

export interface MusicInputs {
  phase: 'boot' | 'loading' | 'menu' | 'playing'
  area: AreaId
  flying: boolean
  combat: boolean
}

/** The music a situation calls for, ignoring timing. */
export function desiredMusic(i: MusicInputs): MusicState {
  if (i.phase === 'menu') return 'menu'
  if (i.phase !== 'playing') return 'silent'
  if (i.combat) return 'combat'
  if (i.flying) return 'flight'
  switch (i.area) {
    case 'grand-hall':
      return 'hall'
    case 'library':
      return 'interior'
    case 'forest':
      return 'forest'
    default:
      return 'castle'
  }
}

/**
 * Adds hysteresis so crossing a small boundary back and forth does not restart music:
 * a new state must be requested continuously for `holdSeconds` before it takes over.
 * Combat and menu changes apply faster.
 */
export class MusicDirector {
  current: MusicState = 'silent'
  private candidate: MusicState = 'silent'
  private candidateSince = 0

  private holdSeconds: number
  private urgentHold: number

  constructor(holdSeconds = 2.5, urgentHold = 0.4) {
    this.holdSeconds = holdSeconds
    this.urgentHold = urgentHold
  }

  /** Returns the new state when it changes, otherwise null. */
  update(inputs: MusicInputs, now: number): MusicState | null {
    const want = desiredMusic(inputs)
    if (want === this.current) {
      this.candidate = want
      return null
    }
    if (want !== this.candidate) {
      this.candidate = want
      this.candidateSince = now
    }
    const urgent = want === 'combat' || want === 'menu' || this.current === 'silent' || this.current === 'menu'
    if (now - this.candidateSince >= (urgent ? this.urgentHold : this.holdSeconds)) {
      this.current = want
      return want
    }
    return null
  }

  reset() {
    this.current = 'silent'
    this.candidate = 'silent'
    this.candidateSince = 0
  }
}
