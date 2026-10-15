/**
 * Rebindable actions. Each action accepts up to two key codes (KeyboardEvent.code).
 * Ground and flight contexts deliberately share some keys (Space jumps on foot and climbs on the broom).
 */
export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump'
  | 'interact'
  | 'toggleBroom'
  | 'ascend'
  | 'descend'
  | 'spell1'
  | 'spell2'
  | 'spell3'
  | 'spell4'
  | 'spell5'
  | 'spell6'
  | 'nextSpell'
  | 'prevSpell'
  | 'spellbook'
  | 'journal'
  | 'inventory'
  | 'toggleDebug'

export type Bindings = Record<Action, string[]>

export type ActionContext = 'ground' | 'flight' | 'any'

export interface ActionMeta {
  label: string
  context: ActionContext
  group: 'Movement' | 'Magic' | 'Flight' | 'Interface'
}

export const ACTION_META: Record<Action, ActionMeta> = {
  moveForward: { label: 'Move forward / accelerate', context: 'any', group: 'Movement' },
  moveBack: { label: 'Move back / brake', context: 'any', group: 'Movement' },
  moveLeft: { label: 'Move left / steer left', context: 'any', group: 'Movement' },
  moveRight: { label: 'Move right / steer right', context: 'any', group: 'Movement' },
  sprint: { label: 'Sprint / flight boost', context: 'any', group: 'Movement' },
  jump: { label: 'Jump', context: 'ground', group: 'Movement' },
  interact: { label: 'Interact', context: 'ground', group: 'Movement' },
  toggleBroom: { label: 'Summon / dismiss broom', context: 'any', group: 'Flight' },
  ascend: { label: 'Climb (flying)', context: 'flight', group: 'Flight' },
  descend: { label: 'Descend (flying)', context: 'flight', group: 'Flight' },
  spell1: { label: 'Select spell 1', context: 'any', group: 'Magic' },
  spell2: { label: 'Select spell 2', context: 'any', group: 'Magic' },
  spell3: { label: 'Select spell 3', context: 'any', group: 'Magic' },
  spell4: { label: 'Select spell 4', context: 'any', group: 'Magic' },
  spell5: { label: 'Select spell 5', context: 'any', group: 'Magic' },
  spell6: { label: 'Select spell 6', context: 'any', group: 'Magic' },
  nextSpell: { label: 'Next spell', context: 'any', group: 'Magic' },
  prevSpell: { label: 'Previous spell', context: 'any', group: 'Magic' },
  spellbook: { label: 'Open spellbook', context: 'any', group: 'Interface' },
  journal: { label: 'Open quest journal', context: 'any', group: 'Interface' },
  inventory: { label: 'Open artefact collection', context: 'any', group: 'Interface' },
  toggleDebug: { label: 'Toggle debug overlay', context: 'any', group: 'Interface' },
}

/**
 * Ctrl is the documented descend key, but browsers reserve Ctrl+W (close tab) and a page
 * cannot prevent it, so C is bound as a safe alternative and the UI says so.
 */
export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyE'],
  toggleBroom: ['KeyF'],
  ascend: ['Space'],
  descend: ['ControlLeft', 'KeyC'],
  spell1: ['Digit1'],
  spell2: ['Digit2'],
  spell3: ['Digit3'],
  spell4: ['Digit4'],
  spell5: ['Digit5'],
  spell6: ['Digit6'],
  nextSpell: ['KeyX'],
  prevSpell: ['KeyZ'],
  spellbook: ['KeyB'],
  journal: ['KeyJ'],
  inventory: ['KeyI'],
  toggleDebug: ['F3'],
}

export const ACTIONS = Object.keys(DEFAULT_BINDINGS) as Action[]

/** Readable label for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Enter: 'Enter',
  }
  return map[code] ?? code
}

const overlaps = (a: ActionContext, b: ActionContext) => a === 'any' || b === 'any' || a === b

/** Returns pairs of actions that share a key inside an overlapping context. */
export function findConflicts(bindings: Bindings): Array<{ code: string; actions: [Action, Action] }> {
  const out: Array<{ code: string; actions: [Action, Action] }> = []
  for (let i = 0; i < ACTIONS.length; i++) {
    for (let j = i + 1; j < ACTIONS.length; j++) {
      const a = ACTIONS[i]
      const b = ACTIONS[j]
      if (!overlaps(ACTION_META[a].context, ACTION_META[b].context)) continue
      for (const code of bindings[a]) {
        if (bindings[b].includes(code)) out.push({ code, actions: [a, b] })
      }
    }
  }
  return out
}

/** Keys that cannot be bound because the browser or the game reserves them. */
export const RESERVED_CODES = new Set(['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'Tab'])
