import type { Progression } from '../quests/questEngine'
import { awaitsTalk, currentObjective, questStatus } from '../quests/questEngine'

export type DialogueAction =
  | { type: 'acceptQuest'; questId: string }
  /** Hands in the active "return to" objective by emitting a talk event for this NPC. */
  | { type: 'turnIn' }

export interface DialogueChoice {
  text: string
  next: string | null
  action?: DialogueAction
  visible?: (p: Progression) => boolean
}

export interface DialogueNode {
  text: string | ((p: Progression) => string)
  /** Runs when the node is shown. */
  onEnter?: DialogueAction
  choices?: DialogueChoice[]
  /** Used when there are no choices: Continue goes here (null ends the conversation). */
  next?: string | null
}

export interface NpcDialogue {
  npcId: string
  name: string
  title: string
  entry: (p: Progression) => string
  nodes: Record<string, DialogueNode>
}

const objectiveCount = (p: Progression, questId: string) => p.quests[questId]?.count ?? 0

export const DIALOGUES: Record<string, NpcDialogue> = {
  mentor: {
    npcId: 'mentor',
    name: 'Magister Orrin Vale',
    title: 'Master of Practical Arcana',
    entry: (p) => {
      if (questStatus(p, 'first-spark') === 'completed') return 'after'
      if (awaitsTalk(p, 'first-spark', 'mentor')) return 'turnin'
      if (questStatus(p, 'first-spark') === 'active') return 'progress'
      return 'intro'
    },
    nodes: {
      intro: {
        text: 'A new face on the practice grounds. I am Magister Orrin Vale. Before I teach you anything delicate, show me you can hit what you aim at.',
        choices: [
          { text: 'I am ready. What should I do?', next: 'explain' },
          { text: 'How long have you taught here?', next: 'lore' },
          { text: 'Perhaps later.', next: null },
        ],
      },
      lore: {
        text: 'Thirty winters. Long enough to know that students who skip the basics end up singeing their eyebrows. Usually their own.',
        next: 'intro',
      },
      explain: {
        text: 'Hold the right mouse button to steady your wand, then loose an Arc Bolt with the left. Strike three of the practice targets in this yard. They mend themselves, so do not hold back.',
        choices: [
          { text: 'Accept: First Spark', next: 'accepted', action: { type: 'acceptQuest', questId: 'first-spark' } },
          { text: 'Not yet.', next: null },
        ],
      },
      accepted: { text: 'Three clean hits. Off you go.', next: null },
      progress: {
        text: (p) => {
          const o = currentObjective(p, 'first-spark')
          if (o?.kind === 'spellHit') return `${objectiveCount(p, 'first-spark')} of 3 so far. Arc Bolt only, mind. Steady the wand with the right mouse button.`
          return 'Keep at it.'
        },
        next: null,
      },
      turnin: {
        text: 'Clean work. You have earned two charms worth knowing: Luminous Orb, for dark places, and Mystic Pull, for things just out of reach.',
        onEnter: { type: 'turnIn' },
        next: 'turnin2',
      },
      turnin2: {
        text: 'Keeper Marrow in the library could use sharp eyes, and Captain Halloway on the Skyward Platform is always short of fliers. Try a Luminous Orb near anything that looks like it is hiding something.',
        next: null,
      },
      after: {
        text: 'Practise as often as you like. The warding sentinel at the far end of the yard fights back, so raise your Aegis Shield before you poke it.',
        next: null,
      },
    },
  },

  student: {
    npcId: 'student',
    name: 'Tamsin Reed',
    title: 'Second-year Student',
    entry: () => 'hello',
    nodes: {
      hello: {
        text: 'Oh! Sorry, I nearly hit you. I am practising for the term trials. Have you tried Force Wave on the crates? It is very satisfying.',
        choices: [
          { text: 'Any advice for a newcomer?', next: 'advice' },
          { text: 'Heard any rumours?', next: 'rumours' },
          { text: 'Good luck with the trials.', next: null },
        ],
      },
      advice: {
        text: 'Mana comes back on its own if you stop casting for a moment. And the sentinel only shoots at you if you get close, so use your shield first.',
        next: 'hello',
      },
      rumours: {
        text: 'People say there is a shrine deep in the Glimmerwood, east of here, and an old chapel on the cliffs above Mirrormere. And somebody climbed the astronomy tower once. Well, flew.',
        next: 'hello',
      },
    },
  },

  librarian: {
    npcId: 'librarian',
    name: 'Keeper Isolde Marrow',
    title: 'Keeper of the Starlit Library',
    entry: (p) => {
      if (questStatus(p, 'lost-archive') === 'completed') return 'after'
      if (awaitsTalk(p, 'lost-archive', 'librarian')) return 'turnin'
      if (questStatus(p, 'lost-archive') === 'active') return 'progress'
      return 'intro'
    },
    nodes: {
      intro: {
        text: 'Quietly, please. Welcome to the Starlit Library. I am Keeper Marrow, and I have lost a book, which is a sentence no librarian should ever say aloud.',
        choices: [
          { text: 'Which book?', next: 'explain' },
          { text: 'I will leave you to it.', next: null },
        ],
      },
      explain: {
        text: 'The Astral Codex. Midnight-blue binding, silver stars. I was cataloguing in the upper gallery and set it down somewhere. My knees no longer agree with those stairs.',
        choices: [
          { text: 'Accept: The Lost Archive', next: 'accepted', action: { type: 'acceptQuest', questId: 'lost-archive' } },
          { text: 'Not right now.', next: null },
        ],
      },
      accepted: { text: 'The stairs are along the east side. Do look behind the shelves; I have a habit of tucking things away.', next: null },
      progress: {
        text: 'The upper gallery, dear. The north-west corner, I think, where the shelves make a little nook. Press E when you find it.',
        next: null,
      },
      turnin: {
        text: 'The Codex! Unharmed, even. Take this Cartographer’s Lens; it hums near forgotten places. And a page of folded-space theory: Blink Step, for when stairs are beneath you.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      after: {
        text: 'The Codex is back where it belongs. If the Lens starts humming, follow it. Eldoria keeps more secrets than I keep books.',
        next: null,
      },
    },
  },

  'flight-instructor': {
    npcId: 'flight-instructor',
    name: 'Captain Bryn Halloway',
    title: 'Flight Instructor',
    entry: (p) => {
      if (questStatus(p, 'flight-initiation') === 'completed') return 'after'
      if (questStatus(p, 'flight-initiation') === 'active') return 'progress'
      return 'intro'
    },
    nodes: {
      intro: {
        text: 'Wind is good today. Captain Bryn Halloway, flight instruction. Want your licence? Fly my ring course and land back here in one piece.',
        choices: [
          { text: 'How do I fly?', next: 'controls' },
          { text: 'Sign me up.', next: 'accepted', action: { type: 'acceptQuest', questId: 'flight-initiation' } },
          { text: 'I prefer the ground.', next: null },
        ],
      },
      controls: {
        text: 'F summons your broom and F again lands it. W to speed up, S to brake, steer with the mouse or A and D. Space climbs; Ctrl or C dives. Hold Shift for a burst of speed.',
        choices: [
          { text: 'Sign me up.', next: 'accepted', action: { type: 'acceptQuest', questId: 'flight-initiation' } },
          { text: 'Let me think about it.', next: null },
        ],
      },
      accepted: { text: 'Summon your broom, fly through five of the glowing rings, then bring it down on this platform.', next: null },
      progress: {
        text: (p) => {
          const o = currentObjective(p, 'flight-initiation')
          if (o?.kind === 'flightState') return 'Press F to summon your broom. Go on.'
          if (o?.kind === 'rings') return `${objectiveCount(p, 'flight-initiation')} of 5 rings. They glow gold; you will not miss them.`
          if (o?.kind === 'reach') return 'Nicely done. Now land on the platform. F to land when you are over it.'
          return 'Off you go.'
        },
        next: null,
      },
      after: {
        text: 'Licensed and alive, the best kind of flier. The rings reset when you land here, if you want to beat your own lap.',
        next: null,
      },
    },
  },
}
