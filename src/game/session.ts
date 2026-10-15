import { Vector3 } from 'three'
import { useGame } from './state/gameStore'
import { useProgression } from './state/progressionStore'
import { useDialogue } from './state/dialogueStore'
import { useHud } from './state/hudStore'
import { resetRuntimePlayer } from './core/runtime'
import { input } from './input/InputManager'
import { audioEngine } from './audio/AudioEngine'
import { resetSpellState, selectSpell } from './spells/SpellRuntime'
import { SPAWN, areaAt } from './world/layout'
import { runtime } from './core/runtime'
import { events } from './core/events'

/**
 * Session lifecycle actions used by the menus. Each is safe to call from a click handler,
 * which is also where pointer lock and audio must be requested (user-gesture requirement).
 */

function enterWorld(position: Vector3, yaw: number) {
  resetSpellState()
  resetRuntimePlayer(position, yaw)
  const area = areaAt(position.x, position.y, position.z)
  runtime.player.area = area.id
  useHud.getState().patch({ areaName: area.name })
  useDialogue.getState().close()
  useHud.setState({ notifications: [], prompt: null, lastFizzle: null })
  selectSpell('arc-bolt')
  useGame.getState().beginSession()
  audioEngine.unlock()
  lockOrPrompt()
}

/** Request pointer lock; if the browser refuses, ask the player to click the view. */
export function lockOrPrompt() {
  void input.requestLock().then((ok) => {
    if (!ok) useGame.getState().setNeedsClickToResume(true)
  })
}

export function startNewGame() {
  useProgression.getState().newGame()
  enterWorld(new Vector3(...SPAWN.position), SPAWN.yaw)
  useHud.getState().notify({
    kind: 'quest',
    title: 'Welcome to Eldoria',
    body: 'Cross the bridge and enter the academy. Magister Vale waits at the Practice Grounds, east of the courtyard.',
  })
}

/** Returns false (and stays in the menu) when the save is missing or invalid. */
export function continueGame(): boolean {
  if (!useProgression.getState().continueFromSave()) {
    useHud.getState().notify({ kind: 'warning', title: 'No save found', body: 'The saved game could not be loaded.' })
    return false
  }
  const cp = useProgression.getState().progression.checkpoint
  enterWorld(cp ? new Vector3(...cp.position) : new Vector3(...SPAWN.position), cp?.yaw ?? SPAWN.yaw)
  return true
}

export function resumeGame() {
  useGame.getState().resume()
  events.emit({ type: 'ui:click' })
  lockOrPrompt()
}

export function returnToMenu() {
  useProgression.getState().save()
  useDialogue.getState().close()
  input.releaseLock()
  useGame.getState().returnToMenu()
}
