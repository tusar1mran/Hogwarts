import type { Vector3 } from 'three'
import type { SpellEconomy } from './spellSystem'

export type TargetingMode = 'projectile' | 'self' | 'cone' | 'placed' | 'tether' | 'dash'

export interface SpellVisual {
  /** Core colour of the effect (hex). */
  color: string
  /** Secondary accent colour (hex). */
  accent: string
  /** Peak intensity of the short-lived light, 0 for none. */
  light: number
  /** Projectile core radius in metres. */
  size: number
}

export interface SpellAudio {
  /** Cue name resolved by the audio engine (synthesised or from the asset manifest). */
  cast: string
  impact?: string
  loop?: string
}

/**
 * The surface the spell handlers act through. Implemented by SpellRuntime with access
 * to physics queries, effect pools and the player controller.
 */
export interface SpellContext {
  now: number
  origin: Vector3
  aimPoint: Vector3
  aimDirection: Vector3
  playerPosition: Vector3
  playerForward: Vector3
  spawnProjectile(spell: SpellDef): void
  forceWave(spell: SpellDef): number
  raiseShield(spell: SpellDef): void
  placeOrb(spell: SpellDef): void
  pullTarget(spell: SpellDef): boolean
  blink(spell: SpellDef): boolean
}

export interface SpellDef extends SpellEconomy {
  name: string
  description: string
  range: number
  /** m/s for projectile spells, 0 otherwise. */
  speed: number
  /** Damage for damaging spells, impulse strength for physical spells. */
  strength: number
  /** Seconds the effect persists (shield, orb, tether). */
  duration: number
  targeting: TargetingMode
  visual: SpellVisual
  audio: SpellAudio
  /** Returns false when the spell cannot take effect; the cost is then refunded. */
  execute: (ctx: SpellContext, spell: SpellDef) => boolean
}

export const SPELLS: SpellDef[] = [
  {
    id: 'arc-bolt',
    name: 'Arc Bolt',
    description: 'A bright lance of arcane energy that flies to the point you aim at and bursts into sparks on impact.',
    cost: 8,
    cooldown: 0.45,
    range: 80,
    speed: 46,
    strength: 1,
    duration: 0,
    targeting: 'projectile',
    visual: { color: '#9fd8ff', accent: '#e6f6ff', light: 6, size: 0.14 },
    audio: { cast: 'cast-arc', impact: 'impact-spark', loop: 'projectile-hum' },
    execute: (ctx, spell) => {
      ctx.spawnProjectile(spell)
      return true
    },
  },
  {
    id: 'force-wave',
    name: 'Force Wave',
    description: 'A short-range ring of force that shoves loose objects away from you.',
    cost: 18,
    cooldown: 2.2,
    range: 9,
    speed: 0,
    strength: 14,
    duration: 0.5,
    targeting: 'cone',
    visual: { color: '#ffd38a', accent: '#fff3d6', light: 4, size: 0 },
    audio: { cast: 'cast-wave' },
    execute: (ctx, spell) => {
      ctx.forceWave(spell)
      return true
    },
  },
  {
    id: 'aegis-shield',
    name: 'Aegis Shield',
    description: 'A translucent ward that absorbs incoming harm for a few seconds.',
    cost: 25,
    cooldown: 9,
    range: 0,
    speed: 0,
    strength: 1,
    duration: 6,
    targeting: 'self',
    visual: { color: '#7fe3c4', accent: '#d7fff1', light: 2, size: 1.3 },
    audio: { cast: 'cast-shield', impact: 'shield-block' },
    execute: (ctx, spell) => {
      ctx.raiseShield(spell)
      return true
    },
  },
  {
    id: 'luminous-orb',
    name: 'Luminous Orb',
    description: 'Conjures a floating light that brightens its surroundings and reveals spectral runes before it fades.',
    cost: 15,
    cooldown: 3,
    range: 12,
    speed: 0,
    strength: 1,
    duration: 22,
    targeting: 'placed',
    visual: { color: '#ffe9a8', accent: '#fff8e0', light: 22, size: 0.28 },
    audio: { cast: 'cast-orb' },
    execute: (ctx, spell) => {
      ctx.placeOrb(spell)
      return true
    },
  },
  {
    id: 'mystic-pull',
    name: 'Mystic Pull',
    description: 'Binds a loose object with a tether of light and draws it towards you.',
    cost: 14,
    cooldown: 1.5,
    range: 28,
    speed: 0,
    strength: 9,
    duration: 1.4,
    targeting: 'tether',
    visual: { color: '#c79bff', accent: '#efe0ff', light: 3, size: 0 },
    audio: { cast: 'cast-pull' },
    execute: (ctx, spell) => ctx.pullTarget(spell),
  },
  {
    id: 'blink-step',
    name: 'Blink Step',
    description: 'Folds space to carry you a short distance forward, if the way is clear.',
    cost: 20,
    cooldown: 4,
    range: 8,
    speed: 0,
    strength: 0,
    duration: 0.25,
    targeting: 'dash',
    visual: { color: '#8ab4ff', accent: '#e3ecff', light: 5, size: 0 },
    audio: { cast: 'cast-blink' },
    execute: (ctx, spell) => ctx.blink(spell),
  },
]

export const SPELL_IDS = SPELLS.map((s) => s.id)

export const STARTING_SPELLS = ['arc-bolt', 'force-wave', 'aegis-shield']

export function getSpell(id: string): SpellDef {
  const s = SPELLS.find((sp) => sp.id === id)
  if (!s) throw new Error(`Unknown spell ${id}`)
  return s
}

export const findSpell = (id: string) => SPELLS.find((sp) => sp.id === id)
