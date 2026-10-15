import { describe, expect, it } from 'vitest'
import { applyQuestEvent, canAcceptQuest, createProgression, currentObjective, ringCourseInUse, startQuest, type Progression, type QuestEvent } from './questEngine'
import { artifactBonuses, describeBonus, getQuest, QUESTS } from './questData'
import { compassObjective, questEntries, questMarkers } from './questMap'
import { FLIGHT_RINGS, SENTINEL_POSITION } from '../world/layout'
import { DIALOGUES } from '../npc/dialogueData'
import { createCaster, withBonuses } from '../spells/spellSystem'

const apply = (p: Progression, ...events: QuestEvent[]) => events.reduce((acc, e) => applyQuestEvent(acc, e).progression, p)
const completed = (p: Progression, ...ids: string[]): Progression => ({
  ...p,
  quests: { ...p.quests, ...Object.fromEntries(ids.map((id) => [id, { status: 'completed' as const, stage: getQuest(id)!.objectives.length, count: 0 }])) },
})

describe('follow-up quests', () => {
  it('cannot be accepted before their prerequisite is complete', () => {
    const p = createProgression()
    expect(canAcceptQuest(p, 'warden-of-the-yard')).toBe(false)
    expect(startQuest(p, 'warden-of-the-yard').progression).toBe(p)
    expect(canAcceptQuest(completed(p, 'first-spark'), 'warden-of-the-yard')).toBe(true)
  })

  it('Warden of the Yard: subduing the sentinel then returning grants the Warden’s Sigil', () => {
    let p = startQuest(completed(createProgression(), 'first-spark'), 'warden-of-the-yard').progression
    expect(currentObjective(p, 'warden-of-the-yard')?.id).toBe('subdue-sentinel')
    p = apply(p, { type: 'defeat', targetKind: 'crate' })
    expect(currentObjective(p, 'warden-of-the-yard')?.id).toBe('subdue-sentinel')
    p = apply(p, { type: 'defeat', targetKind: 'sentinel' }, { type: 'talk', npcId: 'mentor' })
    expect(p.quests['warden-of-the-yard'].status).toBe('completed')
    expect(p.artifacts).toContain('warden-sigil')
    expect(p.xp).toBe(250)
  })

  it('Lights in the Dark: runes revealed before accepting still count', () => {
    const before = { ...completed(createProgression(), 'first-spark'), runesRevealed: ['rune-library'] }
    let p = startQuest(before, 'lights-in-the-dark').progression
    expect(p.quests['lights-in-the-dark']).toEqual({ status: 'active', stage: 1, count: 1 })
    p = apply({ ...p, runesRevealed: ['rune-library', 'rune-shrine'] }, { type: 'rune', runeId: 'rune-shrine' })
    expect(currentObjective(p, 'lights-in-the-dark')?.id).toBe('return-student')
    p = apply(p, { type: 'talk', npcId: 'student' })
    expect(p.artifacts).toContain('runeglass-charm')
  })

  it('Secrets of Eldoria: skips straight to the report when three places are already found', () => {
    const before = { ...completed(createProgression(), 'lost-archive'), secretsFound: ['library-nook', 'astronomy-summit', 'glimmer-shrine'] }
    const { progression, advanced } = startQuest(before, 'secrets-of-eldoria')
    expect(advanced.map((a) => a.objective.id)).toEqual(['talk-librarian', 'find-secrets'])
    expect(currentObjective(progression, 'secrets-of-eldoria')?.id).toBe('return-librarian')
  })

  it('The Skyward Gauntlet: needs every ring, resets the course and holds it while active', () => {
    expect(getQuest('skyward-gauntlet')!.objectives.find((o) => o.kind === 'rings')).toMatchObject({ count: FLIGHT_RINGS.length })
    const before = { ...completed(createProgression(), 'flight-initiation'), ringsCollected: [0, 1, 2] }
    let p = startQuest(before, 'skyward-gauntlet').progression
    expect(p.ringsCollected).toEqual([])
    expect(ringCourseInUse(p)).toBe(true)
    p = apply(p, ...FLIGHT_RINGS.map((_, i): QuestEvent => ({ type: 'ring', ringIndex: i })), { type: 'reach', locationId: 'flight-platform' })
    expect(p.quests['skyward-gauntlet'].status).toBe('completed')
    expect(ringCourseInUse(p)).toBe(false)
  })

  it('every quest giver has dialogue that can offer each of their quests', () => {
    for (const q of QUESTS) {
      const d = DIALOGUES[q.giver]
      const offers = Object.values(d.nodes).some((n) => n.choices?.some((c) => c.action?.type === 'acceptQuest' && c.action.questId === q.id))
      expect(offers, q.id).toBe(true)
    }
  })

  it('follow-up quests show on the map only once unlocked, and the sentinel objective points at it', () => {
    expect(questMarkers(createProgression()).map((m) => m.id)).not.toContain('warden-of-the-yard')
    const p = startQuest(completed(createProgression(), 'first-spark'), 'warden-of-the-yard').progression
    expect(questMarkers(p).find((m) => m.id === 'warden-of-the-yard')?.at).toEqual([SENTINEL_POSITION[0], SENTINEL_POSITION[2]])
  })
})

describe('artefact rewards', () => {
  it('sum bonuses and ignore artefacts without one', () => {
    expect(artifactBonuses(['warden-sigil', 'starlit-mantle', 'skyward-pin', 'nope'])).toEqual({ maxMana: 50, regen: 3 })
    expect(describeBonus({ maxMana: 20, regen: 3 })).toBe('+20 max mana, +3 mana/s')
  })

  it('raise the caster’s pool and top up mana by the increase', () => {
    const base = { ...createCaster(), mana: 40 }
    const boosted = withBonuses(base, { maxMana: 30, regen: 5 })
    expect(boosted).toMatchObject({ maxMana: 130, regen: 19, mana: 70 })
    expect(withBonuses(boosted, { maxMana: 30, regen: 5 })).toBe(boosted)
    expect(withBonuses({ ...boosted, mana: 130 }, { maxMana: 0, regen: 0 }).mana).toBe(100)
  })
})

describe('groundskeeper chain', () => {
  const base = () => completed(createProgression(), 'first-spark')

  it('The Drowned Chapel: finding the chapel then reporting back grants the Chapel Bell', () => {
    let p = startQuest(base(), 'drowned-chapel').progression
    expect(currentObjective(p, 'drowned-chapel')?.id).toBe('find-chapel')
    p = apply({ ...p, secretsFound: ['mirrormere-ruin'] }, { type: 'secret', secretId: 'mirrormere-ruin' })
    expect(currentObjective(p, 'drowned-chapel')?.id).toBe('return-groundskeeper')
    p = apply(p, { type: 'talk', npcId: 'groundskeeper' })
    expect(p.artifacts).toContain('chapel-bell')
  })

  it('Embers of the Glimmerwood: an ember taken before accepting still counts', () => {
    const before = { ...completed(base(), 'drowned-chapel'), artifacts: ['shrine-ember'] }
    const p = startQuest(before, 'glimmerwood-embers').progression
    expect(currentObjective(p, 'glimmerwood-embers')?.id).toBe('return-groundskeeper')
  })

  it('Beacons of Eldoria: needs the flying licence, then perch, landing and report in order', () => {
    const ready = completed(base(), 'drowned-chapel', 'glimmerwood-embers')
    expect(canAcceptQuest(ready, 'beacons-of-eldoria')).toBe(false)
    let p = startQuest(completed(ready, 'flight-initiation'), 'beacons-of-eldoria').progression
    p = apply(p, { type: 'reach', locationId: 'flight-platform' })
    expect(currentObjective(p, 'beacons-of-eldoria')?.id).toBe('reach-perch')
    p = apply({ ...p, secretsFound: ['astronomy-summit'] }, { type: 'secret', secretId: 'astronomy-summit' }, { type: 'reach', locationId: 'flight-platform' }, { type: 'talk', npcId: 'groundskeeper' })
    expect(p.quests['beacons-of-eldoria'].status).toBe('completed')
    expect(p.artifacts).toContain('beacon-lantern')
  })

  it('a run of already-satisfied objectives completes in one step', () => {
    const before = { ...completed(base(), 'drowned-chapel'), artifacts: ['shrine-ember'] }
    const { advanced } = startQuest(before, 'glimmerwood-embers')
    expect(advanced.map((a) => a.objective.id)).toEqual(['talk-groundskeeper', 'take-ember'])
  })
})

describe('mission list and tracking', () => {
  it('lists active missions before new ones and leaves out locked and finished ones', () => {
    let p = completed(createProgression(), 'first-spark')
    p = startQuest(p, 'drowned-chapel').progression
    const entries = questEntries(p)
    expect(entries[0]).toMatchObject({ id: 'drowned-chapel', status: 'active', label: 'Drowned Chapel' })
    const ids = entries.map((e) => e.id)
    expect(ids).toContain('warden-of-the-yard')
    expect(ids).not.toContain('first-spark')
    expect(ids).not.toContain('glimmerwood-embers')
  })

  it('shows counted progress', () => {
    const p = startQuest({ ...completed(createProgression(), 'lost-archive'), secretsFound: ['library-nook'] }, 'secrets-of-eldoria').progression
    expect(questEntries(p).find((e) => e.id === 'secrets-of-eldoria')?.progress).toBe('1/3')
  })

  it('points the compass at the tracked mission when it is active', () => {
    let p = completed(createProgression(), 'first-spark')
    p = startQuest(p, 'warden-of-the-yard').progression
    p = startQuest(p, 'drowned-chapel').progression
    expect(compassObjective(p, null)?.label).toBe('Sentinel')
    expect(compassObjective(p, 'drowned-chapel')?.label).toBe('Drowned Chapel')
    // A tracked quest that is not active falls back to the first active one.
    expect(compassObjective(p, 'lost-archive')?.label).toBe('Sentinel')
  })
})
