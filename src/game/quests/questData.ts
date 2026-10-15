import type { FlightState } from '../core/types'

export type ObjectiveDef =
  | { id: string; kind: 'talk'; npcId: string; text: string }
  | { id: string; kind: 'spellHit'; spellId: string; targetKind: string; count: number; text: string }
  | { id: string; kind: 'collect'; itemId: string; text: string }
  | { id: string; kind: 'flightState'; state: FlightState; text: string }
  | { id: string; kind: 'rings'; count: number; text: string }
  | { id: string; kind: 'reach'; locationId: string; text: string }

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
  },
]

export const getQuest = (id: string) => QUESTS.find((q) => q.id === id)

export interface ArtifactDef {
  id: string
  name: string
  description: string
}

export const ARTIFACTS: ArtifactDef[] = [
  { id: 'astral-codex', name: 'Astral Codex', description: 'A star-chart bound in midnight vellum. Its pages rearrange themselves to match the sky.' },
  { id: 'cartographers-lens', name: 'Cartographer’s Lens', description: 'A brass loupe that hums near forgotten places. Undiscovered secrets appear on your compass.' },
  { id: 'skyward-pin', name: 'Skyward Pin', description: 'A silver feather pin worn by licensed broom riders of the academy.' },
  { id: 'shrine-ember', name: 'Shrine Ember', description: 'A warm, weightless spark taken from the Glimmerwood shrine.' },
]

export const getArtifact = (id: string) => ARTIFACTS.find((a) => a.id === id)

export const XP_PER_LEVEL = 250
export const levelForXp = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
