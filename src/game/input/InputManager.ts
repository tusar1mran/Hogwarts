import type { Action, Bindings } from './bindings'
import { DEFAULT_BINDINGS } from './bindings'

/** True when the event originates from a text field, so gameplay keys must be ignored. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    // Sliders and checkboxes do not consume letters.
    return !['range', 'checkbox', 'radio', 'button', 'submit'].includes(type)
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}

type PressHandler = (action: Action) => void
type LockListener = (locked: boolean) => void

/**
 * Keyboard + mouse state. Gameplay systems poll it each frame (`isDown`, `consumeMouseDelta`)
 * and subscribe to discrete presses via `onPress`. It never causes React renders.
 */
export class InputManager {
  private down = new Set<string>()
  private bindings: Bindings = DEFAULT_BINDINGS
  private pressHandlers = new Set<PressHandler>()
  private lockListeners = new Set<LockListener>()
  private mouseDX = 0
  private mouseDY = 0
  private wheel = 0
  private leftClickQueued = false
  private target: HTMLElement | null = null
  /** Gameplay input is only processed while enabled (playing, no menu or dialogue open). */
  enabled = false
  pointerLocked = false
  mouseButtons = { left: false, right: false }

  setBindings(b: Bindings) {
    this.bindings = b
  }

  getBindings() {
    return this.bindings
  }

  attach(element: HTMLElement) {
    this.detach()
    this.target = element
    window.addEventListener('keydown', this.onKeyDown, { passive: false })
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('mousemove', this.onMouseMove)
    element.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    element.addEventListener('wheel', this.onWheel, { passive: false })
    element.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    if (this.target) {
      this.target.removeEventListener('mousedown', this.onMouseDown)
      this.target.removeEventListener('wheel', this.onWheel)
      this.target.removeEventListener('contextmenu', this.onContextMenu)
    }
    this.target = null
  }

  onPress(handler: PressHandler) {
    this.pressHandlers.add(handler)
    return () => {
      this.pressHandlers.delete(handler)
    }
  }

  onPointerLock(listener: LockListener) {
    this.lockListeners.add(listener)
    return () => {
      this.lockListeners.delete(listener)
    }
  }

  isDown(action: Action): boolean {
    if (!this.enabled) return false
    const codes = this.bindings[action]
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true
    return false
  }

  /** Axis in [-1, 1] from a negative/positive action pair. */
  axis(negative: Action, positive: Action): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0)
  }

  consumeMouseDelta(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY]
    this.mouseDX = 0
    this.mouseDY = 0
    return d
  }

  consumeWheel(): number {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  /** Returns true once per left click (cast trigger). */
  consumeLeftClick(): boolean {
    const v = this.leftClickQueued
    this.leftClickQueued = false
    return v
  }

  isAimHeld() {
    return this.enabled && this.mouseButtons.right
  }

  reset() {
    this.down.clear()
    this.mouseDX = this.mouseDY = this.wheel = 0
    this.mouseButtons.left = this.mouseButtons.right = false
    this.leftClickQueued = false
  }

  /** Simulate a key press (used by tests and on-screen helpers). */
  simulatePress(action: Action) {
    this.pressHandlers.forEach((h) => h(action))
  }

  private actionsForCode(code: string): Action[] {
    const out: Action[] = []
    for (const action in this.bindings) {
      if (this.bindings[action as Action].includes(code)) out.push(action as Action)
    }
    return out
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return
    const actions = this.actionsForCode(e.code)
    if (this.enabled && (actions.length > 0 || e.code === 'Space' || e.code.startsWith('Arrow'))) {
      // Stop page scrolling and the browser shortcuts a page is allowed to suppress.
      e.preventDefault()
    }
    if (e.repeat) return
    this.down.add(e.code)
    for (const a of actions) this.pressHandlers.forEach((h) => h(a))
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }

  private onBlur = () => this.reset()

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || !this.pointerLocked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return
    if (e.button === 0) {
      this.mouseButtons.left = true
      if (this.pointerLocked) this.leftClickQueued = true
    }
    if (e.button === 2) this.mouseButtons.right = true
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseButtons.left = false
    if (e.button === 2) this.mouseButtons.right = false
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return
    e.preventDefault()
    this.wheel += Math.sign(e.deltaY)
  }

  private onContextMenu = (e: Event) => e.preventDefault()

  private onPointerLockChange = () => {
    this.pointerLocked = this.target !== null && document.pointerLockElement === this.target
    if (!this.pointerLocked) {
      this.mouseButtons.left = this.mouseButtons.right = false
      this.down.clear()
    }
    this.lockListeners.forEach((l) => l(this.pointerLocked))
  }

  /** Request pointer lock; resolves false instead of throwing (Chrome rate-limits re-locks). */
  async requestLock(): Promise<boolean> {
    const el = this.target
    if (!el || typeof el.requestPointerLock !== 'function') return false
    try {
      await el.requestPointerLock()
      return true
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[input] pointer lock request was rejected', err)
      return false
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }
}

export const input = new InputManager()
