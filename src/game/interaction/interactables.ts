import { Vector3 } from 'three'

/** Something the player can use with the interact key (NPCs, doors, artefacts). */
export interface Interactable {
  id: string
  position: Vector3
  /** Interaction range in metres. */
  radius: number
  verb: string
  label: string
  enabled?: () => boolean
  onInteract: () => void
}

const items = new Map<string, Interactable>()

export function registerInteractable(i: Interactable) {
  items.set(i.id, i)
  return () => {
    if (items.get(i.id) === i) items.delete(i.id)
  }
}

export const getInteractable = (id: string) => items.get(id) ?? null

const _toTarget = new Vector3()

/**
 * Best interactable in range: nearest, with a preference for things in front of the player.
 * `forward` should be a normalised horizontal facing vector.
 */
export function findInteractable(position: Vector3, forward: Vector3): Interactable | null {
  let best: Interactable | null = null
  let bestScore = Infinity
  for (const i of items.values()) {
    if (i.enabled && !i.enabled()) continue
    _toTarget.subVectors(i.position, position)
    const vertical = Math.abs(_toTarget.y)
    _toTarget.y = 0
    const dist = _toTarget.length()
    if (dist > i.radius || vertical > 2.5) continue
    const facing = dist > 0.01 ? _toTarget.normalize().dot(forward) : 1
    // Things behind the player score worse but remain usable at very close range.
    const score = dist * (1.6 - facing * 0.6)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

export const clearInteractables = () => items.clear()
