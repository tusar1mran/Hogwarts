import { WORLD_HALF_SIZE } from './layout'

/**
 * Half-extent (metres) of the square world region the map covers. The playable world is
 * WORLD_HALF_SIZE in every direction from the origin, so the whole thing fits on the map.
 */
export const MAP_VIEW = WORLD_HALF_SIZE

/**
 * Projects a world (x, z) coordinate onto an SVG canvas of the given size (pixels, square).
 *
 * World +Z maps to +Y (down the SVG), so world north (-Z) ends up at the top of the map and
 * east (+X) on the right — the orientation a player reads with north "up".
 */
export function worldToMap(x: number, z: number, size: number): { mx: number; my: number } {
  return {
    mx: (x / (2 * MAP_VIEW) + 0.5) * size,
    my: (z / (2 * MAP_VIEW) + 0.5) * size,
  }
}
