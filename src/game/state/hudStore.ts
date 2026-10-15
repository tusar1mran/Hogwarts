import { create } from 'zustand'
import type { FlightState } from '../core/types'

export interface Notification {
  id: number
  kind: 'quest' | 'discovery' | 'info' | 'warning' | 'reward'
  title: string
  body?: string
  createdAt: number
}

export interface InteractionPrompt {
  id: string
  verb: string
  label: string
}

/**
 * HUD snapshot. Written at ~10 Hz by HudSync (never from per-frame code paths),
 * plus event-driven fields such as notifications and prompts.
 */
interface HudStore {
  health: number
  maxHealth: number
  mana: number
  maxMana: number
  selectedSpell: string
  /** Remaining cooldown fraction per spell id (0 = ready). */
  cooldowns: Record<string, number>
  aiming: boolean
  shieldActive: boolean
  flightState: FlightState
  flightSpeed: number
  altitude: number
  heading: number
  areaName: string
  prompt: InteractionPrompt | null
  ringsCollected: number
  ringsTotal: number
  notifications: Notification[]
  lastFizzle: { text: string; at: number } | null

  patch: (p: Partial<Omit<HudStore, 'patch' | 'notify' | 'dismiss' | 'setPrompt' | 'fizzle'>>) => void
  setPrompt: (p: InteractionPrompt | null) => void
  notify: (n: Omit<Notification, 'id' | 'createdAt'>) => void
  dismiss: (id: number) => void
  fizzle: (text: string) => void
}

let nextId = 1

export const useHud = create<HudStore>((set) => ({
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  selectedSpell: 'arc-bolt',
  cooldowns: {},
  aiming: false,
  shieldActive: false,
  flightState: 'Grounded',
  flightSpeed: 0,
  altitude: 0,
  heading: 0,
  areaName: '',
  prompt: null,
  ringsCollected: 0,
  ringsTotal: 0,
  notifications: [],
  lastFizzle: null,

  patch: (p) => set(p),
  setPrompt: (prompt) =>
    set((s) => {
      if (s.prompt?.id === prompt?.id && s.prompt?.verb === prompt?.verb && s.prompt?.label === prompt?.label) return {}
      return { prompt }
    }),
  notify: (n) =>
    set((s) => ({
      notifications: [...s.notifications.slice(-3), { ...n, id: nextId++, createdAt: Date.now() }],
    })),
  dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  fizzle: (text) => set({ lastFizzle: { text, at: Date.now() } }),
}))
