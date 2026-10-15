import { CODEX_POSITION, FLIGHT_PLATFORM, FLIGHT_RINGS, RUNES, SECRETS, SENTINEL_POSITION, TRAINING_YARD } from '../world/layout'
import { NPCS } from '../npc/NPCs'
import { getQuest, QUESTS, type ObjectiveDef } from './questData'
import { activeQuests, currentObjective, objectiveTarget, questStatus, questUnlocked, type Progression } from './questEngine'

export type MarkerStatus = 'active' | 'available'

export interface QuestMarker {
  id: string
  label: string
  /** World [x, z] the marker points to. */
  at: [number, number]
  status: MarkerStatus
}

const npcXZ = (id: string): [number, number] | null => {
  const n = NPCS.find((npc) => npc.id === id)
  return n ? [n.position[0], n.position[2]] : null
}

const secretXZ = (id: string): [number, number] | null => {
  const s = SECRETS.find((sec) => sec.id === id)
  return s ? [s.position[0], s.position[2]] : null
}

/** Where each collectable quest item lies. */
const ITEM_XZ: Record<string, [number, number] | null> = {
  'astral-codex': [CODEX_POSITION[0], CODEX_POSITION[2]],
  // The ember floats over the Glimmerwood shrine.
  'shrine-ember': secretXZ('glimmer-shrine'),
}

/**
 * Resolves the world [x, z] an active objective points to.
 *
 * `forCompass` keeps the HUD compass's historical behaviour: an active `flightState`
 * objective has no on-world location on the compass (returns null), whereas the world map
 * sends it to the Skyward Platform centre.
 */
export function objectiveLocation(o: ObjectiveDef, p: Progression, forCompass: boolean): [number, number] | null {
  switch (o.kind) {
    case 'talk':
      return npcXZ(o.npcId)
    case 'spellHit':
      return [(TRAINING_YARD.minX + TRAINING_YARD.maxX) / 2, (TRAINING_YARD.minZ + TRAINING_YARD.maxZ) / 2]
    case 'collect':
      return ITEM_XZ[o.itemId] ?? null
    case 'discover':
      return secretXZ(o.secretId)
    case 'flightState':
      return forCompass ? null : [FLIGHT_PLATFORM.center[0], FLIGHT_PLATFORM.center[1]]
    case 'rings': {
      const i = FLIGHT_RINGS.findIndex((_, idx) => !p.ringsCollected.includes(idx))
      return i >= 0 ? [FLIGHT_RINGS[i][0], FLIGHT_RINGS[i][2]] : null
    }
    case 'reach':
      return [FLIGHT_PLATFORM.center[0], FLIGHT_PLATFORM.center[1]]
    case 'defeat':
      return [SENTINEL_POSITION[0], SENTINEL_POSITION[2]]
    case 'tally': {
      // Secrets stay hidden (the Cartographer's Lens marks them); runes point to the next one.
      if (o.source === 'secrets') return null
      const rune = RUNES.find((r) => !p.runesRevealed.includes(r.id))
      return rune ? [rune.position[0], rune.position[2]] : null
    }
  }
}

/** Short label for an objective kind, used on the map markers. */
function objectiveLabel(o: ObjectiveDef): string {
  switch (o.kind) {
    case 'talk':
      return 'Talk'
    case 'spellHit':
      return 'Targets'
    case 'collect':
      return o.itemId === 'astral-codex' ? 'Codex' : 'Item'
    case 'discover':
      return SECRETS.find((s) => s.id === o.secretId)?.name ?? 'Explore'
    case 'flightState':
      return 'Broom'
    case 'rings':
      return 'Ring'
    case 'reach':
      return 'Platform'
    case 'defeat':
      return 'Sentinel'
    case 'tally':
      return o.source === 'runes' ? 'Rune' : 'Secrets'
  }
}

/**
 * Quest markers for the world map: available quests sit at their giver NPC; active quests
 * sit at their current objective location; completed quests are omitted.
 */
export function questMarkers(p: Progression): QuestMarker[] {
  const out: QuestMarker[] = []
  for (const q of QUESTS) {
    const status = questStatus(p, q.id)
    if (status === 'completed') continue
    if (status === 'available') {
      if (!questUnlocked(p, q.id)) continue
      const at = npcXZ(q.giver)
      if (at) out.push({ id: q.id, label: q.title, at, status: 'available' })
      continue
    }
    const o = currentObjective(p, q.id)
    if (!o) continue
    const at = objectiveLocation(o, p, false)
    if (at) out.push({ id: q.id, label: objectiveLabel(o), at, status: 'active' })
  }
  return out
}

export interface QuestEntry {
  id: string
  title: string
  status: MarkerStatus
  /** Current objective for active quests; where to start for available ones. */
  objective: string
  /** e.g. "2/3" for counted objectives, otherwise null. */
  progress: string | null
  /** Where the map/compass should point, or null when the objective has no fixed place. */
  at: [number, number] | null
  /** Short marker label. */
  label: string
}

/** Active quests first, then quests that can be accepted now (locked and completed ones are left out). */
export function questEntries(p: Progression): QuestEntry[] {
  const active: QuestEntry[] = []
  const available: QuestEntry[] = []
  for (const q of QUESTS) {
    const status = questStatus(p, q.id)
    if (status === 'active') {
      const o = currentObjective(p, q.id)
      if (!o) continue
      const target = objectiveTarget(o)
      active.push({
        id: q.id,
        title: q.title,
        status: 'active',
        objective: o.text,
        progress: target > 1 ? `${p.quests[q.id]?.count ?? 0}/${target}` : null,
        at: objectiveLocation(o, p, false),
        label: objectiveLabel(o),
      })
    } else if (status === 'available' && questUnlocked(p, q.id)) {
      const first = q.objectives[0]
      available.push({
        id: q.id,
        title: q.title,
        status: 'available',
        objective: first?.kind === 'talk' ? first.text : q.summary,
        progress: null,
        at: npcXZ(q.giver),
        label: q.title,
      })
    }
  }
  return [...active, ...available]
}

/**
 * The single objective the compass highlights: the tracked quest when it is active, otherwise
 * the first active quest, or the opening quest.
 */
export function compassObjective(p: Progression, trackedId: string | null = null): { label: string; at: [number, number] } | null {
  const tracked = trackedId && questStatus(p, trackedId) === 'active' ? getQuest(trackedId) : undefined
  const q = tracked ?? activeQuests(p)[0]
  if (!q) {
    if (questStatus(p, 'first-spark') === 'available') {
      const at = npcXZ(NPCS[0].id)
      return at ? { label: 'Magister Vale', at } : null
    }
    return null
  }
  const o = currentObjective(p, q.id)
  if (!o) return null
  const at = objectiveLocation(o, p, true)
  return at ? { label: objectiveLabel(o), at } : null
}
