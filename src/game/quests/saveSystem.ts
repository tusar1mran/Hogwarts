import { SPELL_IDS, STARTING_SPELLS } from '../spells/registry'
import { ARTIFACTS, QUESTS } from './questData'
import { createProgression, type Checkpoint, type Progression, type QuestProgress } from './questEngine'
import { SECRETS, FLIGHT_RINGS, BROOM_PICKUPS } from '../world/layout'

/**
 * Versioned local save format.
 *   v1 (pre-release prototype): { version: 1, xp, completed: string[], spells: string[] }
 *   v2:                         { version: 2, savedAt, progression }
 *   v3 (current):               v2 shape with Progression.hasBroom + broomsCollected
 */
export const SAVE_VERSION = 3
export const SAVE_KEY = 'eldoria.save'

export interface SaveFileV3 {
  version: 3
  savedAt: string
  progression: Progression
}

export type LoadResult =
  | { ok: true; progression: Progression; migratedFrom?: number; warnings: string[] }
  | { ok: false; reason: 'missing' | 'corrupt' | 'unsupported'; detail?: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])


const ARTIFACT_IDS = new Set(ARTIFACTS.map((a) => a.id))
const SECRET_IDS = new Set(SECRETS.map((s) => s.id))
const RUNE_IDS = new Set(['rune-library', 'rune-shrine'])
const BROOM_PICKUP_IDS = new Set(BROOM_PICKUPS.map((b) => b.id))

/**
 * Validate an untrusted progression object. Unknown ids are dropped and out-of-range values
 * clamped, so a partially damaged save still restores everything that is valid.
 */
export function sanitizeProgression(raw: unknown, warnings: string[] = []): Progression | null {
  if (!isObj(raw)) return null
  const base = createProgression()

  const quests: Record<string, QuestProgress> = {}
  if (isObj(raw.quests)) {
    for (const [id, qp] of Object.entries(raw.quests)) {
      const def = QUESTS.find((q) => q.id === id)
      if (!def || !isObj(qp)) {
        warnings.push(`Ignored unknown quest "${id}"`)
        continue
      }
      const status = qp.status === 'completed' ? 'completed' : qp.status === 'active' ? 'active' : null
      if (!status) {
        warnings.push(`Ignored quest "${id}" with invalid status`)
        continue
      }
      const stage = status === 'completed' ? def.objectives.length : Math.round(finite(qp.stage, 0, 0, def.objectives.length - 1))
      quests[id] = { status, stage, count: Math.round(finite(qp.count, 0, 0, 99)) }
    }
  }

  const spells = new Set(strings(raw.unlockedSpells).filter((s) => SPELL_IDS.includes(s)))
  STARTING_SPELLS.forEach((s) => spells.add(s))

  let checkpoint: Checkpoint | null = null
  if (isObj(raw.checkpoint) && Array.isArray(raw.checkpoint.position) && raw.checkpoint.position.length === 3) {
    const [x, y, z] = raw.checkpoint.position.map((n) => finite(n, NaN, -600, 600))
    if ([x, y, z].every(Number.isFinite)) {
      checkpoint = {
        position: [x, y, z],
        yaw: finite(raw.checkpoint.yaw, 0),
        label: typeof raw.checkpoint.label === 'string' ? raw.checkpoint.label.slice(0, 60) : 'Checkpoint',
      }
    }
  }

  return {
    ...base,
    xp: Math.round(finite(raw.xp, 0, 0, 1_000_000)),
    quests,
    unlockedSpells: SPELL_IDS.filter((s) => spells.has(s)),
    artifacts: strings(raw.artifacts).filter((a) => ARTIFACT_IDS.has(a)),
    secretsFound: strings(raw.secretsFound).filter((s) => SECRET_IDS.has(s)),
    runesRevealed: strings(raw.runesRevealed).filter((r) => RUNE_IDS.has(r)),
    ringsCollected: (Array.isArray(raw.ringsCollected) ? raw.ringsCollected : []).filter(
      (n): n is number => Number.isInteger(n) && n >= 0 && n < FLIGHT_RINGS.length,
    ),
    checkpoint,
    playTimeSeconds: finite(raw.playTimeSeconds, 0, 0, 1e9),
    hasBroom: typeof raw.hasBroom === 'boolean' ? raw.hasBroom : false,
    broomsCollected: strings(raw.broomsCollected).filter((id) => BROOM_PICKUP_IDS.has(id)),
  }
}

function migrateV1(raw: Record<string, unknown>): unknown {
  const quests: Record<string, QuestProgress> = {}
  for (const id of strings(raw.completed)) {
    const def = QUESTS.find((q) => q.id === id)
    if (def) quests[id] = { status: 'completed', stage: def.objectives.length, count: 0 }
  }
  return { xp: raw.xp, quests, unlockedSpells: raw.spells }
}

/** Parse a save string. Never throws. */
export function parseSave(text: string | null | undefined): LoadResult {
  if (!text) return { ok: false, reason: 'missing' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, reason: 'corrupt', detail: String(err) }
  }
  if (!isObj(raw) || typeof raw.version !== 'number') return { ok: false, reason: 'corrupt', detail: 'Missing version' }
  const warnings: string[] = []
  if (raw.version === 1) {
    const progression = sanitizeProgression(migrateV1(raw), warnings)
    return progression ? { ok: true, progression, migratedFrom: 1, warnings } : { ok: false, reason: 'corrupt' }
  }
  if (raw.version === 2 || raw.version === SAVE_VERSION) {
    const progression = sanitizeProgression(raw.progression, warnings)
    const migratedFrom = raw.version === SAVE_VERSION ? undefined : 2
    return progression ? { ok: true, progression, migratedFrom, warnings } : { ok: false, reason: 'corrupt', detail: 'Invalid progression' }
  }
  return { ok: false, reason: 'unsupported', detail: `Save version ${raw.version} is newer than this build supports` }
}

export function serializeSave(progression: Progression, now = new Date()): string {
  const file: SaveFileV3 = { version: SAVE_VERSION, savedAt: now.toISOString(), progression }
  return JSON.stringify(file)
}

export function readSave(): LoadResult {
  try {
    return parseSave(globalThis.localStorage?.getItem(SAVE_KEY))
  } catch (err) {
    return { ok: false, reason: 'corrupt', detail: String(err) }
  }
}

export function writeSave(progression: Progression): boolean {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, serializeSave(progression))
    return true
  } catch (err) {
    console.warn('[save] could not write save data', err)
    return false
  }
}

export function deleteSave() {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

/** True when a usable save exists (drives the Continue button). */
export const hasValidSave = () => readSave().ok


