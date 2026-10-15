import type { AnimState } from '../core/types'

/**
 * External assets. Character models and animations are bundled (CC0, see CHARACTER_ASSETS).
 * Audio files are optional: the game synthesises every cue when they are absent.
 * See ASSETS.md for format requirements and licensing notes.
 */

export interface AudioAsset {
  /** Cue id used by the audio engine. */
  id: string
  url: string
  purpose: string
  format: 'OGG/MP3'
  source: string
  license: string
  kind: 'music' | 'ambient' | 'sfx'
  fallback: string
}

/**
 * Character library built by scripts/build-character-assets.mjs from Quaternius CC0 packs:
 * Universal Base Characters (Standard) and Universal Animation Library (Standard).
 */
export const CHARACTER_ASSETS = {
  bodies: {
    male: '/assets/models/student_male.glb',
    female: '/assets/models/student_female.glb',
  },
  hair: {
    parted: '/assets/models/hair_parted.glb',
    long: '/assets/models/hair_long.glb',
    buns: '/assets/models/hair_buns.glb',
    beard: '/assets/models/hair_beard.glb',
  },
  animations: '/assets/models/animations.glb',
  source: 'Quaternius (quaternius.itch.io): Universal Base Characters [Standard], Universal Animation Library [Standard]',
  license: 'CC0 1.0 Universal (licence files included in both downloads, checked 11/10/2026)',
} as const

export type BodyType = keyof typeof CHARACTER_ASSETS.bodies
export type HairStyle = keyof typeof CHARACTER_ASSETS.hair

/** Animation clip used for each game animation state (names from the Universal Animation Library). */
export const CLIP_MAP: Record<AnimState, { clip: string; once?: boolean; speedRef?: number }> = {
  idle: { clip: 'Idle_Loop' },
  walk: { clip: 'Jog_Fwd_Loop', speedRef: 3.6 },
  run: { clip: 'Sprint_Loop', speedRef: 6.8 },
  start: { clip: 'Walk_Loop', speedRef: 1.6 },
  stop: { clip: 'Idle_Loop' },
  turn: { clip: 'Walk_Loop', speedRef: 1.6 },
  jump: { clip: 'Jump_Start', once: true },
  fall: { clip: 'Jump_Loop' },
  land: { clip: 'Jump_Land', once: true },
  aim: { clip: 'Spell_Simple_Idle_Loop' },
  cast: { clip: 'Spell_Simple_Shoot', once: true },
  hit: { clip: 'Hit_Chest', once: true },
  broomMount: { clip: 'Sitting_Enter', once: true },
  broomRide: { clip: 'Sitting_Idle_Loop' },
  fly: { clip: 'Sitting_Idle_Loop' },
  broomLand: { clip: 'Sitting_Idle_Loop' },
}

const audio = (id: string, kind: AudioAsset['kind'], purpose: string, file = id): AudioAsset => ({
  id,
  url: `/assets/audio/${file}.ogg`,
  purpose,
  format: 'OGG/MP3',
  source: 'Not included. Use original or properly licensed recordings.',
  license: 'Must permit redistribution in a web build. Never use film soundtracks or franchise themes.',
  kind,
  fallback: 'Procedural Web Audio synthesis (src/game/audio).',
})

export const AUDIO_ASSETS: AudioAsset[] = [
  audio('music-menu', 'music', 'Main menu theme (loop).'),
  audio('music-castle', 'music', 'Castle exploration theme (loop).'),
  audio('music-hall', 'music', 'Grand Hall ambience music (loop).'),
  audio('music-forest', 'music', 'Enchanted forest theme (loop).'),
  audio('music-flight', 'music', 'Flight theme (loop).'),
  audio('music-combat', 'music', 'Magical combat theme (loop).'),
  audio('music-interior', 'music', 'Quiet interior / library theme (loop).'),
  audio('ambient-wind', 'ambient', 'Outdoor wind bed (loop).'),
  audio('ambient-forest', 'ambient', 'Forest night creatures bed (loop).'),
  audio('ambient-interior', 'ambient', 'Interior room tone (loop).'),
  audio('footstep-stone', 'sfx', 'Footstep on stone (one-shot; variations are pitch-shifted).'),
  audio('footstep-grass', 'sfx', 'Footstep on grass.'),
  audio('footstep-wood', 'sfx', 'Footstep on wood.'),
  audio('cast-arc', 'sfx', 'Arc Bolt cast.'),
  audio('cast-wave', 'sfx', 'Force Wave cast.'),
  audio('cast-shield', 'sfx', 'Aegis Shield activation.'),
  audio('cast-orb', 'sfx', 'Luminous Orb cast.'),
  audio('cast-pull', 'sfx', 'Mystic Pull cast.'),
  audio('cast-blink', 'sfx', 'Blink Step.'),
  audio('impact-spark', 'sfx', 'Spell impact.'),
  audio('shield-down', 'sfx', 'Shield expiry.'),
  audio('broom-summon', 'sfx', 'Broom summon chime.'),
  audio('broom-takeoff', 'sfx', 'Take-off whoosh.'),
  audio('broom-land', 'sfx', 'Landing thud.'),
  audio('door', 'sfx', 'Heavy door.'),
  audio('bell', 'sfx', 'Distant tower bell.'),
]

export const findAudioAsset = (id: string) => AUDIO_ASSETS.find((a) => a.id === id)
