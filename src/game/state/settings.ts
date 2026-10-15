import { create } from 'zustand'
import { ACTIONS, DEFAULT_BINDINGS, type Action, type Bindings } from '../input/bindings'
import { clamp } from '../core/math'

export type QualityPreset = 'low' | 'medium' | 'high'

export interface GraphicsSettings {
  quality: QualityPreset
  shadows: boolean
  bloom: boolean
  /** Multiplier on device pixel ratio, 0.5 - 1. */
  resolutionScale: number
  adaptiveResolution: boolean
  fov: number
  /** Draw distance for fog and culling, metres. */
  viewDistance: number
  showDebug: boolean
}

export interface AudioSettings {
  master: number
  music: number
  sfx: number
  ambient: number
  muted: boolean
}

export interface ControlSettings {
  mouseSensitivity: number
  invertY: boolean
  cameraDistance: number
  bindings: Bindings
}

export interface Settings {
  graphics: GraphicsSettings
  audio: AudioSettings
  controls: ControlSettings
}

export const SETTINGS_VERSION = 1
export const SETTINGS_KEY = 'eldoria.settings'

export const QUALITY_PRESETS: Record<QualityPreset, Pick<GraphicsSettings, 'shadows' | 'bloom' | 'resolutionScale' | 'viewDistance'>> = {
  low: { shadows: false, bloom: false, resolutionScale: 0.7, viewDistance: 450 },
  medium: { shadows: true, bloom: true, resolutionScale: 0.85, viewDistance: 700 },
  high: { shadows: true, bloom: true, resolutionScale: 1, viewDistance: 1000 },
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: { quality: 'medium', ...QUALITY_PRESETS.medium, adaptiveResolution: true, fov: 60, showDebug: false },
  audio: { master: 0.8, music: 0.55, sfx: 0.8, ambient: 0.7, muted: false },
  controls: { mouseSensitivity: 1, invertY: false, cameraDistance: 5.5, bindings: DEFAULT_BINDINGS },
}

const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Coerce arbitrary (possibly corrupted or outdated) data into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const r = isObj(raw) ? raw : {}
  const g = isObj(r.graphics) ? r.graphics : {}
  const a = isObj(r.audio) ? r.audio : {}
  const c = isObj(r.controls) ? r.controls : {}
  const quality: QualityPreset = g.quality === 'low' || g.quality === 'high' || g.quality === 'medium' ? g.quality : d.graphics.quality
  const rawBindings = isObj(c.bindings) ? c.bindings : {}
  const bindings = {} as Bindings
  for (const action of ACTIONS) {
    const v = rawBindings[action]
    bindings[action] =
      Array.isArray(v) && v.every((k) => typeof k === 'string') && v.length <= 2 ? (v as string[]) : [...DEFAULT_BINDINGS[action]]
  }
  return {
    graphics: {
      quality,
      shadows: bool(g.shadows, d.graphics.shadows),
      bloom: bool(g.bloom, d.graphics.bloom),
      resolutionScale: num(g.resolutionScale, d.graphics.resolutionScale, 0.5, 1),
      adaptiveResolution: bool(g.adaptiveResolution, d.graphics.adaptiveResolution),
      fov: num(g.fov, d.graphics.fov, 45, 90),
      viewDistance: num(g.viewDistance, d.graphics.viewDistance, 250, 1200),
      showDebug: bool(g.showDebug, d.graphics.showDebug),
    },
    audio: {
      master: num(a.master, d.audio.master, 0, 1),
      music: num(a.music, d.audio.music, 0, 1),
      sfx: num(a.sfx, d.audio.sfx, 0, 1),
      ambient: num(a.ambient, d.audio.ambient, 0, 1),
      muted: bool(a.muted, d.audio.muted),
    },
    controls: {
      mouseSensitivity: num(c.mouseSensitivity, d.controls.mouseSensitivity, 0.2, 3),
      invertY: bool(c.invertY, d.controls.invertY),
      cameraDistance: num(c.cameraDistance, d.controls.cameraDistance, 3, 9),
      bindings,
    },
  }
}

function loadSettings(): Settings {
  try {
    const text = globalThis.localStorage?.getItem(SETTINGS_KEY)
    if (!text) return DEFAULT_SETTINGS
    const parsed = JSON.parse(text) as { version?: unknown; settings?: unknown }
    if (parsed.version !== SETTINGS_VERSION) {
      console.warn('[settings] stored settings are from another version; applying compatible values only')
    }
    return sanitizeSettings(parsed.settings)
  } catch (err) {
    console.warn('[settings] could not read stored settings, using defaults', err)
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: Settings) {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: s }))
  } catch {
    // Storage may be full or disabled (private mode); settings still apply for this session.
  }
}

interface SettingsStore extends Settings {
  setGraphics: (patch: Partial<GraphicsSettings>) => void
  applyQualityPreset: (q: QualityPreset) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  setControls: (patch: Partial<Omit<ControlSettings, 'bindings'>>) => void
  setBinding: (action: Action, slot: number, code: string | null) => void
  resetBindings: () => void
  resetAll: () => void
}

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = () => {
    const { graphics, audio, controls } = get()
    saveSettings({ graphics, audio, controls })
  }
  return {
    ...loadSettings(),
    setGraphics: (patch) => {
      set((s) => ({ graphics: { ...s.graphics, ...patch } }))
      persist()
    },
    applyQualityPreset: (q) => {
      set((s) => ({ graphics: { ...s.graphics, quality: q, ...QUALITY_PRESETS[q] } }))
      persist()
    },
    setAudio: (patch) => {
      set((s) => ({ audio: { ...s.audio, ...patch } }))
      persist()
    },
    setControls: (patch) => {
      set((s) => ({ controls: { ...s.controls, ...patch } }))
      persist()
    },
    setBinding: (action, slot, code) => {
      set((s) => {
        const current = [...s.controls.bindings[action]]
        if (code === null) current.splice(slot, 1)
        else current[Math.min(slot, current.length)] = code
        const next = current.filter(Boolean).slice(0, 2)
        return { controls: { ...s.controls, bindings: { ...s.controls.bindings, [action]: next } } }
      })
      persist()
    },
    resetBindings: () => {
      set((s) => ({ controls: { ...s.controls, bindings: DEFAULT_BINDINGS } }))
      persist()
    },
    resetAll: () => {
      set({ ...DEFAULT_SETTINGS })
      persist()
    },
  }
})
