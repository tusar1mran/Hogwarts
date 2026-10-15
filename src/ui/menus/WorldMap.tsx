import { useGame } from '../../game/state/gameStore'
import { useHud } from '../../game/state/hudStore'
import { useProgression } from '../../game/state/progressionStore'
import { resumeGame } from '../../game/session'
import { events } from '../../game/core/events'
import { worldToMap } from '../../game/world/mapProjection'
import { questMarkers } from '../../game/quests/questMap'
import {
  BRIDGE,
  BROOM_PICKUPS,
  COURTYARD,
  FLIGHT_PLATFORM,
  FLIGHT_RINGS,
  FOREST,
  GRAND_HALL,
  LAKE,
  LIBRARY,
  PLATEAU,
  SECRETS,
  TOWERS,
  TRAINING_YARD,
  type Rect,
} from '../../game/world/layout'

const SIZE = 440

const click = (fn: () => void) => () => {
  events.emit({ type: 'ui:click' })
  fn()
}

/** Converts a world Rect into an SVG rect (x, y, width, height) through worldToMap. */
function rectToMap(r: Rect) {
  const a = worldToMap(r.minX, r.minZ, SIZE)
  const b = worldToMap(r.maxX, r.maxZ, SIZE)
  return { x: Math.min(a.mx, b.mx), y: Math.min(a.my, b.my), width: Math.abs(b.mx - a.mx), height: Math.abs(b.my - a.my) }
}

/** A world circle (centre + radius) projected to the map. Radius scales with the map/world ratio. */
function circleToMap(center: [number, number], radius: number) {
  const c = worldToMap(center[0], center[1], SIZE)
  // The scale is identical on both axes, so project a radius offset to derive the pixel radius.
  const edge = worldToMap(center[0] + radius, center[1], SIZE)
  return { cx: c.mx, cy: c.my, r: Math.abs(edge.mx - c.mx) }
}

const LANDMARK_RECTS: Array<{ id: string; rect: Rect; cls: string }> = [
  { id: 'plateau', rect: PLATEAU, cls: 'map-plateau' },
  { id: 'courtyard', rect: COURTYARD, cls: 'map-building' },
  { id: 'grand-hall', rect: GRAND_HALL, cls: 'map-building' },
  { id: 'library', rect: LIBRARY, cls: 'map-building' },
  { id: 'training-yard', rect: TRAINING_YARD, cls: 'map-building' },
  { id: 'bridge', rect: { minX: -BRIDGE.halfWidth, maxX: BRIDGE.halfWidth, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ }, cls: 'map-path' },
]

export function WorldMap() {
  const progression = useProgression((s) => s.progression)
  // These three re-render at most ~10 Hz (HudSync cadence), never per frame.
  const playerX = useHud((s) => s.playerX)
  const playerZ = useHud((s) => s.playerZ)
  const playerFacing = useHud((s) => s.playerFacing)

  const lake = circleToMap(LAKE.center, LAKE.radius)
  const forest = circleToMap(FOREST.center, FOREST.radius)
  const platform = circleToMap(FLIGHT_PLATFORM.center, FLIGHT_PLATFORM.radius)
  const player = worldToMap(playerX, playerZ, SIZE)
  const markers = questMarkers(progression)

  return (
    <div className="panel modal" role="dialog" aria-label="World map" style={{ width: 'min(520px, calc(100vw - 32px))' }}>
      <div className="modal-header">
        <h2 className="panel-title">World Map</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-small" onClick={click(() => useGame.getState().openOverlay('pause'))}>
            Menu
          </button>
          <button type="button" className="btn btn-small" onClick={resumeGame}>
            Resume
          </button>
        </div>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ display: 'block', background: '#0d1020', borderRadius: 8, border: '1px solid var(--stone-700, #30364a)' }} role="img" aria-label="Schematic of the academy grounds">
        {/* Natural features. */}
        <circle cx={lake.cx} cy={lake.cy} r={lake.r} fill="#1c3a5a" opacity={0.6} />
        <circle cx={forest.cx} cy={forest.cy} r={forest.r} fill="#1b3a24" opacity={0.6} />

        {/* Grounds and buildings. */}
        {LANDMARK_RECTS.map(({ id, rect, cls }) => {
          const m = rectToMap(rect)
          return <rect key={id} className={cls} x={m.x} y={m.y} width={m.width} height={m.height} fill={cls === 'map-plateau' ? '#232838' : cls === 'map-path' ? '#4a4030' : '#3a4262'} stroke="#5a6488" strokeWidth={0.5} rx={1} />
        })}

        {/* Skyward platform. */}
        <circle cx={platform.cx} cy={platform.cy} r={Math.max(platform.r, 2)} fill="#4a3a62" stroke="#8a6fb0" strokeWidth={0.5} />

        {/* Towers. */}
        {TOWERS.map((t) => {
          const c = circleToMap([t.x, t.z], t.radius)
          return <circle key={t.id} cx={c.cx} cy={c.cy} r={Math.max(c.r, 1.2)} fill="#6a6f88" />
        })}

        {/* Faint flight rings. */}
        {FLIGHT_RINGS.map((ring, i) => {
          const m = worldToMap(ring[0], ring[2], SIZE)
          return <circle key={`ring-${i}`} cx={m.mx} cy={m.my} r={1.4} fill="none" stroke="#6fd6ff" strokeWidth={0.4} opacity={0.4} />
        })}

        {/* Faint secrets. */}
        {SECRETS.map((s) => {
          const m = worldToMap(s.position[0], s.position[2], SIZE)
          return <circle key={s.id} cx={m.mx} cy={m.my} r={1.2} fill="#d8b84a" opacity={0.35} />
        })}

        {/* Broom pickups, styled available vs collected. */}
        {BROOM_PICKUPS.map((b) => {
          const m = worldToMap(b.position[0], b.position[2], SIZE)
          const collected = progression.broomsCollected.includes(b.id)
          return (
            <g key={b.id} transform={`translate(${m.mx} ${m.my})`} opacity={collected ? 0.4 : 1}>
              <circle r={3} fill={collected ? '#5a6060' : '#c9a050'} stroke="#1a1d2a" strokeWidth={0.5} />
              <title>{collected ? `${b.name} (collected)` : b.name}</title>
            </g>
          )
        })}

        {/* Quest markers. */}
        {markers.map((mk) => {
          const m = worldToMap(mk.at[0], mk.at[1], SIZE)
          return (
            <g key={mk.id} transform={`translate(${m.mx} ${m.my})`}>
              <circle r={3.2} fill={mk.status === 'active' ? '#ffcf5a' : '#8fb0ff'} stroke="#1a1d2a" strokeWidth={0.6} />
              <title>{mk.label}</title>
            </g>
          )
        })}

        {/* Player: a triangle rotated by facing (facing 0 = -Z = up on the map). */}
        <g transform={`translate(${player.mx} ${player.my}) rotate(${(playerFacing * 180) / Math.PI})`}>
          <polygon points="0,-5 3.5,4 -3.5,4" fill="#e8f0ff" stroke="#1a1d2a" strokeWidth={0.6} />
          <title>You</title>
        </g>
      </svg>
      <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 0 }}>
        North is up. Gold markers track active objectives; the brass glyphs are brooms you can take for flight.
      </p>
    </div>
  )
}
