import type { MusicState } from './musicDirector'

/** Parameters for the generative music fallback. Original material; no external themes. */
export interface Theme {
  bpm: number
  /** Root frequency in Hz. */
  root: number
  /** Semitone offsets of the mode. */
  scale: number[]
  /** Chord roots as scale degrees, one per bar. */
  progression: number[]
  layers: {
    pad?: boolean
    choir?: boolean
    drone?: boolean
    /** Probability per eighth note. */
    harp?: number
    /** Probability per bar. */
    bells?: number
    /** Probability per melody slot. */
    melody?: number
    melodyVoice?: OscillatorType
    pulse?: boolean
    drums?: boolean
  }
}

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10]
const IONIAN = [0, 2, 4, 5, 7, 9, 11]
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11]

export const THEMES: Record<MusicState, Theme> = {
  menu: { bpm: 58, root: 146.83, scale: DORIAN, progression: [0, 5, 3, 4], layers: { pad: true, choir: true, drone: true, harp: 0.25, bells: 0.5 } },
  castle: { bpm: 72, root: 164.81, scale: AEOLIAN, progression: [0, 5, 2, 6, 0, 3, 4, 4], layers: { pad: true, drone: true, harp: 0.55, melody: 0.45, bells: 0.2 } },
  hall: { bpm: 66, root: 220, scale: MIXOLYDIAN, progression: [0, 3, 4, 0, 5, 3, 6, 4], layers: { pad: true, choir: true, harp: 0.4, melody: 0.3, melodyVoice: 'triangle' } },
  forest: { bpm: 62, root: 185, scale: LYDIAN, progression: [0, 1, 0, 4, 5, 1], layers: { pad: true, harp: 0.35, bells: 0.8, melody: 0.2, choir: true } },
  flight: { bpm: 100, root: 146.83, scale: IONIAN, progression: [0, 4, 5, 3], layers: { pad: true, pulse: true, melody: 0.55, melodyVoice: 'square', drone: true } },
  combat: { bpm: 112, root: 130.81, scale: HARMONIC_MINOR, progression: [0, 0, 5, 4], layers: { pad: true, pulse: true, drums: true, drone: true } },
  interior: { bpm: 54, root: 196, scale: DORIAN, progression: [0, 3, 0, 4], layers: { pad: true, harp: 0.22, bells: 0.15 } },
  silent: { bpm: 60, root: 220, scale: IONIAN, progression: [0], layers: {} },
}
