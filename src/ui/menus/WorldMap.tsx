import { useState } from 'react'
import { useGame } from '../../game/state/gameStore'
import { useHud } from '../../game/state/hudStore'
import { useProgression } from '../../game/state/progressionStore'
import { resumeGame } from '../../game/session'
import { events } from '../../game/core/events'
import { worldToMap } from '../../game/world/mapProjection'
import { questEntries } from '../../game/quests/questMap'
import { NPCS } from '../../game/npc/NPCs'
import { DIALOGUES } from '../../game/npc/dialogueData'
import { BROOM_PICKUPS, FLIGHT_PLATFORM, FLIGHT_RINGS, FOREST, LAKE, SECRETS, TOWERS, type Rect } from '../../game/world/layout'
import { LANDMARK_RECTS, MAP_COLOURS as C } from '../map/landmarks'

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

export function WorldMap() {
  const progression = useProgression((s) => s.progression)
  // These three re-render at most ~10 Hz (HudSync cadence), never per frame.
  const playerX = useHud((s) => s.playerX)
  const playerZ = useHud((s) => s.playerZ)
  const playerFacing = useHud((s) => s.playerFacing)
  const tracked = useHud((s) => s.trackedQuest)

  const entries = questEntries(progression)
  const [selected, setSelected] = useState<string | null>(() => tracked ?? entries.find((e) => e.status === 'active')?.id ?? null)
  const selectedEntry = entries.find((e) => e.id === selected) ?? null

  const choose = (id: string, active: boolean) =>
    click(() => {
      setSelected(id)
      // Active missions become the tracked one: the compass and minimap follow it.
      if (active) useHud.getState().patch({ trackedQuest: id })
    })

  const lake = circleToMap(LAKE.center, LAKE.radius)
  const forest = circleToMap(FOREST.center, FOREST.radius)
  const platform = circleToMap(FLIGHT_PLATFORM.center, FLIGHT_PLATFORM.radius)
  const player = worldToMap(playerX, playerZ, SIZE)

  return (
    <div className="panel modal" role="dialog" aria-label="World map" style={{ width: 'min(860px, calc(100vw - 32px))' }}>
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
      <div className="map-layout">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" className="map-canvas" role="img" aria-label="Schematic of the academy grounds">
          {/* Natural features. */}
          <circle cx={lake.cx} cy={lake.cy} r={lake.r} fill={C.lake} opacity={0.6} />
          <circle cx={forest.cx} cy={forest.cy} r={forest.r} fill={C.forest} opacity={0.6} />

          {/* Grounds and buildings. */}
          {LANDMARK_RECTS.map(({ id, rect, fill }) => {
            const m = rectToMap(rect)
            return <rect key={id} x={m.x} y={m.y} width={m.width} height={m.height} fill={fill} stroke={C.stroke} strokeWidth={0.5} rx={1} />
          })}

          {/* Skyward platform. */}
          <circle cx={platform.cx} cy={platform.cy} r={Math.max(platform.r, 2)} fill={C.platform} stroke={C.platformStroke} strokeWidth={0.5} />

          {/* Towers. */}
          {TOWERS.map((t) => {
            const c = circleToMap([t.x, t.z], t.radius)
            return <circle key={t.id} cx={c.cx} cy={c.cy} r={Math.max(c.r, 1.2)} fill={C.tower} />
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

          {/* People. */}
          {NPCS.map((n) => {
            const m = worldToMap(n.position[0], n.position[2], SIZE)
            return (
              <circle key={n.id} cx={m.mx} cy={m.my} r={1.6} fill={C.npc} stroke={C.outline} strokeWidth={0.4}>
                <title>{DIALOGUES[n.id]?.name ?? n.id}</title>
              </circle>
            )
          })}

          {/* Broom pickups, styled available vs collected. */}
          {BROOM_PICKUPS.map((b) => {
            const m = worldToMap(b.position[0], b.position[2], SIZE)
            const collected = progression.broomsCollected.includes(b.id)
            return (
              <g key={b.id} transform={`translate(${m.mx} ${m.my})`} opacity={collected ? 0.4 : 1}>
                <circle r={3} fill={collected ? '#5a6060' : '#c9a050'} stroke={C.outline} strokeWidth={0.5} />
                <title>{collected ? `${b.name} (collected)` : b.name}</title>
              </g>
            )
          })}

          {/* Quest markers; the selected one is enlarged, ringed and labelled. */}
          {entries.map((e) => {
            if (!e.at) return null
            const m = worldToMap(e.at[0], e.at[1], SIZE)
            const isSelected = e.id === selected
            return (
              <g key={e.id} transform={`translate(${m.mx} ${m.my})`} style={{ cursor: 'pointer' }} onClick={choose(e.id, e.status === 'active')}>
                {isSelected && <circle r={8} fill="none" stroke={C.activeQuest} strokeWidth={1} className="map-pulse" />}
                <circle r={isSelected ? 4.6 : 3.2} fill={e.status === 'active' ? C.activeQuest : C.availableQuest} stroke={C.outline} strokeWidth={0.6} />
                {isSelected && (
                  <text y={-11} textAnchor="middle" className="map-label">
                    {e.label}
                  </text>
                )}
                <title>{`${e.title}: ${e.label}`}</title>
              </g>
            )
          })}

          {/* Player: a triangle rotated by facing (facing 0 = -Z = up on the map). */}
          <g transform={`translate(${player.mx} ${player.my}) rotate(${(playerFacing * 180) / Math.PI})`}>
            <polygon points="0,-5 3.5,4 -3.5,4" fill={C.player} stroke={C.outline} strokeWidth={0.6} />
            <title>You</title>
          </g>
        </svg>

        <div className="map-missions">
          <h3>Missions</h3>
          {entries.length === 0 && <p className="muted">No missions right now. Explore, or talk to people around the grounds.</p>}
          {entries.map((e) => (
            <button key={e.id} type="button" className="list-item" aria-current={e.id === selected} onClick={choose(e.id, e.status === 'active')}>
              <span className={`mission-dot ${e.status}`} aria-hidden />
              {e.title}
              {e.id === tracked && e.status === 'active' && <span className="mission-tracked"> · tracking</span>}
              <small>
                {e.status === 'available' ? 'New: ' : ''}
                {e.objective}
                {e.progress && ` (${e.progress})`}
              </small>
            </button>
          ))}
          {selectedEntry && !selectedEntry.at && <p className="muted map-note">This objective has no fixed place on the map. The Cartographer’s Lens marks hidden places on your compass.</p>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 0 }}>
        North is up. Gold: active missions. Blue: new missions to pick up. Click a mission to track it with the compass and minimap.
      </p>
    </div>
  )
}
