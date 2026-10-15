import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Mesh,
  Vector3,
  type Texture,
  type Camera,
  type Object3D,
} from 'three'

/**
 * Allocation-free effect primitives shared by all spells. Everything is pre-allocated with a
 * hard capacity, so casting repeatedly can never grow memory or draw calls.
 */

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _c = new Color()

/** Camera-facing additive glow sprites in a single instanced draw call. */
export class GlowSpritePool {
  readonly mesh: InstancedMesh
  private count = 0
  readonly capacity: number

  constructor(texture: Texture, capacity = 900) {
    this.capacity = capacity
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      vertexColors: false,
    })
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, capacity)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    this.mesh.instanceColor.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.renderOrder = 5
  }

  begin(camera: Camera) {
    this.count = 0
    _q.copy(camera.quaternion)
  }

  /** `intensity` scales the colour (additive blending makes it act as opacity). */
  add(position: Vector3, size: number, color: Color, intensity = 1) {
    if (this.count >= this.capacity || size <= 0 || intensity <= 0.001) return
    _s.setScalar(size)
    _m.compose(position, _q, _s)
    this.mesh.setMatrixAt(this.count, _m)
    _c.copy(color).multiplyScalar(intensity)
    this.mesh.setColorAt(this.count, _c)
    this.count++
  }

  end() {
    this.mesh.count = this.count
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
    this.mesh.dispose()
  }
}

interface Particle {
  alive: boolean
  pos: Vector3
  vel: Vector3
  life: number
  maxLife: number
  size: number
  color: Color
  gravity: number
  drag: number
}

/** CPU particle system with a fixed pool (sparks, bursts, blink motes). */
export class ParticlePool {
  private particles: Particle[]
  private cursor = 0

  constructor(capacity = 600) {
    this.particles = Array.from({ length: capacity }, () => ({
      alive: false,
      pos: new Vector3(),
      vel: new Vector3(),
      life: 0,
      maxLife: 1,
      size: 0.1,
      color: new Color(),
      gravity: 0,
      drag: 0,
    }))
  }

  /** Spawns `count` particles; the oldest are recycled when the pool is full. */
  burst(origin: Vector3, count: number, opts: { speed: number; color: Color; life: number; size: number; gravity?: number; drag?: number; direction?: Vector3; spread?: number }) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor]
      this.cursor = (this.cursor + 1) % this.particles.length
      p.alive = true
      p.pos.copy(origin)
      // Random direction, optionally biased towards `direction`.
      p.vel.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      if (opts.direction) p.vel.multiplyScalar(opts.spread ?? 0.6).add(opts.direction).normalize()
      p.vel.multiplyScalar(opts.speed * (0.4 + Math.random() * 0.6))
      p.maxLife = p.life = opts.life * (0.6 + Math.random() * 0.4)
      p.size = opts.size * (0.6 + Math.random() * 0.6)
      p.color.copy(opts.color)
      p.gravity = opts.gravity ?? 0
      p.drag = opts.drag ?? 1.5
    }
  }

  update(dt: number, sprites: GlowSpritePool) {
    for (const p of this.particles) {
      if (!p.alive) continue
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      p.vel.y -= p.gravity * dt
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt))
      p.pos.addScaledVector(p.vel, dt)
      const k = p.life / p.maxLife
      sprites.add(p.pos, p.size * (0.5 + k * 0.5), p.color, k)
    }
  }

  get activeCount() {
    let n = 0
    for (const p of this.particles) if (p.alive) n++
    return n
  }

  clear() {
    for (const p of this.particles) p.alive = false
  }
}

interface RingFx {
  mesh: Mesh
  material: MeshBasicMaterial
  age: number
  duration: number
  maxScale: number
  active: boolean
}

/** Expanding, fading impact rings (Force Wave, impacts, blink). */
export class RingPool {
  private rings: RingFx[]
  private cursor = 0

  constructor(parent: Object3D, capacity = 10) {
    const geo = new RingGeometry(0.82, 1, 48)
    this.rings = Array.from({ length: capacity }, () => {
      const material = new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      })
      const mesh = new Mesh(geo, material)
      mesh.visible = false
      mesh.renderOrder = 4
      parent.add(mesh)
      return { mesh, material, age: 0, duration: 0.6, maxScale: 6, active: false }
    })
  }

  spawn(position: Vector3, normal: Vector3, color: Color, maxScale: number, duration = 0.6) {
    const r = this.rings[this.cursor]
    this.cursor = (this.cursor + 1) % this.rings.length
    r.active = true
    r.age = 0
    r.duration = duration
    r.maxScale = maxScale
    r.material.color.copy(color)
    r.mesh.position.copy(position)
    r.mesh.lookAt(_s.copy(position).add(normal))
    r.mesh.visible = true
    r.mesh.scale.setScalar(0.01)
  }

  update(dt: number) {
    for (const r of this.rings) {
      if (!r.active) continue
      r.age += dt
      const t = r.age / r.duration
      if (t >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      const e = 1 - Math.pow(1 - t, 3)
      r.mesh.scale.setScalar(0.2 + e * r.maxScale)
      r.material.opacity = (1 - t) * 1.4
    }
  }

  dispose() {
    for (const r of this.rings) {
      r.mesh.removeFromParent()
      r.material.dispose()
    }
    this.rings[0]?.mesh.geometry.dispose()
  }
}
