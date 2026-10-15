import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../state/settings'
import { DEFAULT_BINDINGS, findConflicts } from '../input/bindings'
import { isTypingTarget } from '../input/InputManager'
import { MusicDirector, desiredMusic } from '../audio/musicDirector'
import { terrainHeight } from '../world/terrain/heightfield'
import { AREAS, BRIDGE, COURTYARD, GRAND_HALL, LAKE, SPAWN, WATER_LEVEL, areaAt } from '../world/layout'
import { clamp, dampAngle, wrapAngle } from './math'

describe('settings', () => {
  it('sanitises corrupt data back to defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('junk')).toEqual(DEFAULT_SETTINGS)
  })
  it('clamps out-of-range values and keeps valid ones', () => {
    const s = sanitizeSettings({ graphics: { fov: 500, quality: 'ultra' }, audio: { master: 0.3, music: -2 }, controls: { mouseSensitivity: 'fast' } })
    expect(s.graphics.fov).toBe(90)
    expect(s.graphics.quality).toBe(DEFAULT_SETTINGS.graphics.quality)
    expect(s.audio.master).toBe(0.3)
    expect(s.audio.music).toBe(0)
    expect(s.controls.mouseSensitivity).toBe(DEFAULT_SETTINGS.controls.mouseSensitivity)
  })
  it('repairs invalid key bindings per action', () => {
    const s = sanitizeSettings({ controls: { bindings: { jump: ['KeyJ'], moveForward: 'W' } } })
    expect(s.controls.bindings.jump).toEqual(['KeyJ'])
    expect(s.controls.bindings.moveForward).toEqual(DEFAULT_BINDINGS.moveForward)
  })
})

describe('key bindings', () => {
  it('default bindings have no conflicts (Space is shared only across ground/flight contexts)', () => {
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([])
  })
  it('detects a conflict in the same context', () => {
    const conflicts = findConflicts({ ...DEFAULT_BINDINGS, interact: ['KeyF'] })
    expect(conflicts.some((c) => c.code === 'KeyF')).toBe(true)
  })
  it('ignores gameplay keys while typing in text fields', () => {
    const input = document.createElement('input')
    input.type = 'text'
    const range = document.createElement('input')
    range.type = 'range'
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(range)).toBe(false)
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
  })
})

describe('music director', () => {
  const inputs = { phase: 'playing' as const, area: 'courtyard' as const, flying: false, combat: false }
  it('maps situations to music states', () => {
    expect(desiredMusic({ ...inputs, phase: 'menu' })).toBe('menu')
    expect(desiredMusic({ ...inputs, area: 'grand-hall' })).toBe('hall')
    expect(desiredMusic({ ...inputs, area: 'forest' })).toBe('forest')
    expect(desiredMusic({ ...inputs, flying: true })).toBe('flight')
    expect(desiredMusic({ ...inputs, flying: true, combat: true })).toBe('combat')
  })
  it('does not switch when briefly crossing a boundary', () => {
    const d = new MusicDirector(2.5, 0.4)
    expect(d.update(inputs, 0)).toBeNull()
    expect(d.update(inputs, 0.5)).toBe('castle')
    expect(d.update({ ...inputs, area: 'grand-hall' }, 1)).toBeNull()
    expect(d.update({ ...inputs, area: 'grand-hall' }, 2)).toBeNull()
    expect(d.update(inputs, 2.2)).toBeNull()
    expect(d.current).toBe('castle')
    d.update({ ...inputs, area: 'grand-hall' }, 3)
    expect(d.update({ ...inputs, area: 'grand-hall' }, 5.6)).toBe('hall')
  })
  it('switches to combat quickly', () => {
    const d = new MusicDirector(2.5, 0.4)
    d.update(inputs, 0)
    d.update(inputs, 1)
    d.update({ ...inputs, combat: true }, 2)
    expect(d.update({ ...inputs, combat: true }, 2.5)).toBe('combat')
  })
})

describe('world layout and terrain', () => {
  it('keeps the castle plateau flat at y = 0', () => {
    for (const [x, z] of [
      [0, 25],
      [0, -26],
      [-31, -28],
      [56, 24],
      [SPAWN.position[0], SPAWN.position[2]],
    ]) {
      expect(Math.abs(terrainHeight(x, z))).toBeLessThan(0.01)
    }
  })
  it('carves a ravine under the bridge and a lake below the water line', () => {
    expect(terrainHeight(0, (BRIDGE.minZ + BRIDGE.maxZ) / 2)).toBeLessThan(WATER_LEVEL)
    expect(terrainHeight(LAKE.center[0], LAKE.center[1])).toBeLessThan(WATER_LEVEL)
  })
  it('the bridge spans the full width of the ravine', () => {
    expect(Math.abs(terrainHeight(0, BRIDGE.minZ))).toBeLessThan(0.5)
    expect(Math.abs(terrainHeight(0, BRIDGE.maxZ))).toBeLessThan(0.5)
  })
  it('is deterministic', () => {
    expect(terrainHeight(123.4, -56.7)).toBe(terrainHeight(123.4, -56.7))
  })
  it('resolves named areas', () => {
    expect(areaAt(0, 1, 25).id).toBe('courtyard')
    expect(areaAt(0, 1, -26).id).toBe('grand-hall')
    expect(areaAt(-31, 1, -28).id).toBe('library')
    expect(areaAt(0, 1, (GRAND_HALL.minZ + GRAND_HALL.maxZ) / 2).interior).toBe(true)
    expect(areaAt(COURTYARD.minX + 1, 1, COURTYARD.minZ + 1).interior).toBe(false)
    expect(AREAS.length).toBeGreaterThan(5)
  })
})

describe('math helpers', () => {
  it('wraps and damps angles the short way round', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    const a = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 100, 1)
    expect(Math.abs(wrapAngle(a - (-Math.PI + 0.1)))).toBeLessThan(1e-6)
    expect(clamp(5, 0, 1)).toBe(1)
  })
})
