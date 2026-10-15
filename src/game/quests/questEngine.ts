import type { FlightState } from '../core/types'
import { STARTING_SPELLS } from '../spells/registry'
import { getQuest, QUESTS, type ObjectiveDef, type QuestDef } from './questData'

export type QuestStatus = 'active' | 'completed'

export interface QuestProgress {
  status: QuestStatus
  /** Index of the current objective. Equals objectives.length when completed. */
  stage: number
  /** Count towards the current objective (for counted objectives). */
  count: number
}

export interface Checkpoint {
  position: [number, number, number]
  yaw: number
  label: string
}

export interface Progression {
  xp: number
  quests: Record<string, QuestProgress>
  unlockedSpells: string[]
  artifacts: string[]
  secretsFound: string[]
  runesRevealed: string[]
  /** Ring indices collected in the current course run. */
  ringsCollected: number[]
  /** True once the player has picked up a broom and may summon it for flight. */
  hasBroom: boolean
  /** Ids of brooms the player has collected. */
  broomsCollected: string[]
  checkpoint: Checkpoint | null
  playTimeSeconds: number
}

/** Gameplay facts the quest engine reacts to. Objectives only advance on matching facts. */
export type QuestEvent =
  | { type: 'talk'; npcId: string }
  | { type: 'spellHit'; spellId: string; targetKind: string }
  | { type: 'collect'; itemId: string }
  | { type: 'flightState'; state: FlightState }
  | { type: 'ring'; ringIndex: number }
  | { type: 'reach'; locationId: string }

export interface QuestUpdate {
  progression: Progression
  advanced: Array<{ questId: string; objective: ObjectiveDef }>
  completed: QuestDef[]
}

export const createProgression = (): Progression => ({
  xp: 0,
  quests: {},
  unlockedSpells: [...STARTING_SPELLS],
  artifacts: [],
  secretsFound: [],
  runesRevealed: [],
  ringsCollected: [],
  hasBroom: false,
  broomsCollected: [],
  checkpoint: null,
  playTimeSeconds: 0,
})

export function objectiveTarget(o: ObjectiveDef): number {
  if (o.kind === 'spellHit' || o.kind === 'rings') return o.count
  return 1
}

function matches(o: ObjectiveDef, e: QuestEvent): boolean {
  switch (o.kind) {
    case 'talk':
      return e.type === 'talk' && e.npcId === o.npcId
    case 'spellHit':
      return e.type === 'spellHit' && e.spellId === o.spellId && e.targetKind === o.targetKind
    case 'collect':
      return e.type === 'collect' && e.itemId === o.itemId
    case 'flightState':
      return e.type === 'flightState' && e.state === o.state
    case 'rings':
      return e.type === 'ring'
    case 'reach':
      return e.type === 'reach' && e.locationId === o.locationId
  }
}

function grantReward(p: Progression, q: QuestDef): Progression {
  const spells = new Set(p.unlockedSpells)
  q.reward.unlockSpells?.forEach((s) => spells.add(s))
  const artifacts = new Set(p.artifacts)
  q.reward.artifacts?.forEach((a) => artifacts.add(a))
  return { ...p, xp: p.xp + q.reward.xp, unlockedSpells: [...spells], artifacts: [...artifacts] }
}

/** Advance every active quest whose *current* objective matches the event. */
export function applyQuestEvent(p: Progression, e: QuestEvent): QuestUpdate {
  let progression = p
  const advanced: QuestUpdate['advanced'] = []
  const completed: QuestDef[] = []

  for (const [questId, qp] of Object.entries(p.quests)) {
    if (qp.status !== 'active') continue
    const def = getQuest(questId)
    if (!def) continue
    const objective = def.objectives[qp.stage]
    if (!objective || !matches(objective, e)) continue

    const count = qp.count + 1
    let next: QuestProgress
    if (count >= objectiveTarget(objective)) {
      const stage = qp.stage + 1
      const done = stage >= def.objectives.length
      next = { status: done ? 'completed' : 'active', stage, count: 0 }
      advanced.push({ questId, objective })
      if (done) completed.push(def)
    } else {
      next = { ...qp, count }
    }
    progression = { ...progression, quests: { ...progression.quests, [questId]: next } }
  }

  for (const q of completed) progression = grantReward(progression, q)
  return { progression, advanced, completed }
}

/** Accept a quest from its giver; the opening "speak to" objective is satisfied immediately. */
export function startQuest(p: Progression, questId: string): QuestUpdate {
  const def = getQuest(questId)
  if (!def || p.quests[questId]) return { progression: p, advanced: [], completed: [] }
  const started: Progression = { ...p, quests: { ...p.quests, [questId]: { status: 'active', stage: 0, count: 0 } } }
  // Ring course restarts for the flight quest so earlier laps do not count.
  const reset = questId === 'flight-initiation' ? { ...started, ringsCollected: [] } : started
  const first = def.objectives[0]
  if (first?.kind === 'talk' && first.npcId === def.giver) {
    // Only advance this quest, not other quests that might also wait on talking to the giver.
    const only = applyQuestEvent({ ...reset, quests: { [questId]: reset.quests[questId] } }, { type: 'talk', npcId: def.giver })
    return {
      progression: { ...only.progression, quests: { ...reset.quests, ...only.progression.quests } },
      advanced: only.advanced,
      completed: only.completed,
    }
  }
  return { progression: reset, advanced: [], completed: [] }
}

export type QuestAvailability = 'available' | 'active' | 'completed'

export const questStatus = (p: Progression, questId: string): QuestAvailability => {
  const qp = p.quests[questId]
  if (!qp) return 'available'
  return qp.status
}

export function currentObjective(p: Progression, questId: string): ObjectiveDef | null {
  const qp = p.quests[questId]
  const def = getQuest(questId)
  if (!qp || !def || qp.status !== 'active') return null
  return def.objectives[qp.stage] ?? null
}

/** True when the active objective of a quest is to talk to this NPC (used by dialogue to offer a turn-in). */
export function awaitsTalk(p: Progression, questId: string, npcId: string): boolean {
  const o = currentObjective(p, questId)
  return o?.kind === 'talk' && o.npcId === npcId
}

export const activeQuests = (p: Progression) => QUESTS.filter((q) => p.quests[q.id]?.status === 'active')
export const completedQuests = (p: Progression) => QUESTS.filter((q) => p.quests[q.id]?.status === 'completed')
