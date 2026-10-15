import { describe, expect, it } from 'vitest'
import { compassObjective, questMarkers } from './questMap'
import { createProgression, startQuest, type Progression } from './questEngine'
import { QUESTS } from './questData'
import { NPCS } from '../npc/NPCs'
import { CODEX_POSITION, FLIGHT_PLATFORM, TRAINING_YARD } from '../world/layout'

const giverXZ = (giver: string): [number, number] => {
  const n = NPCS.find((npc) => npc.id === giver)!
  return [n.position[0], n.position[2]]
}

/** Advance an active quest to the objective of the given kind. */
function toObjective(questId: string, kind: string): Progression {
  let p = startQuest(createProgression(), questId).progression
  const def = QUESTS.find((q) => q.id === questId)!
  // Walk the stage pointer forward to the first objective of the requested kind.
  while (true) {
    const qp = p.quests[questId]
    const o = def.objectives[qp.stage]
    if (!o || o.kind === kind) break
    p = { ...p, quests: { ...p.quests, [questId]: { ...qp, stage: qp.stage + 1 } } }
  }
  return p
}

describe('questMarkers', () => {
  it('places an available quest at its giver NPC', () => {
    const p = createProgression()
    const markers = questMarkers(p)
    // Quests with prerequisites are covered in followUpQuests.test.ts.
    for (const q of QUESTS.filter((quest) => !quest.requires)) {
      const m = markers.find((mk) => mk.id === q.id)
      expect(m).toBeDefined()
      expect(m!.status).toBe('available')
      expect(m!.at).toEqual(giverXZ(q.giver))
    }
  })

  it('resolves each active objective kind to its documented location', () => {
    // talk -> target NPC (first-spark opens on a talk-mentor objective after accepting? the
    // opening talk is auto-satisfied, so force a talk objective via lost-archive return step).
    const talk = toObjective('lost-archive', 'talk')
    expect(questMarkers(talk).find((m) => m.id === 'lost-archive')!.at).toEqual(giverXZ('librarian'))

    const spell = toObjective('first-spark', 'spellHit')
    expect(questMarkers(spell).find((m) => m.id === 'first-spark')!.at).toEqual([
      (TRAINING_YARD.minX + TRAINING_YARD.maxX) / 2,
      (TRAINING_YARD.minZ + TRAINING_YARD.maxZ) / 2,
    ])

    const collect = toObjective('lost-archive', 'collect')
    expect(questMarkers(collect).find((m) => m.id === 'lost-archive')!.at).toEqual([CODEX_POSITION[0], CODEX_POSITION[2]])

    const flight = toObjective('flight-initiation', 'flightState')
    expect(questMarkers(flight).find((m) => m.id === 'flight-initiation')!.at).toEqual([
      FLIGHT_PLATFORM.center[0],
      FLIGHT_PLATFORM.center[1],
    ])

    const reach = toObjective('flight-initiation', 'reach')
    expect(questMarkers(reach).find((m) => m.id === 'flight-initiation')!.at).toEqual([
      FLIGHT_PLATFORM.center[0],
      FLIGHT_PLATFORM.center[1],
    ])
  })

  it('omits completed quests', () => {
    // Fast-forward first-spark past its last objective.
    let p = startQuest(createProgression(), 'first-spark').progression
    p = { ...p, quests: { ...p.quests, 'first-spark': { status: 'completed', stage: 3, count: 0 } } }
    expect(questMarkers(p).find((m) => m.id === 'first-spark')).toBeUndefined()
  })
})

describe('compassObjective', () => {
  it('points to Magister Vale while first-spark is available', () => {
    const obj = compassObjective(createProgression())
    expect(obj).toEqual({ label: 'Magister Vale', at: giverXZ('mentor') })
  })

  it('keeps the unchanged kinds and corrects collect to CODEX_POSITION', () => {
    const spell = toObjective('first-spark', 'spellHit')
    expect(compassObjective(spell)).toEqual({
      label: 'Targets',
      at: [(TRAINING_YARD.minX + TRAINING_YARD.maxX) / 2, (TRAINING_YARD.minZ + TRAINING_YARD.maxZ) / 2],
    })

    const collect = toObjective('lost-archive', 'collect')
    expect(compassObjective(collect)).toEqual({ label: 'Codex', at: [CODEX_POSITION[0], CODEX_POSITION[2]] })
  })

  it('yields null for an active flightState objective (compass has no world point for it)', () => {
    const flight = toObjective('flight-initiation', 'flightState')
    expect(compassObjective(flight)).toBeNull()
  })
})
