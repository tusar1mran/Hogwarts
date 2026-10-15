import type { FlightState } from '../core/types'

export type ObjectiveDef =
  | { id: string; kind: 'talk'; npcId: string; text: string }
  | { id: string; kind: 'spellHit'; spellId: string; targetKind: string; count: number; text: string }
  | { id: string; kind: 'collect'; itemId: string; text: string }
  | { id: string; kind: 'flightState'; state: FlightState; text: string }
  | { id: string; kind: 'rings'; count: number; text: string }
  | { id: string; kind: 'reach'; locationId: string; text: string }
  | { id: string; kind: 'defeat'; targetKind: string; count: number; text: string }
  /** Satisfied by how many runes/secrets the player has found in total, including before accepting. */
  | { id: string; kind: 'tally'; source: 'runes' | 'secrets'; count: number; text: string }

export interface QuestReward {
  xp: number
  unlockSpells?: string[]
  artifacts?: string[]
  message: string
}

export interface QuestDef {
  id: string
  title: string
  giver: string
  summary: string
  /** Completed strictly in order. The first objective is satisfied by accepting from the giver. */
  objectives: ObjectiveDef[]
  reward: QuestReward
  /** Quests that must be completed before this one can be accepted. */
  requires?: string[]
  /** Accepting this quest restarts the ring course so earlier laps do not count. */
  resetsRings?: boolean
}

export const QUESTS: QuestDef[] = [
  {
    id: 'first-spark',
    title: 'First Spark',
    giver: 'mentor',
    summary: 'Magister Orrin Vale wants proof that you can aim an Arc Bolt before teaching you anything subtler.',
    objectives: [
      { id: 'talk-mentor', kind: 'talk', npcId: 'mentor', text: 'Speak to Magister Vale at the Practice Grounds' },
      { id: 'hit-targets', kind: 'spellHit', spellId: 'arc-bolt', targetKind: 'practice-target', count: 3, text: 'Strike practice targets with Arc Bolt' },
      { id: 'return-mentor', kind: 'talk', npcId: 'mentor', text: 'Return to Magister Vale' },
    ],
    reward: { xp: 150, unlockSpells: ['luminous-orb', 'mystic-pull'], message: 'Learned Luminous Orb and Mystic Pull.' },
  },
  {
    id: 'lost-archive',
    title: 'The Lost Archive',
    giver: 'librarian',
    summary: 'Keeper Isolde Marrow has mislaid the Astral Codex somewhere in the upper gallery of the library.',
    objectives: [
      { id: 'talk-librarian', kind: 'talk', npcId: 'librarian', text: 'Speak to Keeper Marrow in the Starlit Library' },
      { id: 'find-codex', kind: 'collect', itemId: 'astral-codex', text: 'Find the Astral Codex in the library' },
      { id: 'return-librarian', kind: 'talk', npcId: 'librarian', text: 'Return the Codex to Keeper Marrow' },
    ],
    reward: {
      xp: 175,
      unlockSpells: ['blink-step'],
      artifacts: ['cartographers-lens'],
      message: 'Learned Blink Step. The Cartographer’s Lens now marks hidden places on your compass.',
    },
  },
  {
    id: 'flight-initiation',
    title: 'Flight Initiation',
    giver: 'flight-instructor',
    summary: 'Captain Bryn Halloway will sign off your flying licence once you have flown the ring course.',
    objectives: [
      { id: 'talk-instructor', kind: 'talk', npcId: 'flight-instructor', text: 'Speak to Captain Halloway on the Skyward Platform' },
      { id: 'summon-broom', kind: 'flightState', state: 'Summoning', text: 'Summon your broom (F)' },
      { id: 'fly-rings', kind: 'rings', count: 5, text: 'Fly through the floating rings' },
      { id: 'return-platform', kind: 'reach', locationId: 'flight-platform', text: 'Land back on the Skyward Platform' },
    ],
    reward: { xp: 200, artifacts: ['skyward-pin'], message: 'Awarded the Skyward Pin.' },
    resetsRings: true,
  },
  {
    id: 'warden-of-the-yard',
    title: 'Warden of the Yard',
    giver: 'mentor',
    summary: 'Magister Vale wants to see you subdue the warding sentinel at the far end of the practice yard without being knocked flat.',
    requires: ['first-spark'],
    objectives: [
      { id: 'talk-mentor', kind: 'talk', npcId: 'mentor', text: 'Speak to Magister Vale at the Practice Grounds' },
      { id: 'subdue-sentinel', kind: 'defeat', targetKind: 'sentinel', count: 1, text: 'Subdue the warding sentinel with Arc Bolt' },
      { id: 'return-mentor', kind: 'talk', npcId: 'mentor', text: 'Return to Magister Vale' },
    ],
    reward: { xp: 250, artifacts: ['warden-sigil'], message: 'Awarded the Warden’s Sigil: +30 maximum mana.' },
  },
  {
    id: 'lights-in-the-dark',
    title: 'Lights in the Dark',
    giver: 'student',
    summary: 'Tamsin Reed swears there are glowing runes hidden around Eldoria that only show up under a Luminous Orb. She wants proof.',
    requires: ['first-spark'],
    objectives: [
      { id: 'talk-student', kind: 'talk', npcId: 'student', text: 'Speak to Tamsin Reed at the Practice Grounds' },
      { id: 'reveal-runes', kind: 'tally', source: 'runes', count: 2, text: 'Reveal spectral runes with Luminous Orb' },
      { id: 'return-student', kind: 'talk', npcId: 'student', text: 'Tell Tamsin what you found' },
    ],
    reward: { xp: 200, artifacts: ['runeglass-charm'], message: 'Received the Runeglass Charm: mana recovers faster.' },
  },
  {
    id: 'secrets-of-eldoria',
    title: 'Secrets of Eldoria',
    giver: 'librarian',
    summary: 'Keeper Marrow is writing a new guide to the grounds and needs someone to visit the places the old maps forgot.',
    requires: ['lost-archive'],
    objectives: [
      { id: 'talk-librarian', kind: 'talk', npcId: 'librarian', text: 'Speak to Keeper Marrow in the Starlit Library' },
      { id: 'find-secrets', kind: 'tally', source: 'secrets', count: 3, text: 'Discover hidden places around Eldoria' },
      { id: 'return-librarian', kind: 'talk', npcId: 'librarian', text: 'Report back to Keeper Marrow' },
    ],
    reward: { xp: 300, artifacts: ['starlit-mantle'], message: 'Received the Starlit Mantle: +20 maximum mana and faster recovery.' },
  },
  {
    id: 'skyward-gauntlet',
    title: 'The Skyward Gauntlet',
    giver: 'flight-instructor',
    summary: 'Captain Halloway challenges licensed fliers to clear every ring on the course in one run and land back on the platform.',
    requires: ['flight-initiation'],
    resetsRings: true,
    objectives: [
      { id: 'talk-instructor', kind: 'talk', npcId: 'flight-instructor', text: 'Speak to Captain Halloway on the Skyward Platform' },
      { id: 'fly-all-rings', kind: 'rings', count: 8, text: 'Fly through every ring on the course' },
      { id: 'return-platform', kind: 'reach', locationId: 'flight-platform', text: 'Land back on the Skyward Platform' },
    ],
    reward: { xp: 300, artifacts: ['gale-feather'], message: 'Awarded the Gale Feather: +15 maximum mana.' },
  },
]

export const getQuest = (id: string) => QUESTS.find((q) => q.id === id)

/** Permanent bonuses an owned artefact grants. */
export interface ArtifactBonus {
  /** Added to maximum mana. */
  maxMana?: number
  /** Added to mana regenerated per second. */
  regen?: number
}

export interface ArtifactDef {
  id: string
  name: string
  description: string
  bonus?: ArtifactBonus
}

export const ARTIFACTS: ArtifactDef[] = [
  { id: 'astral-codex', name: 'Astral Codex', description: 'A star-chart bound in midnight vellum. Its pages rearrange themselves to match the sky.' },
  { id: 'cartographers-lens', name: 'Cartographer’s Lens', description: 'A brass loupe that hums near forgotten places. Undiscovered secrets appear on your compass.' },
  { id: 'skyward-pin', name: 'Skyward Pin', description: 'A silver feather pin worn by licensed broom riders of the academy.' },
  { id: 'shrine-ember', name: 'Shrine Ember', description: 'A warm, weightless spark taken from the Glimmerwood shrine.' },
  { id: 'warden-sigil', name: 'Warden’s Sigil', description: 'An iron seal stamped with the sentinel’s eye. Your reserves deepen.', bonus: { maxMana: 30 } },
  { id: 'runeglass-charm', name: 'Runeglass Charm', description: 'A sliver of glass that drinks in rune-light and gives it back.', bonus: { regen: 5 } },
  { id: 'starlit-mantle', name: 'Starlit Mantle', description: 'A short cape embroidered with the constellations of the Astral Codex.', bonus: { maxMana: 20, regen: 3 } },
  { id: 'gale-feather', name: 'Gale Feather', description: 'A storm-grey feather that never stops trembling.', bonus: { maxMana: 15 } },
]

export const getArtifact = (id: string) => ARTIFACTS.find((a) => a.id === id)

/** Sum of the bonuses granted by the given owned artefacts. Unknown ids are ignored. */
export function artifactBonuses(owned: readonly string[]): Required<ArtifactBonus> {
  const total = { maxMana: 0, regen: 0 }
  for (const id of owned) {
    const b = getArtifact(id)?.bonus
    if (!b) continue
    total.maxMana += b.maxMana ?? 0
    total.regen += b.regen ?? 0
  }
  return total
}

/** Short player-facing description of an artefact bonus, e.g. "+30 max mana". */
export function describeBonus(b: ArtifactBonus | undefined): string {
  if (!b) return ''
  const parts: string[] = []
  if (b.maxMana) parts.push(`+${b.maxMana} max mana`)
  if (b.regen) parts.push(`+${b.regen} mana/s`)
  return parts.join(', ')
}

export const XP_PER_LEVEL = 250
export const levelForXp = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
