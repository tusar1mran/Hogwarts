import { create } from 'zustand'
import {
  applyQuestEvent,
  createProgression,
  startQuest,
  type Checkpoint,
  type Progression,
  type QuestEvent,
  type QuestUpdate,
} from '../quests/questEngine'
import { readSave, writeSave } from '../quests/saveSystem'
import { getArtifact, getQuest, levelForXp } from '../quests/questData'
import { useHud } from './hudStore'
import { events } from '../core/events'
import { keyLabel } from '../input/bindings'
import { useSettings } from './settings'

const questTitle = (id: string) => getQuest(id)?.title ?? id

interface ProgressionStore {
  progression: Progression
  /** Replace progression (new game / continue). */
  load: (p: Progression) => void
  newGame: () => void
  /** Load from local storage; returns false when no valid save exists. */
  continueFromSave: () => boolean
  save: () => void
  dispatch: (e: QuestEvent) => void
  acceptQuest: (questId: string) => void
  addArtifact: (id: string) => void
  collectBroom: (id: string) => void
  markSecret: (id: string) => boolean
  markRune: (id: string) => boolean
  collectRing: (index: number) => boolean
  resetRings: () => void
  setCheckpoint: (c: Checkpoint) => void
  addPlayTime: (s: number) => void
}

function announce(update: QuestUpdate, before: Progression) {
  const hud = useHud.getState()
  for (const q of update.completed) {
    events.emit({ type: 'quest:completed', questId: q.id })
    hud.notify({ kind: 'quest', title: `Quest complete: ${q.title}`, body: `+${q.reward.xp} XP. ${q.reward.message}` })
  }
  for (const a of update.advanced) {
    if (update.completed.some((q) => q.id === a.questId)) continue
    hud.notify({ kind: 'info', title: 'Objective complete', body: a.objective.text })
  }
  if (levelForXp(update.progression.xp) > levelForXp(before.xp)) {
    hud.notify({ kind: 'reward', title: `Reached level ${levelForXp(update.progression.xp)}`, body: 'Your arcane talent grows.' })
  }
}

export const useProgression = create<ProgressionStore>((set, get) => {
  const commit = (update: QuestUpdate) => {
    const before = get().progression
    if (update.progression === before) return
    set({ progression: update.progression })
    announce(update, before)
    // Quest milestones are persisted immediately so a reload never loses them.
    if (update.advanced.length > 0) get().save()
  }

  return {
    progression: createProgression(),
    load: (progression) => set({ progression }),
    newGame: () => {
      set({ progression: createProgression() })
      get().save()
    },
    continueFromSave: () => {
      const res = readSave()
      if (!res.ok) return false
      if (res.warnings.length && import.meta.env.DEV) console.warn('[save] loaded with warnings', res.warnings)
      set({ progression: res.progression })
      return true
    },
    save: () => {
      writeSave(get().progression)
    },
    dispatch: (e) => commit(applyQuestEvent(get().progression, e)),
    acceptQuest: (questId) => {
      const update = startQuest(get().progression, questId)
      if (update.progression === get().progression) return
      set({ progression: update.progression })
      useHud.getState().notify({ kind: 'quest', title: 'New quest', body: questTitle(questId) })
      events.emit({ type: 'quest:accepted', questId })
      get().save()
    },
    addArtifact: (id) => {
      const p = get().progression
      if (p.artifacts.includes(id)) return
      set({ progression: { ...p, artifacts: [...p.artifacts, id] } })
      const a = getArtifact(id)
      useHud.getState().notify({ kind: 'reward', title: `Found: ${a?.name ?? id}`, body: a?.description })
      get().dispatch({ type: 'collect', itemId: id })
      get().save()
    },
    collectBroom: (id) => {
      const p = get().progression
      if (p.broomsCollected.includes(id)) return
      set({ progression: { ...p, hasBroom: true, broomsCollected: [...p.broomsCollected, id] } })
      const summonKey = keyLabel(useSettings.getState().controls.bindings.toggleBroom[0])
      useHud.getState().notify({ kind: 'reward', title: 'Broom acquired', body: `Press ${summonKey} to summon your broom.` })
      events.emit({ type: 'broom:collected', broomId: id })
      get().save()
    },
    markSecret: (id) => {
      const p = get().progression
      if (p.secretsFound.includes(id)) return false
      set({ progression: { ...p, secretsFound: [...p.secretsFound, id], xp: p.xp + 50 } })
      get().save()
      return true
    },
    markRune: (id) => {
      const p = get().progression
      if (p.runesRevealed.includes(id)) return false
      set({ progression: { ...p, runesRevealed: [...p.runesRevealed, id], xp: p.xp + 40 } })
      get().save()
      return true
    },
    collectRing: (index) => {
      const p = get().progression
      if (p.ringsCollected.includes(index)) return false
      set({ progression: { ...p, ringsCollected: [...p.ringsCollected, index] } })
      get().dispatch({ type: 'ring', ringIndex: index })
      return true
    },
    resetRings: () => set((s) => ({ progression: { ...s.progression, ringsCollected: [] } })),
    setCheckpoint: (checkpoint) => {
      set((s) => ({ progression: { ...s.progression, checkpoint } }))
      get().save()
    },
    addPlayTime: (sec) => set((s) => ({ progression: { ...s.progression, playTimeSeconds: s.progression.playTimeSeconds + sec } })),
  }
})
