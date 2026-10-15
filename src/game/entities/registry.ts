import type { RapierRigidBody } from '@react-three/rapier'
import type { Vector3 } from 'three'
import type { SpellDef } from '../spells/registry'

export interface SpellHit {
  spell: SpellDef
  point: Vector3
  direction: Vector3
}

export type EntityKind = 'practice-target' | 'crate' | 'sentinel' | 'npc' | 'codex' | 'rune' | 'tome'

/**
 * Anything spells can affect. Physics colliders map back to entities through their handles,
 * so a projectile hit or a tether ray can find what it touched.
 */
export interface GameEntity {
  id: string
  kind: EntityKind
  /** Mystic Pull can tether it. */
  pullable?: boolean
  /** Force Wave and impacts push it (requires a dynamic body). */
  pushable?: boolean
  body?: RapierRigidBody | null
  getPosition: (out: Vector3) => Vector3
  onSpellHit?: (hit: SpellHit) => void
}

const byId = new Map<string, GameEntity>()
const byCollider = new Map<number, GameEntity>()
const collidersOf = new Map<string, number[]>()

export function registerEntity(entity: GameEntity, colliderHandles: number[]) {
  byId.set(entity.id, entity)
  collidersOf.set(entity.id, colliderHandles)
  colliderHandles.forEach((h) => byCollider.set(h, entity))
  return () => {
    if (byId.get(entity.id) === entity) byId.delete(entity.id)
    collidersOf.get(entity.id)?.forEach((h) => {
      if (byCollider.get(h) === entity) byCollider.delete(h)
    })
    collidersOf.delete(entity.id)
  }
}

export const entityForCollider = (handle: number) => byCollider.get(handle) ?? null
export const entityById = (id: string) => byId.get(id) ?? null
export const allEntities = () => byId.values()

/** Collect collider handles of a rigid body (for registration). */
export function bodyColliderHandles(body: RapierRigidBody | null | undefined): number[] {
  if (!body) return []
  const out: number[] = []
  for (let i = 0; i < body.numColliders(); i++) out.push(body.collider(i).handle)
  return out
}
