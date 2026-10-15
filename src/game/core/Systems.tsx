import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { runtime } from './runtime'
import { events } from './events'
import { input } from '../input/InputManager'
import { useGame, isGameplayActive } from '../state/gameStore'
import { useHud } from '../state/hudStore'
import { useProgression } from '../state/progressionStore'
import { findInteractable } from '../interaction/interactables'
import { AREAS, FLIGHT_PLATFORM, FLIGHT_RINGS, SECRETS, WILDS, areaAt, type AreaId } from '../world/layout'
import { terrainHeight } from '../world/terrain/heightfield'
import { ringCourseInUse } from '../quests/questEngine'

/** Advances the game clock only while gameplay is simulated (paused menus freeze time). */
export function GameClock() {
  useFrame((_, dt) => {
    const g = useGame.getState()
    if (g.phase === 'playing' && (g.overlay === null || g.overlay === 'dialogue')) {
      runtime.time += Math.min(dt, 0.1)
      runtime.frame++
    }
  })
  return null
}

const _forward = new Vector3()

/** Finds the interactable in front of the player, shows the prompt and handles the interact key. */
export function InteractionSystem() {
  const current = useRef<string | null>(null)
  useEffect(() => {
    const unsub = input.onPress((action) => {
      if (action !== 'interact' || !isGameplayActive(useGame.getState())) return
      if (!current.current) return
      const p = runtime.player
      _forward.set(-Math.sin(p.facing), 0, -Math.cos(p.facing))
      const target = findInteractable(p.position, _forward)
      if (target) {
        events.emit({ type: 'interact', id: target.id })
        target.onInteract()
      }
    })
    return () => {
      unsub()
    }
  }, [])

  const timer = useRef(0)
  useFrame((_, dt) => {
    timer.current -= dt
    if (timer.current > 0) return
    timer.current = 0.1
    const g = useGame.getState()
    const hud = useHud.getState()
    if (!isGameplayActive(g) || runtime.flight.state !== 'Grounded') {
      current.current = null
      hud.setPrompt(null)
      return
    }
    const p = runtime.player
    _forward.set(-Math.sin(p.facing), 0, -Math.cos(p.facing))
    const target = findInteractable(p.position, _forward)
    current.current = target?.id ?? null
    hud.setPrompt(target ? { id: target.id, verb: target.verb, label: target.label } : null)
  })
  return null
}

const CHECKPOINTS: Partial<Record<AreaId, { position: [number, number, number]; yaw: number; label: string }>> = {
  courtyard: { position: [0, 0.2, 40], yaw: 0, label: 'Entrance Courtyard' },
  'training-yard': { position: [36, 0.2, 25], yaw: -Math.PI / 2, label: 'Practice Grounds' },
  'flight-platform': { position: [FLIGHT_PLATFORM.center[0] + 4, FLIGHT_PLATFORM.height + 0.2, FLIGHT_PLATFORM.center[1]], yaw: Math.PI / 2, label: 'Skyward Platform' },
  library: { position: [-31, 0.2, -17], yaw: 0, label: 'Starlit Library' },
  'grand-hall': { position: [0, 0.2, -6], yaw: 0, label: 'Grand Hall' },
}

/** Secrets, named locations, checkpoints, autosave and play time. */
export function ProgressTriggers() {
  const timer = useRef(0)
  const autosave = useRef(0)
  const secretHeights = useRef(SECRETS.map((s) => (s.position[1] === 0 ? terrainHeight(s.position[0], s.position[2]) : s.position[1])))
  const onPlatform = useRef(false)

  useEffect(
    () =>
      events.on('area:changed', (e) => {
        const area = AREAS.find((a) => a.id === e.areaId) ?? WILDS
        useHud.getState().patch({ areaName: area.name })
        const cp = CHECKPOINTS[area.id]
        const prog = useProgression.getState()
        if (cp && prog.progression.checkpoint?.label !== cp.label) prog.setCheckpoint(cp)
      }),
    [],
  )

  useFrame((_, dt) => {
    const g = useGame.getState()
    if (g.phase !== 'playing' || g.overlay !== null) return
    autosave.current += dt
    timer.current -= dt
    if (autosave.current > 30) {
      const prog = useProgression.getState()
      prog.addPlayTime(autosave.current)
      prog.save()
      autosave.current = 0
    }
    if (timer.current > 0) return
    timer.current = 0.25
    const p = runtime.player.position
    const prog = useProgression.getState()

    SECRETS.forEach((s, i) => {
      if (prog.progression.secretsFound.includes(s.id)) return
      const dx = p.x - s.position[0]
      const dz = p.z - s.position[2]
      const dy = p.y - secretHeights.current[i]
      if (dx * dx + dz * dz < s.radius * s.radius && Math.abs(dy) < Math.max(3, s.radius)) {
        if (prog.markSecret(s.id)) {
          events.emit({ type: 'secret:found', secretId: s.id })
          useHud.getState().notify({ kind: 'discovery', title: `Discovered: ${s.name}`, body: '+50 XP' })
        }
      }
    })

    // Landing on the Skyward Platform.
    const [cx, cz] = FLIGHT_PLATFORM.center
    const nowOn = runtime.player.grounded && runtime.flight.state === 'Grounded' && Math.hypot(p.x - cx, p.z - cz) < FLIGHT_PLATFORM.radius + 0.5 && p.y > FLIGHT_PLATFORM.height - 0.2
    if (nowOn && !onPlatform.current) {
      prog.dispatch({ type: 'reach', locationId: 'flight-platform' })
      events.emit({ type: 'location:reached', locationId: 'flight-platform' })
      const after = useProgression.getState()
      // Restart the ring challenge once the course is complete and the quest no longer needs it.
      if (after.progression.ringsCollected.length === FLIGHT_RINGS.length && !ringCourseInUse(after.progression)) {
        after.resetRings()
        useHud.getState().notify({ kind: 'info', title: 'Ring course reset', body: 'The rings glow again. Fly the course once more!' })
      }
    }
    onPlatform.current = nowOn
  })
  return null
}

/** Copies high-frequency runtime values into the HUD store at 10 Hz. */
export function HudSync() {
  const timer = useRef(0)
  useFrame((_, dt) => {
    timer.current -= dt
    if (timer.current > 0) return
    timer.current = 0.1
    const p = runtime.player
    const f = runtime.flight
    useHud.getState().patch({
      health: Math.round(p.health),
      maxHealth: p.maxHealth,
      flightState: f.state,
      flightSpeed: Math.round(f.speed * 3.6),
      altitude: Math.round(f.altitude),
      heading: runtime.camera.yaw,
      playerX: p.position.x,
      playerZ: p.position.z,
      playerFacing: p.facing,
    })
  })
  useEffect(() => {
    const area = areaAt(runtime.player.position.x, runtime.player.position.y, runtime.player.position.z)
    useHud.getState().patch({ areaName: area.name })
  }, [])
  return null
}

/** Samples frame time and renderer statistics for the debug overlay. */
export function PerfMonitor() {
  const { gl } = useThree()
  const acc = useRef({ frames: 0, time: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.time += dt
    if (a.time >= 0.5) {
      runtime.perf.fps = a.frames / a.time
      runtime.perf.frameMs = (a.time / a.frames) * 1000
      a.frames = 0
      a.time = 0
      const info = gl.info
      runtime.perf.drawCalls = info.render.calls
      runtime.perf.triangles = info.render.triangles
      runtime.perf.geometries = info.memory.geometries
      runtime.perf.textures = info.memory.textures
      runtime.perf.dpr = gl.getPixelRatio()
    }
  })
  return null
}
