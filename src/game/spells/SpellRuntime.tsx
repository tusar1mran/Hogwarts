import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { AdditiveBlending, BackSide, Color, Group, Mesh, PointLight, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { input } from '../input/InputManager'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { useGame, isGameplayActive } from '../state/gameStore'
import { useHud } from '../state/hudStore'
import { useProgression } from '../state/progressionStore'
import { getMaterials } from '../world/environment/materials'
import { allEntities, entityById, entityForCollider, type GameEntity } from '../entities/registry'
import { applyCast, canCast, createCaster, refundCast, regenerate, type CasterState } from './spellSystem'
import { SPELLS, findSpell, getSpell, type SpellContext, type SpellDef } from './registry'
import { GlowSpritePool, ParticlePool, RingPool } from './effects'
import { CAPSULE_CENTER, CAPSULE_HALF, CAPSULE_RADIUS } from '../player/PlayerController'
import { teleportPlayer } from '../player/playerActions'
import { isAirborneFlightState } from '../flight/flightMachine'
import { timeUniform } from '../world/environment/Atmosphere'

/** Shared spell state, read by the HUD, runes and tests. */
export const spellState = {
  caster: createCaster() as CasterState,
  selected: 'arc-bolt',
  orbs: Array.from({ length: 2 }, () => ({ active: false, position: new Vector3(), born: 0, duration: 1 })),
}

/** Positions of up to three live projectiles, for spatial hum voices. */
export const projectileAudio = { count: 0, positions: [new Vector3(), new Vector3(), new Vector3()] }

export function selectSpell(id: string): boolean {
  const spell = findSpell(id)
  if (!spell) return false
  if (!useProgression.getState().progression.unlockedSpells.includes(id)) {
    useHud.getState().fizzle(`You have not learned ${spell.name} yet.`)
    return false
  }
  spellState.selected = id
  useHud.getState().patch({ selectedSpell: id })
  return true
}

export function resetSpellState() {
  spellState.caster = createCaster()
  spellState.orbs.forEach((o) => (o.active = false))
  runtime.player.shieldUntil = 0
}

const MAX_PROJECTILES = 24
const TRAIL = 10
const FLIGHT_ALLOWED = new Set(['arc-bolt', 'aegis-shield', 'luminous-orb'])

interface Projectile {
  active: boolean
  spell: SpellDef
  pos: Vector3
  vel: Vector3
  travelled: number
  trail: Vector3[]
  trailHead: number
  color: Color
}

interface Tether {
  active: boolean
  entity: GameEntity | null
  until: number
  spell: SpellDef | null
}

const _v = new Vector3()
const _v2 = new Vector3()
const _up = new Vector3(0, 1, 0)
const _dir = new Vector3()

/**
 * Executes spells: input -> validation (mana/cooldown/unlock) -> registry handler -> effects.
 * All effects are pooled; nothing is allocated per cast in steady state.
 */
export function SpellRuntime() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const mats = getMaterials()
  const group = useRef<Group>(null)

  const fx = useMemo(() => {
    const sprites = new GlowSpritePool(mats.glow, 1000)
    const particles = new ParticlePool(700)
    return { sprites, particles }
  }, [mats.glow])
  const rings = useRef<RingPool | null>(null)

  const projectiles = useMemo<Projectile[]>(
    () =>
      Array.from({ length: MAX_PROJECTILES }, () => ({
        active: false,
        spell: SPELLS[0],
        pos: new Vector3(),
        vel: new Vector3(),
        travelled: 0,
        trail: Array.from({ length: TRAIL }, () => new Vector3()),
        trailHead: 0,
        color: new Color(),
      })),
    [],
  )
  const tether = useRef<Tether>({ active: false, entity: null, until: 0, spell: null })
  const lights = useRef<PointLight[]>([])
  const orbLights = useRef<PointLight[]>([])
  const flashes = useRef<Array<{ until: number; peak: number; duration: number }>>([])
  const shieldMesh = useRef<Mesh>(null)
  const shieldWasUp = useRef(false)
  const syncTimer = useRef(0)
  const orbMeshes = useRef<Mesh[]>([])

  const shieldMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: timeUniform, uColor: { value: new Color('#7fe3c4') }, uStrength: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            vPos = position;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; uniform float uStrength;
          varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
          void main() {
            float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
            float hex = 0.5 + 0.5 * sin(vPos.y * 28.0 + uTime * 3.0) * sin(atan(vPos.z, vPos.x) * 12.0);
            float band = smoothstep(0.92, 1.0, sin(vPos.y * 6.0 - uTime * 4.0));
            float a = (fres * 0.85 + hex * 0.08 + band * 0.25) * uStrength;
            gl_FragColor = vec4(uColor * (0.6 + fres * 1.6), a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
        toneMapped: false,
      }),
    [],
  )
  const shieldGeometry = useMemo(() => new SphereGeometry(1, 32, 20), [])
  const orbGeometry = useMemo(() => new SphereGeometry(1, 16, 12), [])

  useEffect(() => {
    const g = group.current
    if (!g) return
    g.add(fx.sprites.mesh)
    rings.current = new RingPool(g, 12)
    return () => {
      fx.sprites.mesh.removeFromParent()
      rings.current?.dispose()
      rings.current = null
    }
  }, [fx])

  useEffect(
    () => () => {
      fx.sprites.dispose()
      shieldMaterial.dispose()
      shieldGeometry.dispose()
      orbGeometry.dispose()
    },
    [fx, shieldMaterial, shieldGeometry, orbGeometry],
  )

  // Spell selection keys.
  useEffect(() => {
    const unsub = input.onPress((action) => {
      const m = /^spell(\d)$/.exec(action)
      if (m) {
        const spell = SPELLS[Number(m[1]) - 1]
        if (spell) selectSpell(spell.id)
        return
      }
      if (action === 'nextSpell' || action === 'prevSpell') {
        const unlocked = useProgression.getState().progression.unlockedSpells
        const list = SPELLS.filter((s) => unlocked.includes(s.id))
        const i = list.findIndex((s) => s.id === spellState.selected)
        const next = list[(i + (action === 'nextSpell' ? 1 : list.length - 1)) % list.length]
        if (next) selectSpell(next.id)
      }
    })
    return () => {
      unsub()
    }
  }, [])

  const flash = (index: number, peak: number, duration: number, at: Vector3, color: Color) => {
    const l = lights.current[index]
    if (!l) return
    l.position.copy(at)
    l.color.copy(color)
    flashes.current[index] = { until: runtime.time + duration, peak, duration }
  }
  const flashCursor = useRef(0)
  const nextFlash = (peak: number, duration: number, at: Vector3, color: Color) => {
    flash(flashCursor.current, peak, duration, at, color)
    flashCursor.current = (flashCursor.current + 1) % 3
  }
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), [rapier])

  const excludePlayer = (c: { handle: number }) => c.handle !== runtime.player.colliderHandle

  /* ---------------------------------------------------------------------------------------- */
  /* Spell context implementation                                                              */
  /* ---------------------------------------------------------------------------------------- */

  const ctx: SpellContext = useMemo(
    () => ({
      now: 0,
      origin: new Vector3(),
      aimPoint: new Vector3(),
      aimDirection: new Vector3(),
      playerPosition: new Vector3(),
      playerForward: new Vector3(),

      spawnProjectile(spell) {
        const slot = projectiles.find((p) => !p.active) ?? projectiles.reduce((a, b) => (a.travelled > b.travelled ? a : b))
        slot.active = true
        slot.spell = spell
        slot.pos.copy(this.origin)
        _dir.subVectors(this.aimPoint, this.origin)
        // If the aim point is too close (hugging a wall), fire along the view direction instead.
        if (_dir.lengthSq() < 1) _dir.copy(this.aimDirection)
        slot.vel.copy(_dir.normalize()).multiplyScalar(spell.speed)
        slot.travelled = 0
        slot.trail.forEach((t) => t.copy(this.origin))
        slot.color.set(spell.visual.color)
        fx.particles.burst(this.origin, 10, { speed: 3, color: slot.color, life: 0.25, size: 0.12 })
      },

      forceWave(spell) {
        const color = new Color(spell.visual.color)
        _v.copy(this.playerPosition).add(_v2.set(0, 1, 0))
        rings.current?.spawn(_v, _up, color, spell.range, 0.55)
        _v.y = this.playerPosition.y + 0.08
        rings.current?.spawn(_v, _up, new Color(spell.visual.accent), spell.range * 0.8, 0.8)
        fx.particles.burst(_v2.copy(this.playerPosition).setY(this.playerPosition.y + 0.6), 60, { speed: 9, color, life: 0.6, size: 0.18, drag: 2.5 })
        nextFlash(spell.visual.light * 4, 0.35, _v2, color)
        let affected = 0
        for (const e of allEntities()) {
          e.getPosition(_v)
          _dir.subVectors(_v, this.playerPosition)
          const dist = _dir.length()
          if (dist > spell.range || dist < 0.01) continue
          _dir.normalize()
          if (_dir.dot(this.playerForward) < -0.25) continue // a wave in front, not behind
          const falloff = 1 - dist / spell.range
          if (e.pushable && e.body) {
            const mass = e.body.mass()
            _dir.y = 0.35
            _dir.normalize().multiplyScalar(spell.strength * falloff * Math.max(1, mass))
            e.body.wakeUp()
            e.body.applyImpulse(_dir, true)
            affected++
          }
          e.onSpellHit?.({ spell, point: _v, direction: _dir })
          if (e.pushable || e.onSpellHit) {
            events.emit({ type: 'spell:hit', spellId: spell.id, entityId: e.id, entityKind: e.kind, x: _v.x, y: _v.y, z: _v.z })
          }
        }
        return affected
      },

      raiseShield(spell) {
        runtime.player.shieldUntil = this.now + spell.duration
        events.emit({ type: 'shield:up' })
        fx.particles.burst(_v.copy(this.playerPosition).setY(this.playerPosition.y + 1), 40, { speed: 4, color: new Color(spell.visual.color), life: 0.5, size: 0.15 })
      },

      placeOrb(spell) {
        // Place at the aim point, pulled back towards the player and clamped to range.
        _dir.subVectors(this.aimPoint, this.playerPosition)
        const dist = Math.min(spell.range, Math.max(1.5, _dir.length() - 0.8))
        _dir.normalize()
        const target = _v.copy(this.playerPosition).addScaledVector(_dir, dist)
        target.y = Math.max(target.y, this.playerPosition.y + 1.6)
        const slot = spellState.orbs.find((o) => !o.active) ?? spellState.orbs.reduce((a, b) => (a.born < b.born ? a : b))
        slot.active = true
        slot.position.copy(target)
        slot.born = this.now
        slot.duration = spell.duration
        fx.particles.burst(target, 30, { speed: 2.5, color: new Color(spell.visual.color), life: 0.8, size: 0.2, drag: 3 })
      },

      pullTarget(spell) {
        let target: GameEntity | null = null
        const aimed = runtime.aim.hitEntityId ? entityById(runtime.aim.hitEntityId) : null
        if (aimed?.pullable) target = aimed
        if (!target) {
          // Forgiving cone search around the aim ray.
          let best = 0.965
          for (const e of allEntities()) {
            if (!e.pullable) continue
            e.getPosition(_v)
            _dir.subVectors(_v, runtime.aim.origin)
            const d = _dir.length()
            if (d > spell.range + 6) continue
            const dot = _dir.normalize().dot(this.aimDirection)
            if (dot > best) {
              best = dot
              target = e
            }
          }
        }
        if (!target) {
          useHud.getState().fizzle('Nothing to pull. Aim at a loose object.')
          events.emit({ type: 'spell:fizzle', spellId: spell.id, reason: 'no-target' })
          return false
        }
        target.getPosition(_v)
        if (_v.distanceTo(this.playerPosition) > spell.range) {
          useHud.getState().fizzle('Too far away to pull.')
          return false
        }
        tether.current = { active: true, entity: target, until: this.now + spell.duration, spell }
        target.onSpellHit?.({ spell, point: _v, direction: _dir.subVectors(this.playerPosition, _v).normalize() })
        events.emit({ type: 'spell:hit', spellId: spell.id, entityId: target.id, entityKind: target.kind, x: _v.x, y: _v.y, z: _v.z })
        return true
      },

      blink(spell) {
        if (isAirborneFlightState(runtime.flight.state)) return false
        // Horizontal direction: movement intent if any, otherwise where the camera looks.
        _dir.set(this.aimDirection.x, 0, this.aimDirection.z).normalize()
        const start = _v.copy(this.playerPosition).setY(this.playerPosition.y + CAPSULE_CENTER + 0.05)
        const capsule = new rapier.Capsule(CAPSULE_HALF, CAPSULE_RADIUS * 0.95)
        const hit = world.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, _dir, capsule, 0.02, spell.range, false, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, excludePlayer)
        let dist = hit ? hit.time_of_impact - 0.25 : spell.range
        if (dist < 1.2) {
          useHud.getState().fizzle('No room to blink.')
          events.emit({ type: 'spell:fizzle', spellId: spell.id, reason: 'blocked' })
          return false
        }
        // Make sure the destination itself is clear; back off if it overlaps geometry.
        const dest = _v2.copy(start)
        for (; dist >= 1.2; dist -= 0.5) {
          dest.copy(start).addScaledVector(_dir, dist)
          let blocked = false
          world.intersectionsWithShape(dest, { x: 0, y: 0, z: 0, w: 1 }, capsule, () => {
            blocked = true
            return false
          }, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, excludePlayer)
          if (!blocked) break
        }
        if (dist < 1.2) {
          useHud.getState().fizzle('No room to blink.')
          return false
        }
        // Find the floor under the destination (may be lower: blinking off a ledge is allowed).
        const down = world.castRay(new rapier.Ray(dest, { x: 0, y: -1, z: 0 }), 30, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, excludePlayer)
        const feetY = down ? dest.y - down.timeOfImpact : dest.y - CAPSULE_CENTER
        const color = new Color(spell.visual.color)
        fx.particles.burst(_v.copy(this.playerPosition).setY(this.playerPosition.y + 1), 50, { speed: 5, color, life: 0.5, size: 0.16 })
        rings.current?.spawn(_v, _dir, color, 2.2, 0.35)
        const to = new Vector3(dest.x, Math.max(feetY, dest.y - CAPSULE_CENTER - 30), dest.z)
        teleportPlayer(to)
        fx.particles.burst(_v.copy(to).setY(to.y + 1), 50, { speed: 4, color: new Color(spell.visual.accent), life: 0.6, size: 0.16 })
        rings.current?.spawn(_v, _dir, color, 2.2, 0.35)
        nextFlash(spell.visual.light * 3, 0.3, _v, color)
        return true
      },
    }),
    // Refs and pools are stable for the component lifetime.
    [projectiles, fx, world, rapier],
  )

  /* ---------------------------------------------------------------------------------------- */
  /* Frame loop                                                                                */
  /* ---------------------------------------------------------------------------------------- */

  const tryCast = (spell: SpellDef) => {
    const now = runtime.time
    const unlocked = useProgression.getState().progression.unlockedSpells
    const check = canCast(spellState.caster, spell, now, unlocked)
    if (!check.ok) {
      const msg = check.reason === 'mana' ? 'Not enough mana.' : check.reason === 'locked' ? `You have not learned ${spell.name}.` : ''
      if (msg) useHud.getState().fizzle(msg)
      if (check.reason !== 'cooldown') events.emit({ type: 'spell:fizzle', spellId: spell.id, reason: check.reason })
      return
    }
    if (isAirborneFlightState(runtime.flight.state) && !FLIGHT_ALLOWED.has(spell.id)) {
      useHud.getState().fizzle(`${spell.name} cannot be cast while flying.`)
      return
    }
    if (runtime.flight.state !== 'Grounded' && !isAirborneFlightState(runtime.flight.state)) return
    spellState.caster = applyCast(spellState.caster, spell, now)
    ctx.now = now
    ctx.origin.copy(runtime.wandTip)
    ctx.aimPoint.copy(runtime.aim.point)
    ctx.aimDirection.copy(runtime.aim.direction)
    ctx.playerPosition.copy(runtime.player.position)
    ctx.playerForward.set(-Math.sin(runtime.camera.yaw), 0, -Math.cos(runtime.camera.yaw))
    runtime.player.castStartedAt = now
    const ok = spell.execute(ctx, spell)
    if (!ok) {
      spellState.caster = refundCast(spellState.caster, spell)
      return
    }
    events.emit({ type: 'spell:cast', spellId: spell.id })
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const game = useGame.getState()
    const active = isGameplayActive(game)
    const now = runtime.time

    if (active && game.phase === 'playing') {
      spellState.caster = regenerate(spellState.caster, now, dt)
      if (input.consumeLeftClick()) {
        const spell = findSpell(spellState.selected) ?? getSpell('arc-bolt')
        tryCast(spell)
      }
    } else {
      input.consumeLeftClick()
    }

    fx.sprites.begin(camera)

    // Projectiles: swept ray test each frame so fast bolts never tunnel through walls.
    for (const pr of projectiles) {
      if (!pr.active) continue
      const step = pr.vel.length() * dt
      _dir.copy(pr.vel).normalize()
      ray.origin = pr.pos
      ray.dir = _dir
      const hit = world.castRayAndGetNormal(ray, step, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, excludePlayer)
      if (hit) {
        _v.copy(pr.pos).addScaledVector(_dir, hit.timeOfImpact)
        _v2.set(hit.normal.x, hit.normal.y, hit.normal.z)
        const entity = entityForCollider(hit.collider.handle)
        entity?.onSpellHit?.({ spell: pr.spell, point: _v, direction: _dir })
        const body = hit.collider.parent()
        if (body && body.isDynamic()) body.applyImpulseAtPoint(_dir.clone().multiplyScalar(3 * Math.max(1, body.mass() * 0.2)), _v, true)
        events.emit({ type: 'spell:hit', spellId: pr.spell.id, entityId: entity?.id ?? null, entityKind: entity?.kind ?? null, x: _v.x, y: _v.y, z: _v.z })
        fx.particles.burst(_v, 36, { speed: 7, color: pr.color, life: 0.45, size: 0.13, gravity: 9, direction: _v2, spread: 1.1 })
        rings.current?.spawn(_v.addScaledVector(_v2, 0.03), _v2, pr.color, 1.1, 0.3)
        nextFlash(pr.spell.visual.light * 2.5, 0.22, _v, pr.color)
        pr.active = false
        continue
      }
      pr.pos.addScaledVector(pr.vel, dt)
      pr.travelled += step
      if (pr.travelled > pr.spell.range) {
        fx.particles.burst(pr.pos, 12, { speed: 2, color: pr.color, life: 0.3, size: 0.1 })
        pr.active = false
        continue
      }
      pr.trail[pr.trailHead].copy(pr.pos)
      pr.trailHead = (pr.trailHead + 1) % TRAIL
      fx.sprites.add(pr.pos, pr.spell.visual.size * 5, pr.color, 1.6)
      fx.sprites.add(pr.pos, pr.spell.visual.size * 2, _white, 2)
      for (let i = 0; i < TRAIL; i++) {
        const idx = (pr.trailHead + i) % TRAIL
        const k = i / TRAIL
        fx.sprites.add(pr.trail[idx], pr.spell.visual.size * (1 + k * 3), pr.color, k * 0.7)
      }
    }
    projectileAudio.count = 0
    for (const pr of projectiles) {
      if (!pr.active || projectileAudio.count >= 3) continue
      projectileAudio.positions[projectileAudio.count++].copy(pr.pos)
    }
    // Keep the first light on the newest projectile for moving illumination.
    const lead = projectiles.find((p) => p.active)
    if (lead && lights.current[2] && runtime.time > (flashes.current[2]?.until ?? 0)) {
      lights.current[2].position.copy(lead.pos)
      lights.current[2].color.copy(lead.color)
      lights.current[2].intensity = lead.spell.visual.light
    } else if (lights.current[2] && runtime.time > (flashes.current[2]?.until ?? 0)) {
      lights.current[2].intensity = 0
    }
    for (let i = 0; i < 2; i++) {
      const f = flashes.current[i]
      const l = lights.current[i]
      if (!l) continue
      l.intensity = f && now < f.until ? f.peak * ((f.until - now) / f.duration) : 0
    }
    if (flashes.current[2] && now < flashes.current[2].until && lights.current[2]) {
      const f = flashes.current[2]
      lights.current[2].intensity = f.peak * ((f.until - now) / f.duration)
    }

    // Tether (Mystic Pull).
    const t = tether.current
    if (t.active && t.entity && t.spell) {
      t.entity.getPosition(_v)
      const anchor = _v2.copy(runtime.player.position).addScaledVector(ctx.playerForward.set(-Math.sin(runtime.player.facing), 0, -Math.cos(runtime.player.facing)), 2.2)
      anchor.y += 1.2
      const dist = _v.distanceTo(anchor)
      if (now > t.until || dist < 1.2 || !entityById(t.entity.id)) {
        t.active = false
      } else {
        if (t.entity.body) {
          const body = t.entity.body
          _dir.subVectors(anchor, _v).normalize()
          const mass = Math.max(1, body.mass())
          // Spring towards the anchor, damped against current velocity.
          const lv = body.linvel()
          body.wakeUp()
          body.applyImpulse(
            {
              x: (_dir.x * t.spell.strength * 6 - lv.x * 2) * mass * dt,
              y: (_dir.y * t.spell.strength * 6 - lv.y * 2 + 9.81) * mass * dt,
              z: (_dir.z * t.spell.strength * 6 - lv.z * 2) * mass * dt,
            },
            true,
          )
        }
        // Beaded, wavy beam from wand tip to target.
        const color = _tetherColor
        for (let i = 0; i <= 18; i++) {
          const k = i / 18
          _dir.lerpVectors(runtime.wandTip, _v, k)
          _dir.y += Math.sin(k * Math.PI) * 0.4 * Math.sin(now * 9 + k * 8)
          fx.sprites.add(_dir, 0.25 + Math.sin(now * 20 + i) * 0.05, color, 0.9)
        }
        fx.sprites.add(_v, 1.2, color, 1)
      }
    }

    // Shield bubble.
    const shieldUp = now < runtime.player.shieldUntil
    if (shieldUp !== shieldWasUp.current) {
      if (!shieldUp && shieldWasUp.current) events.emit({ type: 'shield:down' })
      shieldWasUp.current = shieldUp
    }
    const sm = shieldMesh.current
    if (sm) {
      const remaining = runtime.player.shieldUntil - now
      const target = shieldUp ? (remaining < 1.2 ? 0.5 + 0.5 * Math.sin(now * 30) : 1) : 0
      const u = shieldMaterial.uniforms.uStrength
      u.value += (target - u.value) * Math.min(1, dt * 10)
      sm.visible = u.value > 0.01
      sm.position.copy(runtime.player.position)
      sm.position.y += 1
      sm.scale.setScalar(1.25 + Math.sin(now * 3) * 0.02)
    }

    // Luminous orbs: bob, light up surroundings, fade out at the end of their duration.
    spellState.orbs.forEach((o, i) => {
      const light = orbLights.current[i]
      const mesh = orbMeshes.current[i]
      if (!o.active) {
        if (light) light.intensity = 0
        if (mesh) mesh.visible = false
        return
      }
      const age = now - o.born
      if (age > o.duration) {
        o.active = false
        return
      }
      const fade = Math.min(1, age / 0.4) * Math.min(1, (o.duration - age) / 2.5)
      const bob = Math.sin(now * 1.8 + i) * 0.12
      _v.copy(o.position).setY(o.position.y + bob)
      if (light) {
        light.position.copy(_v)
        light.intensity = 22 * fade
      }
      if (mesh) {
        mesh.visible = true
        mesh.position.copy(_v)
        mesh.scale.setScalar(0.18 + 0.02 * Math.sin(now * 6))
      }
      fx.sprites.add(_v, 1.8 * fade, _orbColor, 0.9 * fade)
      fx.sprites.add(_v, 0.6, _white, fade)
    })

    fx.particles.update(dt, fx.sprites)
    fx.sprites.end()
    rings.current?.update(dt)

    // Throttled HUD sync for mana and cooldowns.
    syncTimer.current -= rawDt
    if (syncTimer.current <= 0) {
      syncTimer.current = 0.1
      const cooldowns: Record<string, number> = {}
      for (const s of SPELLS) {
        const ready = spellState.caster.readyAt[s.id] ?? 0
        cooldowns[s.id] = s.cooldown > 0 ? Math.max(0, Math.min(1, (ready - now) / s.cooldown)) : 0
      }
      useHud.getState().patch({
        mana: Math.round(spellState.caster.mana),
        maxMana: spellState.caster.maxMana,
        cooldowns,
        shieldActive: shieldUp,
        aiming: runtime.player.aiming,
      })
    }
  })

  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <pointLight key={`fx${i}`} ref={(l) => { if (l) lights.current[i] = l }} intensity={0} distance={14} decay={1.6} />
      ))}
      {[0, 1].map((i) => (
        <pointLight key={`orb${i}`} ref={(l) => { if (l) orbLights.current[i] = l }} intensity={0} distance={18} decay={1.5} color="#ffe2a0" />
      ))}
      {[0, 1].map((i) => (
        <mesh key={`orbm${i}`} ref={(m) => { if (m) orbMeshes.current[i] = m }} geometry={orbGeometry} visible={false}>
          <meshBasicMaterial color="#fff2c8" toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={shieldMesh} geometry={shieldGeometry} material={shieldMaterial} visible={false} renderOrder={6} />
    </group>
  )
}

const _white = new Color('#ffffff')
const _orbColor = new Color('#ffd98a')
const _tetherColor = new Color('#c79bff')
