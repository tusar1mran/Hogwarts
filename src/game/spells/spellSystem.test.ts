import { describe, expect, it } from 'vitest'
import { applyCast, canCast, cooldownFraction, cooldownRemaining, createCaster, refundCast, regenerate } from './spellSystem'
import { SPELLS, STARTING_SPELLS, getSpell } from './registry'

const bolt = getSpell('arc-bolt')
const shield = getSpell('aegis-shield')

describe('spell economy', () => {
  it('allows casting an unlocked spell with enough mana and no cooldown', () => {
    expect(canCast(createCaster(), bolt, 0, STARTING_SPELLS)).toEqual({ ok: true })
  })

  it('rejects locked spells', () => {
    expect(canCast(createCaster(), getSpell('blink-step'), 0, STARTING_SPELLS)).toEqual({ ok: false, reason: 'locked' })
  })

  it('deducts the exact energy cost', () => {
    const s = applyCast(createCaster(100), shield, 0)
    expect(s.mana).toBe(100 - shield.cost)
  })

  it('rejects casts when mana is insufficient', () => {
    const s = { ...createCaster(100), mana: shield.cost - 1 }
    expect(canCast(s, shield, 10, STARTING_SPELLS)).toEqual({ ok: false, reason: 'mana' })
  })

  it('starts the cooldown and blocks recasting until it expires', () => {
    const s = applyCast(createCaster(), shield, 5)
    expect(cooldownRemaining(s, shield.id, 5)).toBeCloseTo(shield.cooldown)
    expect(canCast(s, shield, 5 + shield.cooldown - 0.01, STARTING_SPELLS)).toEqual({ ok: false, reason: 'cooldown' })
    expect(canCast(s, shield, 5 + shield.cooldown, STARTING_SPELLS)).toEqual({ ok: true })
  })

  it('reports cooldown as a fraction from 1 to 0', () => {
    const s = applyCast(createCaster(), shield, 0)
    expect(cooldownFraction(s, shield, 0)).toBe(1)
    expect(cooldownFraction(s, shield, shield.cooldown / 2)).toBeCloseTo(0.5)
    expect(cooldownFraction(s, shield, shield.cooldown * 2)).toBe(0)
  })

  it('keeps cooldowns independent per spell', () => {
    const s = applyCast(createCaster(), shield, 0)
    expect(canCast(s, bolt, 0.01, STARTING_SPELLS)).toEqual({ ok: true })
  })

  it('refunds mana and clears the cooldown for a spell that had no effect', () => {
    const cast = applyCast(createCaster(100), shield, 0)
    const refunded = refundCast(cast, shield)
    expect(refunded.mana).toBe(100)
    expect(cooldownRemaining(refunded, shield.id, 0)).toBe(0)
  })

  it('regenerates mana only after the regen delay and never above max', () => {
    const cast = applyCast(createCaster(100), shield, 0)
    expect(regenerate(cast, 0.1, 1).mana).toBe(cast.mana)
    const later = regenerate(cast, 5, 1)
    expect(later.mana).toBeCloseTo(cast.mana + cast.regen)
    expect(regenerate({ ...cast, mana: 99.9 }, 10, 5).mana).toBe(100)
  })

  it('never lets mana go negative', () => {
    const s = applyCast({ ...createCaster(), mana: 1 }, shield, 0)
    expect(s.mana).toBe(0)
  })
})

describe('spell registry', () => {
  it('defines the six original spells with unique ids and valid numbers', () => {
    expect(SPELLS).toHaveLength(6)
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(6)
    for (const s of SPELLS) {
      expect(s.cost).toBeGreaterThan(0)
      expect(s.cooldown).toBeGreaterThan(0)
      expect(typeof s.execute).toBe('function')
      expect(s.audio.cast).toBeTruthy()
    }
  })

  it('projectile spells have a speed and range', () => {
    expect(bolt.targeting).toBe('projectile')
    expect(bolt.speed).toBeGreaterThan(0)
    expect(bolt.range).toBeGreaterThan(0)
  })
})
