import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { getMaterials } from './materials'
import { createRng } from '../../core/math'
import { runtime } from '../../core/runtime'

type V3 = [number, number, number]

/* ------------------------------------------------------------------------------------------ */
/* Shared time uniform: one object updated once per frame, referenced by every shader.          */
/* ------------------------------------------------------------------------------------------ */

export const timeUniform = { value: 0 }

export function AtmosphereClock() {
  useFrame((_, dt) => {
    timeUniform.value += Math.min(dt, 0.1)
  })
  return null
}

/* ------------------------------------------------------------------------------------------ */
/* Flames                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const flameGeometry = new PlaneGeometry(1, 1.6)
flameGeometry.translate(0, 0.5, 0)

let flameMaterial: ShaderMaterial | null = null
export function getSharedFlameMaterial() {
  if (flameMaterial) return flameMaterial
  flameMaterial = new ShaderMaterial({
    uniforms: { uTime: timeUniform, uMap: { value: getMaterials().glow }, uColor: { value: new Color('#ffb35c') } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFlicker;
      void main() {
        vUv = uv;
        float seed = float(gl_InstanceID) * 1.618;
        float flick = 0.82 + 0.12 * sin(uTime * 13.0 + seed * 7.0) + 0.06 * sin(uTime * 27.0 + seed * 3.0);
        vFlicker = flick;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sx = length(instanceMatrix[0].xyz);
        float sy = length(instanceMatrix[1].xyz);
        vec2 offset = position.xy * vec2(sx, sy * flick);
        offset.x += sin(uTime * 5.0 + seed) * 0.04 * sx * position.y;
        center.xy += offset;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vFlicker;
      void main() {
        vec2 uv = vec2(vUv.x, vUv.y * 0.85 + 0.05);
        float a = texture2D(uMap, uv).a;
        float core = smoothstep(0.55, 0.95, a);
        vec3 col = mix(uColor, vec3(1.0, 0.95, 0.8), core) * (1.6 * vFlicker);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  return flameMaterial
}

const _o = new Object3D()

/** Billboarded, flickering flames in a single draw call. */
export function Flames({ positions, size = 0.22 }: { positions: V3[]; size?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    positions.forEach((p, i) => {
      _o.position.set(p[0], p[1], p[2])
      _o.scale.setScalar(size)
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [positions, size])
  if (!positions.length) return null
  return <instancedMesh ref={ref} args={[flameGeometry, getSharedFlameMaterial(), positions.length]} frustumCulled />
}

/* ------------------------------------------------------------------------------------------ */
/* Floating particles (motes, dust, fireflies), animated entirely on the GPU                    */
/* ------------------------------------------------------------------------------------------ */

export interface MoteFieldProps {
  center: V3
  size: V3
  count: number
  color: string
  pointSize?: number
  speed?: number
  seed?: number
  /** 0..1, additive glow strength. */
  intensity?: number
}

export function MoteField({ center, size, count, color, pointSize = 0.12, speed = 0.3, seed = 1, intensity = 1 }: MoteFieldProps) {
  const geometry = useMemo(() => {
    const rng = createRng(seed)
    const pos = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * size[0]
      pos[i * 3 + 1] = rng() * size[1]
      pos[i * 3 + 2] = (rng() - 0.5) * size[2]
      phase[i] = rng() * 100
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aPhase', new BufferAttribute(phase, 1))
    g.computeBoundingSphere()
    return g
  }, [count, size, seed])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: timeUniform,
          uColor: { value: new Color(color) },
          uSize: { value: pointSize },
          uSpeed: { value: speed },
          uHeight: { value: size[1] },
          uIntensity: { value: intensity },
        },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uSize; uniform float uSpeed; uniform float uHeight;
          attribute float aPhase;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            float t = uTime * uSpeed + aPhase;
            p.x += sin(t * 0.7 + aPhase) * 1.2;
            p.z += cos(t * 0.6 + aPhase * 1.3) * 1.2;
            p.y = mod(p.y + t * 0.4, uHeight);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * 420.0 / -mv.z;
            float pulse = 0.5 + 0.5 * sin(t * 3.0 + aPhase * 5.0);
            float edge = smoothstep(0.0, 0.1, p.y / uHeight) * (1.0 - smoothstep(0.85, 1.0, p.y / uHeight));
            vAlpha = pulse * edge * smoothstep(250.0, 30.0, -mv.z);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uIntensity;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * vAlpha * uIntensity;
            gl_FragColor = vec4(uColor * a * 2.0, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [color, pointSize, speed, size, intensity],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <points position={center} geometry={geometry} material={material} frustumCulled />
}

/* ------------------------------------------------------------------------------------------ */
/* Light shafts                                                                                 */
/* ------------------------------------------------------------------------------------------ */

let shaftMaterial: ShaderMaterial | null = null
function getShaftMaterial() {
  if (shaftMaterial) return shaftMaterial
  shaftMaterial = new ShaderMaterial({
    uniforms: { uTime: timeUniform, uColor: { value: new Color('#ffd9a0') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float fall = smoothstep(0.0, 0.25, vUv.y) * pow(vUv.y, 0.6);
        float dust = 0.75 + 0.25 * sin(vUv.y * 40.0 + uTime * 0.8) * sin(vUv.x * 23.0 - uTime * 0.5);
        float a = edge * fall * dust * 0.16;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
  })
  return shaftMaterial
}

/** A slanted beam of window light (top at the window, fading towards the floor). */
export function LightShaft({ position, rotation, width, length }: { position: V3; rotation: V3; width: number; length: number }) {
  return (
    <mesh position={position} rotation={rotation} material={getShaftMaterial()} renderOrder={2}>
      <planeGeometry args={[width, length]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------------------------------ */
/* Layered mist: soft camera-facing puffs drifting slowly                                       */
/* ------------------------------------------------------------------------------------------ */

export function MistLayer({ puffs, color = '#b9c4d6', opacity = 0.32 }: { puffs: Array<{ position: V3; scale: number }>; color?: string; opacity?: number }) {
  const ref = useRef<InstancedMesh>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: timeUniform, uMap: { value: getMaterials().fog }, uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying float vFade;
          void main() {
            vUv = uv;
            float seed = float(gl_InstanceID) * 3.17;
            vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float s = length(instanceMatrix[0].xyz);
            center.x += sin(uTime * 0.05 + seed) * s * 0.15;
            center.xy += position.xy * s;
            vFade = smoothstep(4.0, 30.0, -center.z);
            gl_Position = projectionMatrix * center;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
          varying vec2 vUv; varying float vFade;
          void main() {
            float a = texture2D(uMap, vUv).a * uOpacity * vFade;
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        fog: false,
      }),
    [color, opacity],
  )
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    puffs.forEach((p, i) => {
      _o.position.set(...p.position)
      _o.scale.setScalar(p.scale)
      _o.updateMatrix()
      mesh.setMatrixAt(i, _o.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [puffs])
  useEffect(() => () => material.dispose(), [material])
  return <instancedMesh ref={ref} args={[flameGeometry, material, puffs.length]} renderOrder={3} />
}

/* ------------------------------------------------------------------------------------------ */
/* Distance-based detail                                                                        */
/* ------------------------------------------------------------------------------------------ */

const _p = new Vector3()

/**
 * Hides its children when the camera is farther than `distance` from `center`.
 * Checked a few times per second, not every frame. Used for interior furnishing and props.
 */
export function DistanceCull({ center, distance, children }: { center: V3; distance: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  const timer = useRef(Math.random() * 0.25)
  useFrame((state, dt) => {
    timer.current -= dt
    if (timer.current > 0 || !ref.current) return
    timer.current = 0.25
    _p.set(...center)
    ref.current.visible = state.camera.position.distanceTo(_p) < distance
  })
  return <group ref={ref}>{children}</group>
}

/** True once per interval; helper for throttled per-frame work. */
export function useThrottledFrame(interval: number, fn: (dt: number) => void) {
  const acc = useRef(0)
  useFrame((_, dt) => {
    acc.current += dt
    if (acc.current >= interval) {
      fn(acc.current)
      acc.current = 0
    }
  })
}

export const playerPosition = () => runtime.player.position
