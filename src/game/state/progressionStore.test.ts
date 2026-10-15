import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProgression } from './progressionStore'
import { events, type GameEvent } from '../core/events'

// localStorage is touched by save(); jsdom provides it, but guard for a plain node run.
beforeEach(() => {
  useProgression.getState().newGame()
})

afterEach(() => {
  events.clear()
})

describe('collectBroom', () => {
  it('starts with no broom', () => {
    const p = useProgression.getState().progression
    expect(p.hasBroom).toBe(false)
    expect(p.broomsCollected).toEqual([])
  })

  it('collecting a broom sets hasBroom and appends the id, and is idempotent', () => {
    const collected: string[] = []
    const off = events.on('broom:collected', (e: Extract<GameEvent, { type: 'broom:collected' }>) => collected.push(e.broomId))

    useProgression.getState().collectBroom('broom-courtyard')
    let p = useProgression.getState().progression
    expect(p.hasBroom).toBe(true)
    expect(p.broomsCollected).toEqual(['broom-courtyard'])
    expect(collected).toEqual(['broom-courtyard'])

    // Second call with the same id is a no-op.
    useProgression.getState().collectBroom('broom-courtyard')
    p = useProgression.getState().progression
    expect(p.broomsCollected).toEqual(['broom-courtyard'])
    expect(collected).toEqual(['broom-courtyard'])

    off()
  })
})
