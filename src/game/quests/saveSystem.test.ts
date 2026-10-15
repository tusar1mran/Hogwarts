import { describe, expect, it } from 'vitest'
import { createProgression } from './questEngine'
import { hasValidSave, parseSave, sanitizeProgression, SAVE_VERSION, serializeSave } from './saveSystem'
import { BROOM_PICKUPS } from '../world/layout'

const BROOM_ID = BROOM_PICKUPS[0].id

describe('save migration across versions', () => {
  it('still migrates a v1 prototype save', () => {
    const res = parseSave(JSON.stringify({ version: 1, xp: 120, completed: ['first-spark'], spells: ['luminous-orb'] }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.migratedFrom).toBe(1)
      expect(res.progression.quests['first-spark'].status).toBe('completed')
    }
  })

  it('loads a v2 save (no broom fields) with safe defaults and still counts as a valid save', () => {
    const v2 = JSON.stringify({ version: 2, savedAt: new Date().toISOString(), progression: createProgression() })
    const res = parseSave(v2)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.migratedFrom).toBe(2)
      expect(res.progression.hasBroom).toBe(false)
      expect(res.progression.broomsCollected).toEqual([])
    }
    // Regression: a stored v2 string keeps hasValidSave() true.
    globalThis.localStorage?.setItem('eldoria.save', v2)
    expect(hasValidSave()).toBe(true)
    globalThis.localStorage?.removeItem('eldoria.save')
  })

  it('round-trips a v3 save including the new broom fields', () => {
    const p = { ...createProgression(), hasBroom: true, broomsCollected: [BROOM_ID] }
    const text = serializeSave(p)
    expect(JSON.parse(text).version).toBe(SAVE_VERSION)
    const res = parseSave(text)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.migratedFrom).toBeUndefined()
      expect(res.progression.hasBroom).toBe(true)
      expect(res.progression.broomsCollected).toEqual([BROOM_ID])
    }
  })

  it('rejects a newer (v4) save as unsupported', () => {
    expect(parseSave(JSON.stringify({ version: 4 }))).toMatchObject({ ok: false, reason: 'unsupported' })
  })
})

describe('sanitizeProgression broom fields', () => {
  it('defaults missing broom fields', () => {
    const p = sanitizeProgression({ xp: 0 })
    expect(p).not.toBeNull()
    expect(p!.hasBroom).toBe(false)
    expect(p!.broomsCollected).toEqual([])
  })

  it('preserves set broom fields and drops unknown broom ids', () => {
    const p = sanitizeProgression({ hasBroom: true, broomsCollected: [BROOM_ID, 'not-a-broom', 42] })
    expect(p).not.toBeNull()
    expect(p!.hasBroom).toBe(true)
    expect(p!.broomsCollected).toEqual([BROOM_ID])
  })
})
