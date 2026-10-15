import { create } from 'zustand'

/**
 * Application phase machine.
 *  boot    -> capability checks (WebGL, screen size)
 *  loading -> world is being built behind the loading screen
 *  menu    -> main menu over a cinematic view of the castle
 *  playing -> gameplay; `overlay` decides whether a menu is open on top
 */
export type Phase = 'boot' | 'loading' | 'menu' | 'playing'

export type Overlay = null | 'pause' | 'spellbook' | 'journal' | 'inventory' | 'settings' | 'dialogue'
export type MenuScreen = 'main' | 'settings' | 'credits'
export type SettingsTab = 'graphics' | 'audio' | 'controls'

export interface FatalError {
  title: string
  message: string
  detail?: string
}

interface GameStore {
  phase: Phase
  overlay: Overlay
  menuScreen: MenuScreen
  settingsTab: SettingsTab
  /** Incremented when a new session starts so world entities can reset. */
  sessionId: number
  worldReady: boolean
  fatalError: FatalError | null
  pointerLocked: boolean
  /** Set when pointer lock could not be re-acquired and the user must click the canvas. */
  needsClickToResume: boolean
  loading: { label: string; progress: number }

  setPhase: (p: Phase) => void
  setWorldReady: (v: boolean) => void
  setLoading: (label: string, progress: number) => void
  setFatalError: (e: FatalError | null) => void
  beginSession: () => void
  openOverlay: (o: Exclude<Overlay, null>) => void
  closeOverlay: () => void
  pause: () => void
  resume: () => void
  setMenuScreen: (s: MenuScreen) => void
  setSettingsTab: (t: SettingsTab) => void
  setPointerLocked: (v: boolean) => void
  setNeedsClickToResume: (v: boolean) => void
  returnToMenu: () => void
}

export const useGame = create<GameStore>((set) => ({
  phase: 'boot',
  overlay: null,
  menuScreen: 'main',
  settingsTab: 'graphics',
  sessionId: 0,
  worldReady: false,
  fatalError: null,
  pointerLocked: false,
  needsClickToResume: false,
  loading: { label: 'Preparing', progress: 0 },

  setPhase: (phase) => set({ phase }),
  setWorldReady: (worldReady) => set({ worldReady }),
  setLoading: (label, progress) => set({ loading: { label, progress } }),
  setFatalError: (fatalError) => set({ fatalError }),
  beginSession: () => set((s) => ({ phase: 'playing', overlay: null, sessionId: s.sessionId + 1, menuScreen: 'main' })),
  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: null }),
  pause: () => set((s) => (s.phase === 'playing' && s.overlay === null ? { overlay: 'pause' } : {})),
  resume: () => set({ overlay: null }),
  setMenuScreen: (menuScreen) => set({ menuScreen }),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setNeedsClickToResume: (needsClickToResume) => set({ needsClickToResume }),
  returnToMenu: () => set({ phase: 'menu', overlay: null, menuScreen: 'main' }),
}))

/** True when gameplay input and simulation should run. */
export const isGameplayActive = (s: Pick<GameStore, 'phase' | 'overlay'>) => s.phase === 'playing' && s.overlay === null
