import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { AdditiveBlending, Color, Group, Mesh, MeshStandardMaterial, ShaderMaterial, Vector3 } from 'three'
import { getMaterials } from './environment/materials'
import { scaledBox, solidCylinder, ring } from './architecture/geometry'
import { registerEntity, bodyColliderHandles } from '../entities/registry'
import { registerInteractable } from '../interaction/interactables'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { useProgression } from '../state/progressionStore'
import { useHud } from '../state/hudStore'
import { useGame } from '../state/gameStore'
import { questStatus } from '../quests/questEngine'
import { damagePlayer } from '../player/playerActions'
import { spellState } from '../spells/SpellRuntime'
import { terrainHeight } from './terrain/heightfield'
import { LIBRARY_BALCONY_Y } from './layout'
import { timeUniform } from './environment/Atmosphere'

type V3 = [number, number, number]

/** Global combat flag for music: set while the sentinel is engaging the player. */
export const combatState = { until: 0 }

/* ------------------------------------------------------------------------------------------ */
/* Practice targets                                                                             */
/* ------------------------------------------------------------------------------------------ */

const TARGETS: V3[] = [
  [56, 0, 8],
  [62, 0, 14],
  [64, 0, 24],
  [60, 0, 34],
  [54, 0, 40],
]

function PracticeTarget({ id, position }: { id: string; position: V3 }) {
  const mats = getMaterials()
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const face = useRef<Mesh>(null)
  const [broken, setBroken] = useState(false)
  const s = useRef({ hp: 3, wobble: 0, wobbleV: 0, flash: 0, respawnAt: 0, rise: 1 })
  const sessionId = useGame((st) => st.sessionId)
  const faceMat = useMemo(() => new MeshStandardMaterial({ color: '#d8c7a0', emissive: new Color('#ff9a40'), emissiveIntensity: 0, roughness: 0.8 }), [])
  useEffect(() => () => faceMat.dispose(), [faceMat])

  useEffect(() => {
    s.current.hp = 3
    setBroken(false)
  }, [sessionId])

  useEffect(() => {
    if (broken) return
    const center = new Vector3(position[0], position[1] + 1.4, position[2])
    return registerEntity(
      {
        id,
        kind: 'practice-target',
        getPosition: (out) => out.copy(center),
        onSpellHit: (hit) => {
          const st = s.current
          st.wobbleV += 6
          st.flash = 1
          if (hit.spell.id === 'arc-bolt') {
            useProgression.getState().dispatch({ type: 'spellHit', spellId: 'arc-bolt', targetKind: 'practice-target' })
            st.hp -= 1
            if (st.hp <= 0) {
              st.respawnAt = runtime.time + 6
              events.emit({ type: 'target:destroyed', entityId: id })
              setBroken(true)
            }
          }
        },
      },
      bodyColliderHandles(body.current),
    )
  }, [broken, id, position])

  useFrame((_, dt) => {
    const st = s.current
    if (broken && runtime.time > st.respawnAt) {
      st.hp = 3
      st.rise = 0
      setBroken(false)
    }
    st.wobbleV += -st.wobble * 60 * dt - st.wobbleV * 6 * dt
    st.wobble += st.wobbleV * dt
    st.flash = Math.max(0, st.flash - dt * 3)
    st.rise = Math.min(1, st.rise + dt * 1.5)
    if (visual.current) {
      visual.current.rotation.x = st.wobble * 0.08
      visual.current.position.y = (1 - st.rise) * -2.2
    }
    faceMat.emissiveIntensity = st.flash * 3
  })

  return (
    <group position={position}>
      {/* Base stays when the dummy shatters. */}
      <mesh position={[0, 0.15, 0]} geometry={solidCylinder(0.7, 0.8, 0.3, 14)} material={mats.stoneDark} receiveShadow />
      {!broken && (
        <RigidBody ref={body} type="fixed" colliders={false}>
          <group ref={visual}>
            <mesh position={[0, 1.1, 0]} geometry={solidCylinder(0.09, 0.09, 1.8, 8)} material={mats.wood} castShadow />
            <mesh position={[0, 1.65, 0]} geometry={scaledBox(1.1, 0.12, 0.12, 1)} material={mats.wood} castShadow />
            <mesh ref={face} position={[0, 1.95, 0]} rotation-x={Math.PI / 2} material={faceMat} castShadow>
              <cylinderGeometry args={[0.45, 0.45, 0.12, 20]} />
            </mesh>
            {[0.3, 0.18].map((r) => (
              <mesh key={r} position={[0, 1.95, -0.065]} geometry={ring(r, 0.025)}>
                <meshStandardMaterial color="#8a2a20" />
              </mesh>
            ))}
          </group>
          <CylinderCollider args={[1.2, 0.5]} position={[0, 1.3, 0]} />
        </RigidBody>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Movable crates (Force Wave / Mystic Pull)                                                    */
/* ------------------------------------------------------------------------------------------ */

const CRATES: Array<{ position: V3; size: number }> = [
  { position: [44, 1, 10], size: 1 },
  { position: [45.3, 1, 10.4], size: 0.9 },
  { position: [44.6, 2.2, 10.2], size: 0.8 },
  { position: [52, 1, 30], size: 1.1 },
  { position: [40, 1, 36], size: 0.9 },
  { position: [58, 1, 18], size: 1 },
  { position: [48, 1, 18], size: 0.7 },
  { position: [70, 1, 8], size: 1.2 },
]

function Crate({ id, position, size }: { id: string; position: V3; size: number }) {
  const mats = getMaterials()
  const body = useRef<RapierRigidBody>(null)
  const sessionId = useGame((s) => s.sessionId)
  const home = useMemo(() => new Vector3(...position), [position])

  useEffect(() => {
    const b = body.current
    if (!b) return
    b.setTranslation(home, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  }, [sessionId, home])

  useEffect(() => {
    const b = body.current
    return registerEntity(
      {
        id,
        kind: 'crate',
        pushable: true,
        pullable: true,
        body: b,
        getPosition: (out) => {
          const t = body.current?.translation()
          return t ? out.set(t.x, t.y, t.z) : out.copy(home)
        },
      },
      bodyColliderHandles(b),
    )
  }, [id, home])

  // Crates knocked out of the world return home.
  useFrame(() => {
    const b = body.current
    if (b && b.translation().y < -40) {
      b.setTranslation(home, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
  })

  return (
    <RigidBody ref={body} position={position} colliders={false} mass={size * 18} linearDamping={0.4} angularDamping={0.6} ccd>
      <mesh geometry={scaledBox(size, size, size, size)} material={mats.wood} castShadow receiveShadow />
      <mesh geometry={scaledBox(size * 1.02, size * 0.12, size * 1.02, 1)} material={mats.iron} position={[0, size * 0.38, 0]} />
      <mesh geometry={scaledBox(size * 1.02, size * 0.12, size * 1.02, 1)} material={mats.iron} position={[0, -size * 0.38, 0]} />
      <CuboidCollider args={[size / 2, size / 2, size / 2]} friction={0.8} />
    </RigidBody>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Warding sentinel: fires slow orbs at the player; Aegis Shield blocks them                    */
/* ------------------------------------------------------------------------------------------ */

const SENTINEL_POS = new Vector3(77, 0, 41)
const ENGAGE_RANGE = 15
const _toPlayer = new Vector3()
const _homing = new Vector3()
const _orbDir = new Vector3()

function Sentinel() {
  const mats = getMaterials()
  const body = useRef<RapierRigidBody>(null)
  const eye = useRef<Mesh>(null)
  const orbs = useRef<Array<{ active: boolean; pos: Vector3; vel: Vector3; age: number; mesh: Mesh | null }>>(
    Array.from({ length: 6 }, () => ({ active: false, pos: new Vector3(), vel: new Vector3(), age: 0, mesh: null })),
  )
  const st = useRef({ hp: 5, disabledUntil: 0, nextShot: 0 })
  const ownHandles = useRef<number[]>([])
  const sessionId = useGame((s) => s.sessionId)
  const { world, rapier } = useRapier()
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier])
  const eyeMat = useMemo(() => new MeshStandardMaterial({ color: '#ffb0a0', emissive: new Color('#ff5a3c'), emissiveIntensity: 3, toneMapped: false }), [])
  const orbMat = useMemo(
    () => new ShaderMaterial({
      uniforms: { uTime: timeUniform },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)),1.5); vec3 c = mix(vec3(1.0,0.4,0.25), vec3(1.0,0.85,0.6), 1.0-f); gl_FragColor = vec4(c*(1.5+0.5*sin(uTime*20.0)), 0.9); }',
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    [],
  )
  useEffect(() => () => { eyeMat.dispose(); orbMat.dispose() }, [eyeMat, orbMat])

  useEffect(() => {
    st.current = { hp: 5, disabledUntil: 0, nextShot: 0 }
    orbs.current.forEach((o) => (o.active = false))
  }, [sessionId])

  useEffect(() => {
    ownHandles.current = bodyColliderHandles(body.current)
    return registerEntity(
        {
          id: 'sentinel',
          kind: 'sentinel',
          getPosition: (out) => out.copy(SENTINEL_POS).setY(3),
          onSpellHit: (hit) => {
            const s = st.current
            if (runtime.time < s.disabledUntil) return
            if (hit.spell.id === 'arc-bolt') s.hp -= 1
            if (hit.spell.id === 'force-wave') {
              // The wave disperses incoming orbs.
              orbs.current.forEach((o) => {
                if (o.active && o.pos.distanceTo(runtime.player.position) < hit.spell.range) o.active = false
              })
            }
            if (s.hp <= 0) {
              s.disabledUntil = runtime.time + 25
              s.hp = 5
              useHud.getState().notify({ kind: 'info', title: 'Sentinel subdued', body: 'It will reawaken shortly.' })
            }
          },
        },
        ownHandles.current,
      )
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const now = runtime.time
    const disabled = now < s.disabledUntil
    const playing = useGame.getState().phase === 'playing' && useGame.getState().overlay === null
    eyeMat.emissiveIntensity = disabled ? 0.2 : 2.5 + Math.sin(now * 4) * 0.8
    if (eye.current) {
      eye.current.position.y = 3.3 + Math.sin(now * 1.5) * 0.15
      eye.current.rotation.y += dt * (disabled ? 0.2 : 1.5)
    }
    const toPlayer = _toPlayer.copy(runtime.player.position).setY(runtime.player.position.y + 1.1)
    const dist = toPlayer.distanceTo(SENTINEL_POS)
    if (playing && !disabled && dist < ENGAGE_RANGE) {
      combatState.until = now + 5
      if (now > s.nextShot) {
        s.nextShot = now + 2.6
        const o = orbs.current.find((x) => !x.active)
        if (o) {
          o.active = true
          o.age = 0
          o.pos.copy(SENTINEL_POS).setY(3.3)
          o.vel.subVectors(toPlayer, o.pos).normalize().multiplyScalar(11)
        }
      }
    }
    for (const o of orbs.current) {
      if (o.mesh) o.mesh.visible = o.active
      if (!o.active) continue
      o.age += dt
      // Gentle homing makes the shield the reliable answer, not side-stepping alone.
      _homing.subVectors(toPlayer, o.pos).normalize().multiplyScalar(11)
      o.vel.lerp(_homing, Math.min(1, dt * 0.8))
      const step = o.vel.length() * dt
      ray.origin = o.pos
      ray.dir = _orbDir.copy(o.vel).normalize()
      const hit = world.castRay(ray, step, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => c.handle !== runtime.player.colliderHandle && !ownHandles.current.includes(c.handle))
      o.pos.addScaledVector(o.vel, dt)
      if (o.pos.distanceTo(toPlayer) < (now < runtime.player.shieldUntil ? 1.5 : 0.8)) {
        damagePlayer(15)
        o.active = false
      } else if (hit || o.age > 6) {
        o.active = false
      }
      if (o.mesh) o.mesh.position.copy(o.pos)
    }
  })

  return (
    <group>
      <RigidBody ref={body} type="fixed" colliders={false} position={[SENTINEL_POS.x, 0, SENTINEL_POS.z]}>
        <mesh position={[0, 1.2, 0]} geometry={solidCylinder(0.55, 0.9, 2.4, 6)} material={mats.stoneDark} castShadow />
        <mesh position={[0, 2.5, 0]} geometry={solidCylinder(0.8, 0.55, 0.3, 6)} material={mats.stoneTrim} castShadow />
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.9, 3.3, Math.sin((i / 3) * Math.PI * 2) * 0.9]} geometry={scaledBox(0.15, 1.1, 0.15, 1)} material={mats.iron} />
        ))}
        <CylinderCollider args={[1.7, 0.9]} position={[0, 1.7, 0]} />
        <CuboidCollider args={[0.6, 0.6, 0.6]} position={[0, 3.3, 0]} />
      </RigidBody>
      <mesh ref={eye} position={[SENTINEL_POS.x, 3.3, SENTINEL_POS.z]} material={eyeMat}>
        <octahedronGeometry args={[0.45, 0]} />
      </mesh>
      {orbs.current.map((o, i) => (
        <mesh key={i} ref={(m) => { o.mesh = m }} visible={false} material={orbMat}>
          <sphereGeometry args={[0.35, 14, 10]} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Collectables                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function Codex() {
  const mats = getMaterials()
  const ref = useRef<Group>(null)
  const artifacts = useProgression((s) => s.progression.artifacts)
  const collected = artifacts.includes('astral-codex')
  const position = useMemo(() => new Vector3(-43.3, LIBRARY_BALCONY_Y + 1.05, -40.2), [])
  const bookMat = useMemo(() => new MeshStandardMaterial({ color: '#1b2350', emissive: new Color('#3a5cff'), emissiveIntensity: 0.6, roughness: 0.5 }), [])
  useEffect(() => () => bookMat.dispose(), [bookMat])

  useEffect(() => {
    if (collected) return
    const take = () => {
      const p = useProgression.getState()
      if (questStatus(p.progression, 'lost-archive') !== 'active') {
        useHud.getState().notify({ kind: 'info', title: 'Astral Codex', body: 'A star-chart bound in midnight vellum. Someone in the library must be missing it.' })
        return
      }
      p.addArtifact('astral-codex')
    }
    const unInteract = registerInteractable({ id: 'codex', position, radius: 2.2, verb: 'Take', label: 'Astral Codex', onInteract: take })
    const unEntity = registerEntity(
      {
        id: 'codex',
        kind: 'codex',
        pullable: true,
        getPosition: (out) => out.copy(position),
        onSpellHit: (hit) => {
          if (hit.spell.id === 'mystic-pull') take()
        },
      },
      [],
    )
    return () => {
      unInteract()
      unEntity()
    }
  }, [collected, position])

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.004
      ref.current.position.y = position.y + Math.sin(runtime.time * 1.6) * 0.04
    }
  })

  if (collected) return null
  return (
    <group ref={ref} position={position}>
      <mesh geometry={scaledBox(0.42, 0.1, 0.32, 0.4)} material={bookMat} castShadow />
      <mesh geometry={scaledBox(0.44, 0.02, 0.34, 0.4)} material={mats.brass} position={[0, 0.06, 0]} />
    </group>
  )
}

const RUNES: Array<{ id: string; position: V3; rotationY: number }> = [
  { id: 'rune-library', position: [-44.9, LIBRARY_BALCONY_Y + 2.2, -39.2], rotationY: Math.PI / 2 },
  { id: 'rune-shrine', position: [215, 0, -95], rotationY: 0 },
]

/** Spectral rune: invisible until a Luminous Orb floats close enough. */
function Rune({ id, position, rotationY }: { id: string; position: V3; rotationY: number }) {
  const revealed = useProgression((s) => s.progression.runesRevealed.includes(id))
  const pos = useMemo(() => {
    const p = new Vector3(...position)
    if (id === 'rune-shrine') p.y = terrainHeight(p.x, p.z) + 1.2
    return p
  }, [id, position])
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: '#c9f0ff', emissive: new Color('#6fd6ff'), emissiveIntensity: 3, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  const shown = useRef(revealed ? 1 : 0)

  useFrame((_, dt) => {
    let near = false
    for (const o of spellState.orbs) if (o.active && o.position.distanceTo(pos) < 7) near = true
    const target = near || revealed ? 1 : 0
    shown.current += (target - shown.current) * Math.min(1, dt * 2)
    mat.opacity = shown.current * (0.75 + Math.sin(runtime.time * 2) * 0.2)
    if (!revealed && shown.current > 0.7) {
      if (useProgression.getState().markRune(id)) {
        events.emit({ type: 'rune:revealed', runeId: id })
        useHud.getState().notify({ kind: 'discovery', title: 'Spectral rune revealed', body: '+40 XP. The light shows what the dark concealed.' })
      }
    }
  })

  return (
    <group position={pos} rotation-y={rotationY}>
      <mesh material={mat} geometry={ring(0.7, 0.05)} />
      <mesh material={mat} geometry={ring(0.45, 0.03)} />
      <mesh material={mat} rotation-z={Math.PI / 4} geometry={scaledBox(0.08, 1.2, 0.02, 1)} />
      <mesh material={mat} rotation-z={-Math.PI / 4} geometry={scaledBox(0.08, 1.2, 0.02, 1)} />
    </group>
  )
}

function ShrineEmber() {
  const collected = useProgression((s) => s.progression.artifacts.includes('shrine-ember'))
  const pos = useMemo(() => new Vector3(215, terrainHeight(215, -95) + 2.2, -95), [])
  useEffect(() => {
    if (collected) return
    return registerInteractable({
      id: 'shrine-ember',
      position: pos,
      radius: 3,
      verb: 'Take',
      label: 'Shrine Ember',
      onInteract: () => useProgression.getState().addArtifact('shrine-ember'),
    })
  }, [collected, pos])
  return null
}

export function WorldItems() {
  return (
    <group>
      {TARGETS.map((p, i) => (
        <PracticeTarget key={i} id={`target-${i}`} position={p} />
      ))}
      {CRATES.map((c, i) => (
        <Crate key={i} id={`crate-${i}`} position={c.position} size={c.size} />
      ))}
      <Sentinel />
      <Codex />
      <ShrineEmber />
      {RUNES.map((r) => (
        <Rune key={r.id} {...r} />
      ))}
    </group>
  )
}

export { CRATES, TARGETS }
