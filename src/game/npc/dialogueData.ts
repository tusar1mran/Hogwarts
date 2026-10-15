import type { Progression } from '../quests/questEngine'
import { awaitsTalk, canAcceptQuest, currentObjective, questStatus } from '../quests/questEngine'

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

/**
 * Entry node for a follow-up quest: turn-in, progress or offer, or null when the quest has
 * nothing to say (completed, or its prerequisites are not yet done).
 */
function followUpEntry(p: Progression, questId: string, npcId: string, prefix: string): string | null {
  if (awaitsTalk(p, questId, npcId)) return `${prefix}Turnin`
  if (questStatus(p, questId) === 'active') return `${prefix}Progress`
  if (canAcceptQuest(p, questId)) return `${prefix}Intro`
  return null
}

export const DIALOGUES: Record<string, NpcDialogue> = {
  mentor: {
    npcId: 'mentor',
    name: 'Magister Orrin Vale',
    title: 'Master of Practical Arcana',
    entry: (p) => {
      if (questStatus(p, 'first-spark') === 'completed') return followUpEntry(p, 'warden-of-the-yard', 'mentor', 'warden') ?? 'after'
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
      wardenIntro: {
        text: 'Targets do not fight back. The warding sentinel at the far end of the yard does. Subdue it and I will know you can keep your head when the air fills with fire.',
        choices: [
          { text: 'How do I beat it?', next: 'wardenExplain' },
          { text: 'Accept: Warden of the Yard', next: 'wardenAccepted', action: { type: 'acceptQuest', questId: 'warden-of-the-yard' } },
          { text: 'Another time.', next: null },
        ],
      },
      wardenExplain: {
        text: 'Five clean Arc Bolts will put it to sleep. Its orbs follow you, so raise your Aegis Shield when they come, or scatter them with a Force Wave. Swish, flick, and keep moving.',
        choices: [
          { text: 'Accept: Warden of the Yard', next: 'wardenAccepted', action: { type: 'acceptQuest', questId: 'warden-of-the-yard' } },
          { text: 'Not yet.', next: null },
        ],
      },
      wardenAccepted: { text: 'The sentinel is by the east wall. Come back when its eye goes dark.', next: null },
      wardenProgress: {
        text: 'The sentinel still stands. Five Arc Bolts, shield up when it fires.',
        next: null,
      },
      wardenTurnin: {
        text: 'Not a scorch mark on you. Take this Warden’s Sigil; it deepens the well your spells draw from.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      after: {
        text: 'Practise as often as you like. The sentinel wakes again after a short rest, if you want the exercise.',
        next: null,
      },
    },
  },

  student: {
    npcId: 'student',
    name: 'Tamsin Reed',
    title: 'Second-year Student',
    entry: (p) => {
      if (awaitsTalk(p, 'lights-in-the-dark', 'student')) return 'runesTurnin'
      if (questStatus(p, 'lights-in-the-dark') === 'active') return 'runesProgress'
      return 'hello'
    },
    nodes: {
      hello: {
        text: 'Oh! Sorry, I nearly hit you. I am practising for the term trials. Have you tried Force Wave on the crates? It is very satisfying.',
        choices: [
          { text: 'Any advice for a newcomer?', next: 'advice' },
          { text: 'Heard any rumours?', next: 'rumours' },
          { text: 'You look like you want to ask me something.', next: 'runesIntro', visible: (p) => canAcceptQuest(p, 'lights-in-the-dark') },
          { text: 'Good luck with the trials.', next: null },
        ],
      },
      runesIntro: {
        text: 'You can cast Luminous Orb now, right? My cousin says there are runes hidden around the grounds that only glow when an orb floats near them. One in the library gallery, one at the Glimmerwood shrine. Nobody believes her.',
        choices: [
          { text: 'Accept: Lights in the Dark', next: 'runesAccepted', action: { type: 'acceptQuest', questId: 'lights-in-the-dark' } },
          { text: 'Sounds like a story.', next: null },
        ],
      },
      runesAccepted: { text: 'Cast the orb close to where they should be, then wait for the light to catch them. Tell me everything!', next: null },
      runesProgress: {
        text: (p) => `${p.runesRevealed.length} of 2 runes so far? Try the library’s upper gallery and the shrine deep in the Glimmerwood.`,
        next: null,
      },
      runesTurnin: {
        text: 'Both of them? I knew it! Here, take my Runeglass Charm. It soaks up rune-light, and your mana comes back quicker with it on.',
        onEnter: { type: 'turnIn' },
        next: null,
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
      if (questStatus(p, 'lost-archive') === 'completed') return followUpEntry(p, 'secrets-of-eldoria', 'librarian', 'secrets') ?? 'after'
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
      secretsIntro: {
        text: 'I am writing a new guide to the grounds, and the old maps are full of blank corners. Visit three of the places they forgot and tell me what you saw.',
        choices: [
          { text: 'Accept: Secrets of Eldoria', next: 'secretsAccepted', action: { type: 'acceptQuest', questId: 'secrets-of-eldoria' } },
          { text: 'Perhaps later.', next: null },
        ],
      },
      secretsAccepted: { text: 'The Cartographer’s Lens will hum when you are close. The highest tower, the lake cliffs and the glowing forest are good places to start.', next: null },
      secretsProgress: {
        text: (p) => `${p.secretsFound.length} of 3 so far. Listen for the Lens; it rarely lies.`,
        next: null,
      },
      secretsTurnin: {
        text: 'Marvellous notes. Take the Starlit Mantle; the embroidery is from the Codex itself, and it steadies a caster’s reserves.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      after: {
        text: 'The Codex is back where it belongs. If the Lens starts humming, follow it. Eldoria keeps more secrets than I keep books.',
        next: null,
      },
    },
  },

  groundskeeper: {
    npcId: 'groundskeeper',
    name: 'Hollis Thorne',
    title: 'Groundskeeper',
    entry: (p) => {
      const chain: Array<[string, string]> = [
        ['drowned-chapel', 'chapel'],
        ['glimmerwood-embers', 'ember'],
        ['beacons-of-eldoria', 'beacon'],
      ]
      for (const [questId, prefix] of chain) {
        const node = followUpEntry(p, questId, 'groundskeeper', prefix)
        if (node) return node
      }
      if (questStatus(p, 'beacons-of-eldoria') === 'completed') return 'done'
      if (questStatus(p, 'first-spark') !== 'completed') return 'locked'
      if (questStatus(p, 'glimmerwood-embers') === 'completed') return 'needFlight'
      return 'hello'
    },
    nodes: {
      locked: {
        text: 'New, are you? Hollis Thorne, I keep the grounds. Go and see Magister Vale at the Practice Grounds first. When you can throw a spark without losing an eyebrow, come back. I have work for you.',
        next: null,
      },
      hello: {
        text: 'Mind the bridge, it sways in the wind. Come back when you have a moment.',
        next: null,
      },
      chapelIntro: {
        text: 'Three nights running I have seen lights in the Drowned Chapel, out on the cliffs west of the castle above Mirrormere. Nobody has prayed there in a hundred years. My knees will not take the cliff path. Yours will.',
        choices: [
          { text: 'What kind of lights?', next: 'chapelLore' },
          { text: 'Accept: The Drowned Chapel', next: 'chapelAccepted', action: { type: 'acceptQuest', questId: 'drowned-chapel' } },
          { text: 'Not tonight.', next: null },
        ],
      },
      chapelLore: {
        text: 'Green-gold, like a forest fire seen through water. Could be nothing. Could be students. Could be something that should not be there at all.',
        choices: [
          { text: 'Accept: The Drowned Chapel', next: 'chapelAccepted', action: { type: 'acceptQuest', questId: 'drowned-chapel' } },
          { text: 'I will think about it.', next: null },
        ],
      },
      chapelAccepted: { text: 'Head west past the Skyward Platform and follow the lake shore up the cliffs. Press M if you lose your way.', next: null },
      chapelProgress: { text: 'The chapel sits on the cliffs above Mirrormere, west of here. Check your map with M.', next: null },
      chapelTurnin: {
        text: 'Ash on the altar and the smell of pine resin? That is shrine-fire, carried out of the Glimmerwood. Take this old bell from the chapel; it has been ringing in my shed all week.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      emberIntro: {
        text: 'If that was shrine-fire, the shrine in the Glimmerwood is still burning. Bring me a living ember from it, carefully, and I can prove it.',
        choices: [
          { text: 'Accept: Embers of the Glimmerwood', next: 'emberAccepted', action: { type: 'acceptQuest', questId: 'glimmerwood-embers' } },
          { text: 'Later.', next: null },
        ],
      },
      emberAccepted: { text: 'The Glimmerwood is east of the castle; the shrine is deep inside where the trees glow. Do not let the ember touch your robes.', next: null },
      emberProgress: { text: 'The shrine is deep in the Glimmerwood, east of the castle. Press E beside the ember to take it.', next: null },
      emberTurnin: {
        text: 'Still warm, still alive. I will set it in silver for you. The Ember Heart, my grandmother called these. It will steady your reserves.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      needFlight: {
        text: 'The ember could relight the old beacon on the Astronomer’s Perch, but nobody walks up there. Get your flying licence from Captain Halloway on the Skyward Platform, then come back.',
        next: null,
      },
      beaconIntro: {
        text: 'Licensed, are you? Then take a spark of that ember up to the Astronomer’s Perch, above the tallest tower, and relight the beacon. Land on the Skyward Platform after, so Halloway sees you come in safe.',
        choices: [
          { text: 'Accept: Beacons of Eldoria', next: 'beaconAccepted', action: { type: 'acceptQuest', questId: 'beacons-of-eldoria' } },
          { text: 'Not yet.', next: null },
        ],
      },
      beaconAccepted: { text: 'Summon your broom with F, climb above the tallest flat-topped tower and hover over the top until the beacon catches.', next: null },
      beaconProgress: {
        text: (p) => {
          const o = currentObjective(p, 'beacons-of-eldoria')
          if (o?.kind === 'reach') return 'The beacon is lit. Now land on the Skyward Platform.'
          return 'The Perch is above the tallest flat-topped tower. You will need your broom.'
        },
        next: null,
      },
      beaconTurnin: {
        text: 'I saw it from here, lit up like a second moon. Take this lantern; it was lit from your beacon. Eldoria owes you a good deal, young one.',
        onEnter: { type: 'turnIn' },
        next: null,
      },
      done: {
        text: 'The beacon burns, the chapel is quiet and the bridge still sways. A good season.',
        next: null,
      },
    },
  },

  'flight-instructor': {
    npcId: 'flight-instructor',
    name: 'Captain Bryn Halloway',
    title: 'Flight Instructor',
    entry: (p) => {
      if (questStatus(p, 'flight-initiation') === 'completed') {
        if (questStatus(p, 'skyward-gauntlet') === 'active') return 'gauntletProgress'
        if (canAcceptQuest(p, 'skyward-gauntlet')) return 'gauntletIntro'
        return 'after'
      }
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
      gauntletIntro: {
        text: 'Five rings was the licence. The real course has eight, and the fliers worth their pin clear the lot in one run. Fancy it?',
        choices: [
          { text: 'Accept: The Skyward Gauntlet', next: 'gauntletAccepted', action: { type: 'acceptQuest', questId: 'skyward-gauntlet' } },
          { text: 'My arms are still shaking.', next: null },
        ],
      },
      gauntletAccepted: { text: 'Course is reset. All eight rings, then put it down on this platform.', next: null },
      gauntletProgress: {
        text: (p) => {
          const o = currentObjective(p, 'skyward-gauntlet')
          if (o?.kind === 'rings') return `${objectiveCount(p, 'skyward-gauntlet')} of 8. Hold Shift on the straights.`
          return 'That is the whole course. Bring it down on the platform.'
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
