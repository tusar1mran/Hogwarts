/**
 * Pure spell economy: mana, cooldowns and cast validation.
 * Kept free of three.js / React so it can be unit tested and reasoned about in isolation.
 * Times are in seconds on the game clock.
 */

export interface SpellEconomy {
  id: string
  cost: number
  cooldown: number
}

export interface CasterState {
  mana: number
  maxMana: number
  /** Mana regenerated per second. */
  regen: number
  /** Seconds of no casting before regeneration starts. */
  regenDelay: number
  lastCastAt: number
  /** Game time when each spell becomes ready again. */
  readyAt: Record<string, number>
}

export type CastCheck = { ok: true } | { ok: false; reason: 'locked' | 'cooldown' | 'mana' }

export const createCaster = (maxMana = 100): CasterState => ({
  mana: maxMana,
  maxMana,
  regen: 14,
  regenDelay: 0.8,
  lastCastAt: -Infinity,
  readyAt: {},
})

export function cooldownRemaining(state: CasterState, spellId: string, now: number): number {
  const ready = state.readyAt[spellId] ?? -Infinity
  return Math.max(0, ready - now)
}

/** 0 when ready, 1 immediately after casting. */
export function cooldownFraction(state: CasterState, spell: SpellEconomy, now: number): number {
  if (spell.cooldown <= 0) return 0
  return Math.min(1, cooldownRemaining(state, spell.id, now) / spell.cooldown)
}

export function canCast(state: CasterState, spell: SpellEconomy, now: number, unlocked: readonly string[]): CastCheck {
  if (!unlocked.includes(spell.id)) return { ok: false, reason: 'locked' }
  if (cooldownRemaining(state, spell.id, now) > 0) return { ok: false, reason: 'cooldown' }
  if (state.mana + 1e-6 < spell.cost) return { ok: false, reason: 'mana' }
  return { ok: true }
}

/** Returns a new state with the cost paid and the cooldown started. Does not validate. */
export function applyCast(state: CasterState, spell: SpellEconomy, now: number): CasterState {
  return {
    ...state,
    mana: Math.max(0, state.mana - spell.cost),
    lastCastAt: now,
    readyAt: { ...state.readyAt, [spell.id]: now + spell.cooldown },
  }
}

/** Refund a cast that could not take effect (e.g. Mystic Pull with no target). */
export function refundCast(state: CasterState, spell: SpellEconomy): CasterState {
  const readyAt = { ...state.readyAt }
  delete readyAt[spell.id]
  return { ...state, mana: Math.min(state.maxMana, state.mana + spell.cost), readyAt }
}

export function regenerate(state: CasterState, now: number, dt: number): CasterState {
  if (state.mana >= state.maxMana || now - state.lastCastAt < state.regenDelay) return state
  return { ...state, mana: Math.min(state.maxMana, state.mana + state.regen * dt) }
}
