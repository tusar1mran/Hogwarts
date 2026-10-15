import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Terrain } from './terrain/Terrain'
import { Water } from './environment/Water'
import { Lighting } from './environment/Lighting'
import { AtmosphereClock, MoteField } from './environment/Atmosphere'
import { Courtyard } from './areas/Courtyard'
import { GrandHall } from './areas/GrandHall'
import { Library } from './areas/Library'
import { Bridge, ChapelRuin, FlightPlatform, Towers, TrainingYardStatic } from './areas/Outskirts'
import { Vegetation } from './areas/Vegetation'
import { WorldItems } from './WorldItems'
import { FlightRings } from '../flight/FlightRings'
import { NPCs } from '../npc/NPCs'

/**
 * The explorable world. Each area is a self-contained module positioned from layout.ts,
 * so new areas can be added here without touching rendering or physics setup.
 */
export function World() {
  return (
    <group>
      <AtmosphereClock />
      <Lighting />
      <Terrain />
      <Water />
      <Courtyard />
      <GrandHall />
      <Library />
      <Towers />
      <Bridge />
      <FlightPlatform />
      <TrainingYardStatic />
      <ChapelRuin />
      <Vegetation />
      <WorldItems />
      <FlightRings />
      <NPCs />
      {/* Drifting arcane motes around the castle silhouette. */}
      <MoteField center={[0, 4, -20]} size={[160, 70, 160]} count={500} color="#b9dcff" pointSize={0.22} speed={0.15} seed={2} intensity={0.55} />
    </group>
  )
}

/** Signals readiness once the scene has rendered a few frames (shaders compiled, physics live). */
export function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  const done = useRef(false)
  const compiling = useRef(false)
  const { gl, scene, camera } = useThree()
  useFrame(() => {
    if (done.current || compiling.current) return
    frames.current++
    if (frames.current === 2) {
      // Compile every shader program up front (in parallel where KHR_parallel_shader_compile
      // exists) so the first seconds of play do not stutter.
      compiling.current = true
      gl.compileAsync(scene, camera)
        .catch((err: unknown) => console.warn('[render] async shader compile failed; continuing', err))
        .finally(() => {
          compiling.current = false
          done.current = true
          onReady()
        })
    }
  })
  useEffect(() => () => {
    done.current = false
  }, [])
  return null
}
