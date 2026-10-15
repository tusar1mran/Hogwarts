import { BRIDGE, COURTYARD, GRAND_HALL, LIBRARY, PLATEAU, TRAINING_YARD, type Rect } from '../../game/world/layout'

/** Built-up areas drawn on both the world map and the minimap, derived from layout.ts. */
export const LANDMARK_RECTS: Array<{ id: string; rect: Rect; fill: string }> = [
  { id: 'plateau', rect: PLATEAU, fill: '#232838' },
  { id: 'courtyard', rect: COURTYARD, fill: '#3a4262' },
  { id: 'grand-hall', rect: GRAND_HALL, fill: '#3a4262' },
  { id: 'library', rect: LIBRARY, fill: '#3a4262' },
  { id: 'training-yard', rect: TRAINING_YARD, fill: '#3a4262' },
  { id: 'bridge', rect: { minX: -BRIDGE.halfWidth, maxX: BRIDGE.halfWidth, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ }, fill: '#4a4030' },
]

export const MAP_COLOURS = {
  background: '#0d1020',
  lake: '#1c3a5a',
  forest: '#1b3a24',
  stroke: '#5a6488',
  platform: '#4a3a62',
  platformStroke: '#8a6fb0',
  tower: '#6a6f88',
  activeQuest: '#ffcf5a',
  availableQuest: '#8fb0ff',
  npc: '#b9c6e8',
  player: '#e8f0ff',
  outline: '#1a1d2a',
}
