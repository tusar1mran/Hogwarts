import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { audioEngine, type LoopHandle } from './AudioEngine'
import { registerSynthCues } from './cues'
import { MusicDirector } from './musicDirector'
import { events } from '../core/events'
import { runtime } from '../core/runtime'
import { useSettings } from '../state/settings'
import { useGame } from '../state/gameStore'
import { areaAt, FOREST, LAKE, towerById } from '../world/layout'
import { isAirborneFlightState } from '../flight/flightMachine'
import { combatState } from '../world/WorldItems'
import { getSpell } from '../spells/registry'
import { projectileAudio } from '../spells/SpellRuntime'

let cuesRegistered = false

/** Unlocks audio on the first user gesture anywhere on the page (autoplay policy). */
export function useAudioUnlock() {
  useEffect(() => {
    if (!cuesRegistered) {
      registerSynthCues(audioEngine)
      cuesRegistered = true
    }
    const unlock = () => audioEngine.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const audio = useSettings((s) => s.audio)
  useEffect(() => {
    audioEngine.setVolumes(audio)
  }, [audio])
}

/**
 * Bridges gameplay to audio: listener transform, music state with hysteresis, room reverb,
 * ambient beds by area, event-driven cues, flight wind and spatial ambience (bells, owls).
 */
export function AudioSystem() {
  const director = useRef(new MusicDirector())
  const beds = useRef<Record<string, LoopHandle | null>>({})
  const wind = useRef<LoopHandle | null>(null)
  const hums = useRef<Array<LoopHandle | null>>([null, null, null])
  const timers = useRef({ bell: 40, owl: 12, area: 0 })

  // Event -> cue routing.
  useEffect(() => {
    const play = audioEngine.play.bind(audioEngine)
    const offs = [
      events.on('footstep', (e) => play(`footstep-${e.surface}`, { position: e, volume: e.running ? 0.75 : 0.5, rate: e.running ? 1.08 : 1 })),
      events.on('player:jumped', () => play('robe', { volume: 0.7 })),
      events.on('player:landed', (e) => e.impact > 4 && play('land', { volume: Math.min(1, e.impact / 14), rate: e.impact > 10 ? 0.8 : 1 })),
      events.on('spell:cast', (e) => {
        play('wand-swish', { volume: 0.6 })
        play(getSpell(e.spellId).audio.cast)
      }),
      events.on('spell:fizzle', () => play('fizzle', { volume: 0.6 })),
      events.on('spell:hit', (e) => e.spellId === 'arc-bolt' && play('impact-spark', { position: e })),
      events.on('target:destroyed', () => play('target-break', { position: runtime.aim.point })),
      events.on('shield:block', () => play('shield-block')),
      events.on('shield:down', () => play('shield-down', { volume: 0.7 })),
      events.on('player:damaged', () => play('hurt')),
      events.on('door', (e) => play('door', { position: e })),
      events.on('flight:state', (e) => {
        if (e.to === 'Summoning') play('broom-summon')
        if (e.to === 'TakingOff') play('broom-takeoff')
        if (e.to === 'Dismounting') play('broom-land')
      }),
      events.on('flight:ring', () => play('ring')),
      events.on('secret:found', () => play('discovery')),
      events.on('rune:revealed', () => play('discovery')),
      events.on('ui:click', () => play('ui-click', { volume: 0.6 })),
      events.on('quest:completed', () => play('quest-complete')),
      events.on('quest:accepted', () => play('ui-open')),
    ]
    return () => offs.forEach((o) => o())
  }, [])


  useEffect(
    () => () => {
      Object.values(beds.current).forEach((b) => b?.stop())
      beds.current = {}
      wind.current?.stop()
      wind.current = null
      hums.current.forEach((h) => h?.stop())
      hums.current = [null, null, null]
    },
    [],
  )

  useFrame((_, dt) => {
    if (!audioEngine.ready) return
    const game = useGame.getState()
    const cam = runtime.camera
    audioEngine.setListener(cam.position, cam.forward)

    const p = runtime.player.position
    const flying = isAirborneFlightState(runtime.flight.state)
    const area = areaAt(p.x, p.y, p.z)
    const playing = game.phase === 'playing'

    const next = director.current.update(
      { phase: game.phase, area: area.id, flying, combat: playing && runtime.time < combatState.until },
      performance.now() / 1000,
    )
    if (next) audioEngine.setMusic(next)

    // Ambient beds (created lazily once audio is running).
    const b = beds.current
    b.wind ??= audioEngine.bed('wind', 'wind')
    b.crickets ??= audioEngine.bed('crickets', 'crickets')
    b.room ??= audioEngine.bed('room', 'room')
    b.water ??= audioEngine.bed('water', 'water')
    b.crackle ??= audioEngine.bed('crackle', 'crackle')
    const t = timers.current
    t.area -= dt
    if (t.area <= 0) {
      t.area = 0.3
      const outside = !area.interior
      const inForest = Math.hypot(p.x - FOREST.center[0], p.z - FOREST.center[1]) < FOREST.radius * 1.1
      const nearLake = Math.hypot(p.x - LAKE.center[0], p.z - LAKE.center[1]) < LAKE.radius + 40
      const scale = playing ? 1 : 0.6
      b.wind?.setLevel((outside ? 0.25 + Math.min(0.35, Math.max(0, p.y) * 0.004) : 0.03) * scale, outside ? 0.2 : 0)
      b.crickets?.setLevel(inForest ? 0.9 * scale : 0)
      b.room?.setLevel(area.interior ? 0.5 * scale : 0)
      b.water?.setLevel(nearLake ? 0.35 * scale : 0)
      b.crackle?.setLevel(area.id === 'grand-hall' ? 0.08 * scale : 0)
      audioEngine.setReverb(area.id === 'grand-hall' ? 1 : area.id === 'library' ? 0.55 : area.interior ? 0.4 : 0.05)
    }

    // Flight wind follows speed.
    if (flying) {
      wind.current ??= audioEngine.loop('wind')
      const k = Math.min(1, runtime.flight.speed / 40)
      wind.current?.setLevel(0.08 + k * 0.5, k)
    } else if (wind.current) {
      wind.current.stop()
      wind.current = null
    }

    // Projectile hum voices follow the nearest live bolts.
    for (let i = 0; i < hums.current.length; i++) {
      const live = i < projectileAudio.count
      if (live && !hums.current[i]) hums.current[i] = audioEngine.loop('hum', { position: projectileAudio.positions[i] })
      const h = hums.current[i]
      if (!h) continue
      if (live) {
        h.setPosition(projectileAudio.positions[i])
        h.setLevel(0.12, 0.5)
      } else h.setLevel(0)
    }

    if (!playing) return
    // Spatial ambience: bell tower and owls.
    t.bell -= dt
    if (t.bell <= 0) {
      t.bell = 90 + Math.random() * 30
      const bt = towerById('bell-tower')
      audioEngine.play('bell', { position: { x: bt.x, y: bt.height, z: bt.z }, bus: 'ambient', volume: 0.8 })
    }
    t.owl -= dt
    if (t.owl <= 0) {
      t.owl = 14 + Math.random() * 20
      if (!area.interior) {
        const a = Math.random() * Math.PI * 2
        audioEngine.play('owl', { position: { x: p.x + Math.cos(a) * 40, y: p.y + 12, z: p.z + Math.sin(a) * 40 }, bus: 'ambient', volume: 0.7 })
      }
    }
  })

  return null
}
