import type { SurfaceKind } from './types'

/** Typed, synchronous event bus used to decouple gameplay systems (spells, quests, audio, UI). */
export type GameEvent =
  | { type: 'spell:cast'; spellId: string }
  | { type: 'spell:fizzle'; spellId: string; reason: string }
  | { type: 'spell:hit'; spellId: string; entityId: string | null; entityKind: string | null; x: number; y: number; z: number }
  | { type: 'shield:up' }
  | { type: 'shield:down' }
  | { type: 'shield:block' }
  | { type: 'target:destroyed'; entityId: string }
  | { type: 'npc:talk'; npcId: string }
  | { type: 'item:collected'; itemId: string }
  | { type: 'broom:collected'; broomId: string }
  | { type: 'flight:state'; from: string; to: string }
  | { type: 'flight:ring'; ringIndex: number }
  | { type: 'location:reached'; locationId: string }
  | { type: 'area:changed'; areaId: string }
  | { type: 'secret:found'; secretId: string }
  | { type: 'rune:revealed'; runeId: string }
  | { type: 'player:damaged'; amount: number }
  | { type: 'player:respawned'; reason: string }
  | { type: 'player:jumped' }
  | { type: 'player:landed'; impact: number }
  | { type: 'footstep'; surface: SurfaceKind; running: boolean; x: number; y: number; z: number }
  | { type: 'door'; open: boolean; x: number; y: number; z: number }
  | { type: 'interact'; id: string }
  | { type: 'ui:click' }
  | { type: 'quest:completed'; questId: string }
  | { type: 'quest:accepted'; questId: string }

export type GameEventType = GameEvent['type']
type Handler<T extends GameEventType> = (event: Extract<GameEvent, { type: T }>) => void
type AnyHandler = (event: GameEvent) => void

class EventBus {
  private handlers = new Map<string, Set<AnyHandler>>()
  private anyHandlers = new Set<AnyHandler>()

  on<T extends GameEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as AnyHandler)
    return () => set.delete(handler as AnyHandler)
  }

  onAny(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler)
    return () => this.anyHandlers.delete(handler)
  }

  emit(event: GameEvent) {
    this.handlers.get(event.type)?.forEach((h) => {
      try {
        h(event)
      } catch (err) {
        console.error(`[events] handler for ${event.type} failed`, err)
      }
    })
    this.anyHandlers.forEach((h) => {
      try {
        h(event)
      } catch (err) {
        console.error('[events] any-handler failed', err)
      }
    })
  }

  clear() {
    this.handlers.clear()
    this.anyHandlers.clear()
  }
}

export const events = new EventBus()
