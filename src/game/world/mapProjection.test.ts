import { describe, expect, it } from 'vitest'
import { MAP_VIEW, worldToMap } from './mapProjection'

const SIZE = 400

describe('worldToMap', () => {
  it('maps the world origin to the centre of the canvas', () => {
    expect(worldToMap(0, 0, SIZE)).toEqual({ mx: SIZE / 2, my: SIZE / 2 })
  })

  it('maps the four world corners to the SVG corners', () => {
    // North-west: (-MAP_VIEW world X, -MAP_VIEW world Z) -> top-left (0, 0).
    expect(worldToMap(-MAP_VIEW, -MAP_VIEW, SIZE)).toEqual({ mx: 0, my: 0 })
    // North-east: (+X, -Z) -> top-right.
    expect(worldToMap(MAP_VIEW, -MAP_VIEW, SIZE)).toEqual({ mx: SIZE, my: 0 })
    // South-west: (-X, +Z) -> bottom-left.
    expect(worldToMap(-MAP_VIEW, MAP_VIEW, SIZE)).toEqual({ mx: 0, my: SIZE })
    // South-east: (+X, +Z) -> bottom-right.
    expect(worldToMap(MAP_VIEW, MAP_VIEW, SIZE)).toEqual({ mx: SIZE, my: SIZE })
  })

  it('places world north (-Z) above the centre on the map', () => {
    expect(worldToMap(0, -MAP_VIEW / 2, SIZE).my).toBeLessThan(SIZE / 2)
  })
})
