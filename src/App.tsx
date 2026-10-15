import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useGame } from './game/state/gameStore'
import { buildMaterials } from './game/world/environment/materials'
import { useAudioUnlock } from './game/audio/AudioSystem'
import { input } from './game/input/InputManager'
import { useSettings } from './game/state/settings'
import { resumeGame } from './game/session'
import { MainMenu } from './ui/menus/MainMenu'
import { GameOverlays } from './ui/menus/GameMenus'
import { HUD } from './ui/hud/HUD'
import { DialoguePanel } from './ui/hud/DialoguePanel'
import { DebugOverlay } from './ui/common/DebugOverlay'
import { ErrorBoundary, FatalErrorScreen, LoadingScreen, SmallScreenNotice, detectWebGL } from './ui/common/Screens'

// The 3D runtime (three.js, rapier) is split into its own chunk and loaded after the shell.
const GameCanvas = lazy(() => import('./game/GameCanvas').then((m) => ({ default: m.GameCanvas })))

/** Keyboard shortcuts that work while menus are open (gameplay keys are handled by InputManager). */
function useMenuKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = useGame.getState()
      if (g.phase !== 'playing') return
      if (e.code === 'Escape') {
        if (g.overlay === 'pause') resumeGame()
        else if (g.overlay && g.overlay !== 'dialogue') g.openOverlay('pause')
        else if (g.overlay === null && !input.pointerLocked) g.pause()
        return
      }
      const b = useSettings.getState().controls.bindings
      const toggles = { spellbook: b.spellbook, journal: b.journal, inventory: b.inventory, map: b.map } as const
      for (const [overlay, codes] of Object.entries(toggles) as Array<[keyof typeof toggles, string[]]>) {
        if (!codes.includes(e.code)) continue
        if (g.overlay === overlay) resumeGame()
        else if (g.overlay === null || g.overlay === 'pause' || g.overlay === 'spellbook' || g.overlay === 'journal' || g.overlay === 'inventory' || g.overlay === 'map') g.openOverlay(overlay)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const phase = useGame((s) => s.phase)
  const worldReady = useGame((s) => s.worldReady)
  const loading = useGame((s) => s.loading)
  const fatal = useGame((s) => s.fatalError)
  const [materialsReady, setMaterialsReady] = useState(false)
  useAudioUnlock()
  useMenuKeys()

  // Boot: capability checks, then build the procedural material library.
  useEffect(() => {
    const g = useGame.getState()
    if (g.phase !== 'boot') return
    const gl = detectWebGL()
    if (!gl.ok) {
      g.setFatalError({ title: 'WebGL unavailable', message: 'Eldoria needs WebGL 2 to draw its world.', detail: `${gl.reason}\n\nTry an up-to-date Chrome, Edge or Firefox with hardware acceleration enabled.` })
      return
    }
    g.setPhase('loading')
    g.setLoading('Preparing materials', 0)
    buildMaterials((f, label) => useGame.getState().setLoading(label, f * 0.7))
      .then(() => {
        useGame.getState().setLoading('Raising the castle', 0.75)
        setMaterialsReady(true)
      })
      .catch((err) => g.setFatalError({ title: 'Loading failed', message: 'The world could not be prepared.', detail: String(err) }))
  }, [])

  const onReady = useCallback(() => {
    const g = useGame.getState()
    g.setLoading('Ready', 1)
    g.setWorldReady(true)
    if (g.phase === 'loading') g.setPhase('menu')
  }, [])

  const onContextLost = useCallback(() => {
    useGame.getState().setFatalError({
      title: 'Graphics context lost',
      message: 'The browser reset the graphics device (driver update, sleep or memory pressure). Reload to continue; progress is saved at checkpoints.',
    })
  }, [])

  if (fatal) return <FatalErrorScreen error={fatal} />

  return (
    <ErrorBoundary>
      {materialsReady && (
        <ErrorBoundary title="The 3D view failed to start">
          <Suspense fallback={null}>
            <GameCanvas onReady={onReady} onContextLost={onContextLost} />
          </Suspense>
        </ErrorBoundary>
      )}
      {phase === 'menu' && <MainMenu />}
      {phase === 'playing' && (
        <>
          <HUD />
          <DialoguePanel />
          <GameOverlays />
        </>
      )}
      <DebugOverlay />
      <LoadingScreen label={loading.label} progress={loading.progress} done={worldReady} />
      <SmallScreenNotice />
    </ErrorBoundary>
  )
}
