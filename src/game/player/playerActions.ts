import { Vector3 } from 'three'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { useHud } from '../state/hudStore'
import { useProgression } from '../state/progressionStore'
import { SPAWN } from '../world/layout'

/** Apply damage to the player. Returns true if it landed (false when the shield absorbed it). */
export function damagePlayer(amount: number): boolean {
  const p = runtime.player
  if (runtime.time < p.shieldUntil) {
    events.emit({ type: 'shield:block' })
    return false
  }
  p.health = Math.max(0, p.health - amount)
  p.hitAt = runtime.time
  events.emit({ type: 'player:damaged', amount })
  if (p.health <= 0) {
    respawnAtCheckpoint('You were overwhelmed and wake at your last checkpoint.')
  }
  return true
}

export function respawnAtCheckpoint(message: string) {
  const cp = useProgression.getState().progression.checkpoint
  const pos = cp ? new Vector3(...cp.position) : new Vector3(...SPAWN.position)
  teleportPlayer(pos)
  runtime.player.health = runtime.player.maxHealth
  runtime.flight.state = 'Grounded'
  runtime.flight.stateTime = 0
  events.emit({ type: 'player:respawned', reason: message })
  useHud.getState().notify({ kind: 'warning', title: 'Recovered', body: message })
}

/** Return to the last safe spot (used for water and falls). */
export function respawnAtSafePosition(message: string) {
  teleportPlayer(runtime.player.lastSafePosition.clone())
  runtime.flight.state = 'Grounded'
  runtime.flight.stateTime = 0
  events.emit({ type: 'player:respawned', reason: message })
  useHud.getState().notify({ kind: 'warning', title: 'Back on solid ground', body: message })
}

export function teleportPlayer(position: Vector3) {
  runtime.player.teleportTo = position.clone()
  runtime.player.velocity.set(0, 0, 0)
}
