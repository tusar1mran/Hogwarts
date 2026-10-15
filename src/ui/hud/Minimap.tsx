import { useHud } from '../../game/state/hudStore'
import { useProgression } from '../../game/state/progressionStore'
import { questEntries } from '../../game/quests/questMap'
import { questStatus } from '../../game/quests/questEngine'
import { NPCS } from '../../game/npc/NPCs'
import { DIALOGUES } from '../../game/npc/dialogueData'
import { FLIGHT_PLATFORM, FOREST, LAKE, TOWERS } from '../../game/world/layout'
import { LANDMARK_RECTS, MAP_COLOURS as C } from '../map/landmarks'

const SIZE = 168
const R = SIZE / 2
/** World metres from the player to the minimap's edge. */
const VIEW_M = 110
const SCALE = R / VIEW_M

/**
 * North-up minimap centred on the player. Reads the player pose from the ~10 Hz HUD snapshot,
 * so it re-renders at most ~10 times a second. Quest markers beyond the edge are pinned to the
 * rim so the player can still see which way to go.
 */
export function Minimap() {
  const progression = useProgression((s) => s.progression)
  const px = useHud((s) => s.playerX)
  const pz = useHud((s) => s.playerZ)
  const facing = useHud((s) => s.playerFacing)
  const tracked = useHud((s) => s.trackedQuest)

  const toMap = (x: number, z: number) => ({ x: R + (x - px) * SCALE, y: R + (z - pz) * SCALE })
  const pinned = (x: number, z: number, inset: number) => {
    const m = toMap(x, z)
    const dx = m.x - R
    const dy = m.y - R
    const d = Math.hypot(dx, dy)
    const max = R - inset
    return d <= max ? { ...m, edge: false } : { x: R + (dx / d) * max, y: R + (dy / d) * max, edge: true }
  }

  const lake = toMap(LAKE.center[0], LAKE.center[1])
  const forest = toMap(FOREST.center[0], FOREST.center[1])
  const platform = toMap(FLIGHT_PLATFORM.center[0], FLIGHT_PLATFORM.center[1])
  const entries = questEntries(progression)

  return (
    <svg className="minimap" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Minimap">
      <defs>
        <clipPath id="minimap-clip">
          <circle cx={R} cy={R} r={R - 1} />
        </clipPath>
      </defs>
      <g clipPath="url(#minimap-clip)">
        <rect width={SIZE} height={SIZE} fill={C.background} />
        <circle cx={lake.x} cy={lake.y} r={LAKE.radius * SCALE} fill={C.lake} opacity={0.7} />
        <circle cx={forest.x} cy={forest.y} r={FOREST.radius * SCALE} fill={C.forest} opacity={0.7} />
        {LANDMARK_RECTS.map(({ id, rect, fill }) => {
          const a = toMap(rect.minX, rect.minZ)
          return <rect key={id} x={a.x} y={a.y} width={(rect.maxX - rect.minX) * SCALE} height={(rect.maxZ - rect.minZ) * SCALE} fill={fill} stroke={C.stroke} strokeWidth={0.5} />
        })}
        <circle cx={platform.x} cy={platform.y} r={FLIGHT_PLATFORM.radius * SCALE} fill={C.platform} stroke={C.platformStroke} strokeWidth={0.6} />
        {TOWERS.map((t) => {
          const m = toMap(t.x, t.z)
          return <circle key={t.id} cx={m.x} cy={m.y} r={Math.max(1.5, t.radius * SCALE)} fill={C.tower} />
        })}
        {NPCS.map((n) => {
          const m = toMap(n.position[0], n.position[2])
          return (
            <circle key={n.id} cx={m.x} cy={m.y} r={2.4} fill={C.npc} stroke={C.outline} strokeWidth={0.6}>
              <title>{DIALOGUES[n.id]?.name ?? n.id}</title>
            </circle>
          )
        })}
      </g>

      {/* Quest markers: drawn outside the clip so off-map ones sit on the rim. */}
      {entries.map((e) => {
        if (!e.at) return null
        const m = pinned(e.at[0], e.at[1], 6)
        const isTracked = e.id === tracked && questStatus(progression, e.id) === 'active'
        const r = isTracked ? 5 : e.status === 'active' ? 4 : 3.2
        return (
          <g key={e.id} transform={`translate(${m.x} ${m.y})`} opacity={m.edge ? 0.85 : 1}>
            {isTracked && <circle r={r + 3} fill="none" stroke={C.activeQuest} strokeWidth={1} opacity={0.7} />}
            <circle r={r} fill={e.status === 'active' ? C.activeQuest : C.availableQuest} stroke={C.outline} strokeWidth={0.8} />
            <title>{`${e.title}: ${e.label}`}</title>
          </g>
        )
      })}

      {/* Player at the centre, rotated by facing (0 = -Z = up). */}
      <g transform={`translate(${R} ${R}) rotate(${(facing * 180) / Math.PI})`}>
        <polygon points="0,-7 5,5 0,2.5 -5,5" fill={C.player} stroke={C.outline} strokeWidth={0.8} />
      </g>

      <circle cx={R} cy={R} r={R - 1} fill="none" stroke="var(--gold-dim)" strokeWidth={2} />
      <text x={R} y={13} textAnchor="middle" className="minimap-north">
        N
      </text>
    </svg>
  )
}
