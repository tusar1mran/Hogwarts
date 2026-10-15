import { Suspense, useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { World, ReadySignal } from './world/World'
import { PlayerController } from './player/PlayerController'
import { PlayerAvatar } from './player/PlayerAvatar'
import { CameraRig, MenuCamera } from './camera/CameraRig'
import { SpellRuntime } from './spells/SpellRuntime'
import { GameClock, HudSync, InteractionSystem, PerfMonitor, ProgressTriggers } from './core/Systems'
import { AudioSystem } from './audio/AudioSystem'
import { input } from './input/InputManager'
import { useGame, isGameplayActive } from './state/gameStore'
import { useSettings } from './state/settings'
import { SPAWN } from './world/layout'

function PostFX() {
  const bloom = useSettings((s) => s.graphics.bloom)
  const quality = useSettings((s) => s.graphics.quality)
  if (!bloom) return null
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom mipmapBlur intensity={0.65} luminanceThreshold={0.95} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

/** Keeps the input manager and pointer lock in step with the game phase and overlays. */
function useInputBridge() {
  useEffect(() => {
    const apply = () => {
      const s = useGame.getState()
      const active = isGameplayActive(s)
      if (!active && input.enabled) input.reset()
      input.enabled = active
      if (!active && s.overlay !== null && s.overlay !== 'dialogue') input.releaseLock()
      if (s.overlay === 'dialogue') input.releaseLock()
    }
    apply()
    const unsubStore = useGame.subscribe(apply)
    const unsubLock = input.onPointerLock((locked) => {
      const s = useGame.getState()
      s.setPointerLocked(locked)
      if (locked) s.setNeedsClickToResume(false)
      // Losing pointer lock during gameplay (Esc, alt-tab) pauses the game.
      if (!locked && isGameplayActive(s)) s.pause()
    })
    return () => {
      unsubStore()
      unsubLock()
    }
  }, [])

  const bindings = useSettings((s) => s.controls.bindings)
  useEffect(() => input.setBindings(bindings), [bindings])
}

export function GameCanvas({ onReady, onContextLost }: { onReady: () => void; onContextLost: () => void }) {
  const phase = useGame((s) => s.phase)
  const overlay = useGame((s) => s.overlay)
  const resolutionScale = useSettings((s) => s.graphics.resolutionScale)
  const adaptive = useSettings((s) => s.graphics.adaptiveResolution)
  const shadows = useSettings((s) => s.graphics.shadows)
  const fov = useSettings((s) => s.graphics.fov)
  const [perfFactor, setPerfFactor] = useState(1)
  useInputBridge()

  const deviceDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const dpr = Math.max(0.5, deviceDpr * resolutionScale * (adaptive ? perfFactor : 1))
  const simulate = phase === 'playing' && (overlay === null || overlay === 'dialogue')

  const handleCreated = useCallback(
    ({ gl }: { gl: import('three').WebGLRenderer }) => {
      gl.toneMapping = ACESFilmicToneMapping
      gl.toneMappingExposure = 0.95
      gl.outputColorSpace = SRGBColorSpace
      input.attach(gl.domElement)
      gl.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        onContextLost()
      })
      // Clicking the canvas (re)acquires pointer lock during gameplay.
      gl.domElement.addEventListener('click', () => {
        const s = useGame.getState()
        if (isGameplayActive(s) && !input.pointerLocked) void input.requestLock()
      })
    },
    [onContextLost],
  )

  useEffect(() => () => input.detach(), [])

  return (
    <Canvas
      shadows={shadows ? 'soft' : false}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov, near: 0.1, far: 1800, position: [SPAWN.position[0], 6, SPAWN.position[2] + 8] }}
      onCreated={handleCreated}
      style={{ position: 'fixed', inset: 0 }}
      aria-label="Eldoria game view"
    >
      <color attach="background" args={['#1a1d2a']} />
      <PerformanceMonitor
        onChange={({ factor }) => setPerfFactor(0.6 + factor * 0.4)}
        flipflops={4}
        onFallback={() => setPerfFactor(0.6)}
      />
      <Suspense fallback={null}>
        <Physics timeStep="vary" paused={!simulate} gravity={[0, -9.81, 0]}>
          <GameClock />
          <World />
          <PlayerController />
          <PlayerAvatar />
          <CameraRig />
          <MenuCamera />
          <SpellRuntime />
          <InteractionSystem />
          <ProgressTriggers />
          <HudSync />
          <AudioSystem />
        </Physics>
        <PostFX />
        <PerfMonitor />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  )
}

