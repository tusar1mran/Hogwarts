import { describe, expect, it } from 'vitest'
import { applyQuestEvent, awaitsTalk, createProgression, currentObjective, startQuest, type Progression, type QuestEvent } from './questEngine'
import { parseSave, sanitizeProgression, serializeSave, SAVE_VERSION } from './saveSystem'

const apply = (p: Progression, ...events: QuestEvent[]) => events.reduce((acc, e) => applyQuestEvent(acc, e).progression, p)
const hit = (spellId = 'arc-bolt', targetKind = 'practice-target'): QuestEvent => ({ type: 'spellHit', spellId, targetKind })

describe('quest progression', () => {
  it('does nothing for quests that have not been started', () => {
    const p = apply(createProgression(), hit(), hit(), hit(), { type: 'talk', npcId: 'mentor' })
    expect(p.quests['first-spark']).toBeUndefined()
    expect(p.xp).toBe(0)
  })

  it('accepting a quest satisfies the "speak to" objective', () => {
    const { progression } = startQuest(createProgression(), 'first-spark')
    expect(progression.quests['first-spark']).toEqual({ status: 'active', stage: 1, count: 0 })
    expect(currentObjective(progression, 'first-spark')?.id).toBe('hit-targets')
  })

  it('First Spark: counts only Arc Bolt hits on practice targets', () => {
    let p = startQuest(createProgression(), 'first-spark').progression
    p = apply(p, hit('force-wave'), hit('arc-bolt', 'crate'), hit())
    expect(p.quests['first-spark'].count).toBe(1)
    p = apply(p, hit(), hit())
    expect(currentObjective(p, 'first-spark')?.id).toBe('return-mentor')
    expect(awaitsTalk(p, 'first-spark', 'mentor')).toBe(true)
  })

  it('First Spark: returning to the mentor completes it and grants rewards once', () => {
    let p = startQuest(createProgression(), 'first-spark').progression
    p = apply(p, hit(), hit(), hit())
    const done = applyQuestEvent(p, { type: 'talk', npcId: 'mentor' })
    expect(done.completed.map((q) => q.id)).toEqual(['first-spark'])
    expect(done.progression.quests['first-spark'].status).toBe('completed')
    expect(done.progression.xp).toBe(150)
    expect(done.progression.unlockedSpells).toEqual(expect.arrayContaining(['luminous-orb', 'mystic-pull']))
    const again = apply(done.progression, { type: 'talk', npcId: 'mentor' }, hit())
    expect(again.xp).toBe(150)
  })

  it('The Lost Archive: requires the codex before the librarian accepts the return', () => {
    let p = startQuest(createProgression(), 'lost-archive').progression
    p = apply(p, { type: 'talk', npcId: 'librarian' })
    expect(currentObjective(p, 'lost-archive')?.id).toBe('find-codex')
    p = apply(p, { type: 'collect', itemId: 'astral-codex' }, { type: 'talk', npcId: 'librarian' })
    expect(p.quests['lost-archive'].status).toBe('completed')
    expect(p.unlockedSpells).toContain('blink-step')
    expect(p.artifacts).toContain('cartographers-lens')
  })

  it('Flight Initiation: summon, five rings, then land on the platform', () => {
    let p = startQuest(createProgression(), 'flight-initiation').progression
    p = apply(p, { type: 'reach', locationId: 'flight-platform' })
    expect(currentObjective(p, 'flight-initiation')?.id).toBe('summon-broom')
    p = apply(p, { type: 'flightState', state: 'Summoning' })
    p = apply(p, ...[0, 1, 2, 3].map((i) => ({ type: 'ring', ringIndex: i }) as QuestEvent))
    expect(currentObjective(p, 'flight-initiation')?.id).toBe('fly-rings')
    p = apply(p, { type: 'ring', ringIndex: 4 }, { type: 'reach', locationId: 'flight-platform' })
    expect(p.quests['flight-initiation'].status).toBe('completed')
    expect(p.artifacts).toContain('skyward-pin')
  })

  it('starting the flight quest resets the ring course', () => {
    const p = { ...createProgression(), ringsCollected: [0, 1, 2] }
    expect(startQuest(p, 'flight-initiation').progression.ringsCollected).toEqual([])
  })

  it('cannot start the same quest twice', () => {
    const once = startQuest(createProgression(), 'first-spark').progression
    expect(startQuest(once, 'first-spark').progression).toBe(once)
  })
})

describe('save and load', () => {
  it('round-trips progression through the versioned format', () => {
    let p = startQuest(createProgression(), 'first-spark').progression
    p = { ...apply(p, hit()), secretsFound: ['library-nook'], checkpoint: { position: [1, 2, 3], yaw: 0.5, label: 'Courtyard' } }
    const text = serializeSave(p)
    expect(JSON.parse(text).version).toBe(SAVE_VERSION)
    const res = parseSave(text)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.progression).toEqual(p)
  })

  it('reports missing and corrupt data without throwing', () => {
    expect(parseSave(null)).toEqual({ ok: false, reason: 'missing' })
    expect(parseSave('{not json').ok).toBe(false)
    expect(parseSave('[]').ok).toBe(false)
    expect(parseSave(JSON.stringify({ version: 2, progression: 'nope' })).ok).toBe(false)
  })

  it('refuses saves from a newer version', () => {
    const res = parseSave(JSON.stringify({ version: 99, progression: {} }))
    expect(res).toMatchObject({ ok: false, reason: 'unsupported' })
  })

  it('migrates the v1 prototype format', () => {
    const res = parseSave(JSON.stringify({ version: 1, xp: 300, completed: ['first-spark'], spells: ['luminous-orb'] }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.migratedFrom).toBe(1)
      expect(res.progression.xp).toBe(300)
      expect(res.progression.quests['first-spark'].status).toBe('completed')
      expect(res.progression.unlockedSpells).toEqual(expect.arrayContaining(['arc-bolt', 'luminous-orb']))
    }
  })

  it('drops unknown ids and clamps invalid values but keeps valid data', () => {
    const warnings: string[] = []
    const p = sanitizeProgression(
      {
        xp: -50,
        quests: { 'first-spark': { status: 'active', stage: 99, count: 1 }, 'made-up': { status: 'active', stage: 0 } },
        unlockedSpells: ['arc-bolt', 'death-ray'],
        artifacts: ['astral-codex', 42, 'fake'],
        checkpoint: { position: [1, 'x', 3] },
        ringsCollected: [0, 0.5, 99, 3],
      },
      warnings,
    )
    expect(p).not.toBeNull()
    expect(p!.xp).toBe(0)
    expect(p!.quests['first-spark'].stage).toBe(2)
    expect(p!.quests['made-up']).toBeUndefined()
    expect(p!.unlockedSpells).toEqual(expect.arrayContaining(['arc-bolt', 'force-wave', 'aegis-shield']))
    expect(p!.unlockedSpells).not.toContain('death-ray')
    expect(p!.artifacts).toEqual(['astral-codex'])
    expect(p!.checkpoint).toBeNull()
    expect(p!.ringsCollected).toEqual([0, 3])
    expect(warnings.length).toBeGreaterThan(0)
  })
})
