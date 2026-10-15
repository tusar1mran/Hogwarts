import { create } from 'zustand'
import { DIALOGUES, type DialogueAction, type DialogueChoice, type DialogueNode } from '../npc/dialogueData'
import { useProgression } from './progressionStore'
import { useGame } from './gameStore'
import { events } from '../core/events'

interface ActiveDialogue {
  npcId: string
  nodeId: string
}

interface DialogueStore {
  active: ActiveDialogue | null
  open: (npcId: string) => boolean
  choose: (choice: DialogueChoice) => void
  advance: () => void
  close: () => void
}

function runAction(npcId: string, action: DialogueAction | undefined) {
  if (!action) return
  const prog = useProgression.getState()
  if (action.type === 'acceptQuest') prog.acceptQuest(action.questId)
  if (action.type === 'turnIn') prog.dispatch({ type: 'talk', npcId })
}

export function getNode(npcId: string, nodeId: string): DialogueNode | null {
  return DIALOGUES[npcId]?.nodes[nodeId] ?? null
}

/**
 * Conversation state machine, independent of rendering. Opening a dialogue
 * pauses gameplay input via the `dialogue` overlay.
 */
export const useDialogue = create<DialogueStore>((set, get) => {
  const enter = (npcId: string, nodeId: string | null) => {
    if (nodeId === null) {
      get().close()
      return
    }
    const node = getNode(npcId, nodeId)
    if (!node) {
      console.warn(`[dialogue] missing node ${npcId}/${nodeId}`)
      get().close()
      return
    }
    set({ active: { npcId, nodeId } })
    runAction(npcId, node.onEnter)
  }

  return {
    active: null,
    open: (npcId) => {
      const dialogue = DIALOGUES[npcId]
      if (!dialogue) return false
      events.emit({ type: 'npc:talk', npcId })
      useGame.getState().openOverlay('dialogue')
      enter(npcId, dialogue.entry(useProgression.getState().progression))
      return true
    },
    choose: (choice) => {
      const a = get().active
      if (!a) return
      runAction(a.npcId, choice.action)
      enter(a.npcId, choice.next)
    },
    advance: () => {
      const a = get().active
      if (!a) return
      const node = getNode(a.npcId, a.nodeId)
      if (node?.choices?.length) return
      enter(a.npcId, node?.next ?? null)
    },
    close: () => {
      set({ active: null })
      if (useGame.getState().overlay === 'dialogue') useGame.getState().closeOverlay()
    },
  }
})
