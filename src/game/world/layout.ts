/**
 * World layout: the single source of truth for where things are.
 * Geometry, colliders, area detection, audio zones and quests all read from here
 * so the world can be extended without hunting for magic numbers.
 *
 * Units are metres. Y is up. The castle faces south (+Z); the player arrives from the south.
 */

export type Vec3Tuple = [number, number, number]

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const WATER_LEVEL = -18
export const WORLD_HALF_SIZE = 580

/** Flat build platform the castle stands on. */
export const PLATEAU: Rect = { minX: -95, maxX: 95, minZ: -95, maxZ: 140 }

/** Ravine crossed by the entrance bridge. */
export const RAVINE = { centerZ: 85, innerHalfWidth: 6, outerHalfWidth: 14, depth: 26 }

export const LAKE = { center: [-205, 70] as [number, number], radius: 140, innerRadius: 60, bottom: -32 }

export const FOREST = { center: [175, -45] as [number, number], radius: 105 }

export const COURTYARD: Rect = { minX: -30, maxX: 30, minZ: 0, maxZ: 50 }
export const CURTAIN_WALL = { height: 10, thickness: 2 }

export const GRAND_HALL: Rect = { minX: -12, maxX: 12, minZ: -50, maxZ: -2 }
export const GRAND_HALL_HEIGHT = 16

export const LIBRARY: Rect = { minX: -46, maxX: -16, minZ: -42, maxZ: -14 }
export const LIBRARY_HEIGHT = 14
export const LIBRARY_BALCONY_Y = 5

export const TRAINING_YARD: Rect = { minX: 32, maxX: 80, minZ: 2, maxZ: 46 }

export const BRIDGE = { minZ: 66, maxZ: 104, halfWidth: 3.5 }

export const FLIGHT_PLATFORM = { center: [-62, 28] as [number, number], radius: 9, height: 0.8 }

export const SPAWN = { position: [0, 0.2, 128] as Vec3Tuple, yaw: 0 }

/** Named towers. `flatTop` towers have a walkable crenellated roof usable as a landing pad. */
export interface TowerDef {
  id: string
  x: number
  z: number
  radius: number
  height: number
  roof: 'cone' | 'flat'
  roofHeight?: number
}

export const TOWERS: TowerDef[] = [
  { id: 'courtyard-sw', x: -30, z: 50, radius: 5, height: 20, roof: 'flat' },
  { id: 'courtyard-se', x: 30, z: 50, radius: 5, height: 20, roof: 'flat' },
  { id: 'courtyard-nw', x: -30, z: 0, radius: 5, height: 24, roof: 'cone', roofHeight: 12 },
  { id: 'courtyard-ne', x: 30, z: 0, radius: 5, height: 24, roof: 'cone', roofHeight: 12 },
  { id: 'spire-of-dawn', x: 0, z: -60, radius: 7.5, height: 50, roof: 'cone', roofHeight: 26 },
  { id: 'astronomy', x: 24, z: -36, radius: 5.5, height: 38, roof: 'flat' },
  { id: 'library-tower', x: -48, z: -44, radius: 5, height: 32, roof: 'cone', roofHeight: 14 },
  { id: 'west-keep', x: -22, z: -62, radius: 4.5, height: 36, roof: 'cone', roofHeight: 14 },
  { id: 'east-keep', x: 20, z: -64, radius: 4.8, height: 42, roof: 'cone', roofHeight: 16 },
  { id: 'hall-turret-sw', x: -12, z: -2, radius: 2.2, height: 22, roof: 'cone', roofHeight: 9 },
  { id: 'hall-turret-se', x: 12, z: -2, radius: 2.2, height: 22, roof: 'cone', roofHeight: 9 },
  { id: 'hall-turret-nw', x: -12, z: -50, radius: 2.4, height: 26, roof: 'cone', roofHeight: 10 },
  { id: 'hall-turret-ne', x: 12, z: -50, radius: 2.4, height: 26, roof: 'cone', roofHeight: 10 },
  { id: 'bell-tower', x: 38, z: -16, radius: 4, height: 30, roof: 'cone', roofHeight: 12 },
]

export const towerById = (id: string) => {
  const t = TOWERS.find((tw) => tw.id === id)
  if (!t) throw new Error(`Unknown tower ${id}`)
  return t
}

/** Areas drive music, reverb, footstep surfaces and the HUD location label. */
export type AreaId =
  | 'approach'
  | 'courtyard'
  | 'grand-hall'
  | 'library'
  | 'training-yard'
  | 'flight-platform'
  | 'forest'
  | 'lakeside'
  | 'wilds'

export interface AreaDef {
  id: AreaId
  name: string
  interior: boolean
  surface: 'stone' | 'wood' | 'grass'
  contains: (x: number, y: number, z: number) => boolean
}

const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad

const inCircle = (c: [number, number], radius: number, x: number, z: number) =>
  (x - c[0]) ** 2 + (z - c[1]) ** 2 <= radius * radius

/** Ordered by priority: first match wins. */
export const AREAS: AreaDef[] = [
  {
    id: 'grand-hall',
    name: 'The Grand Hall',
    interior: true,
    surface: 'stone',
    contains: (x, y, z) => y < GRAND_HALL_HEIGHT && inRect(GRAND_HALL, x, z, -1),
  },
  {
    id: 'library',
    name: 'The Starlit Library',
    interior: true,
    surface: 'wood',
    contains: (x, y, z) => y < LIBRARY_HEIGHT && inRect(LIBRARY, x, z, -1),
  },
  { id: 'courtyard', name: 'Entrance Courtyard', interior: false, surface: 'stone', contains: (x, _y, z) => inRect(COURTYARD, x, z) },
  { id: 'training-yard', name: 'Practice Grounds', interior: false, surface: 'stone', contains: (x, _y, z) => inRect(TRAINING_YARD, x, z) },
  {
    id: 'flight-platform',
    name: 'Skyward Platform',
    interior: false,
    surface: 'stone',
    contains: (x, _y, z) => inCircle(FLIGHT_PLATFORM.center, FLIGHT_PLATFORM.radius + 6, x, z),
  },
  { id: 'approach', name: 'Pilgrim Bridge', interior: false, surface: 'stone', contains: (x, _y, z) => z > 50 && z < 150 && Math.abs(x) < 40 },
  { id: 'forest', name: 'The Glimmerwood', interior: false, surface: 'grass', contains: (x, _y, z) => inCircle(FOREST.center, FOREST.radius, x, z) },
  { id: 'lakeside', name: 'Mirrormere Shore', interior: false, surface: 'grass', contains: (x, _y, z) => inCircle(LAKE.center, LAKE.radius + 30, x, z) },
]

export const WILDS: AreaDef = { id: 'wilds', name: 'Eldoria Highlands', interior: false, surface: 'grass', contains: () => true }

export function areaAt(x: number, y: number, z: number): AreaDef {
  for (const a of AREAS) if (a.contains(x, y, z)) return a
  return WILDS
}

/** Hidden places rewarded on discovery. */
export interface SecretDef {
  id: string
  name: string
  position: Vec3Tuple
  radius: number
  hint: string
}

export const SECRETS: SecretDef[] = [
  { id: 'astronomy-summit', name: 'Astronomer’s Perch', position: [24, 38, -36], radius: 5, hint: 'Above the tallest flat-topped tower.' },
  { id: 'library-nook', name: 'The Quiet Nook', position: [-43.2, LIBRARY_BALCONY_Y, -39.3], radius: 1.6, hint: 'Behind the shelves of the upper gallery.' },
  { id: 'glimmer-shrine', name: 'Glimmerwood Shrine', position: [215, 0, -95], radius: 7, hint: 'Deep in the glowing forest.' },
  { id: 'mirrormere-ruin', name: 'Drowned Chapel', position: [-128, 0, -10], radius: 8, hint: 'On the cliffs above the lake.' },
]

/** Floating rings for the flight course (order matters for the challenge display only). */
export const FLIGHT_RINGS: Vec3Tuple[] = [
  [-62, 14, -4],
  [-60, 22, -60],
  [-10, 30, -96],
  [44, 34, -70],
  [62, 26, -10],
  [56, 20, 60],
  [0, 18, 85],
  [-48, 16, 64],
]
