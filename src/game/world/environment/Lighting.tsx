import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Sky, Stars } from '@react-three/drei'
import { Color, DirectionalLight, FogExp2, HemisphereLight, Object3D, Vector3 } from 'three'
import { useSettings } from '../../state/settings'
import { runtime } from '../../core/runtime'
import { areaAt } from '../layout'
import { damp } from '../../core/math'

/** Low evening sun from the west-south-west: long shadows across the courtyard, warm towers. */
export const SUN_DIRECTION = new Vector3(-0.78, 0.13, 0.42).normalize()
const SUN_DISTANCE = 220

const OUTDOOR_FOG = new Color('#5f6479')
const INTERIOR_FOG = new Color('#2a2220')

function SkyDome() {
  const sunPos = SUN_DIRECTION.clone().multiplyScalar(1000)
  return (
    <>
      <Sky distance={4500} sunPosition={sunPos} turbidity={9} rayleigh={3.2} mieCoefficient={0.006} mieDirectionalG={0.88} />
      <Stars radius={900} depth={200} count={1400} factor={6} saturation={0} fade speed={0.3} />
    </>
  )
}

/**
 * Sun, sky, image-based ambient, fog and the per-area mood blend (darker, warmer interiors).
 * The shadow camera follows the player and snaps to texels to avoid shimmering.
 */
export function Lighting() {
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const target = useRef(new Object3D())
  const { scene, camera } = useThree()
  const shadows = useSettings((s) => s.graphics.shadows)
  const quality = useSettings((s) => s.graphics.quality)
  const viewDistance = useSettings((s) => s.graphics.viewDistance)
  const interiorBlend = useRef(0)

  useEffect(() => {
    const fog = new FogExp2(OUTDOOR_FOG.getHex(), 2.1 / viewDistance)
    scene.fog = fog
    if ('far' in camera) {
      camera.far = viewDistance + 900
      camera.updateProjectionMatrix()
    }
    return () => {
      scene.fog = null
    }
  }, [scene, camera, viewDistance])

  useEffect(() => {
    scene.add(target.current)
    const t = target.current
    return () => {
      scene.remove(t)
    }
  }, [scene])

  const mapSize = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024
  const extent = quality === 'high' ? 70 : 55

  useFrame((_, dt) => {
    const light = sun.current
    if (!light) return
    // Follow the camera focus, snapped to shadow texels.
    const focus = runtime.player.position
    const texel = (extent * 2) / mapSize
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    target.current.position.set(fx, focus.y, fz)
    light.position.set(fx + SUN_DIRECTION.x * SUN_DISTANCE, focus.y + SUN_DIRECTION.y * SUN_DISTANCE, fz + SUN_DIRECTION.z * SUN_DISTANCE)
    light.target = target.current

    // Interior mood: the hemisphere light ignores walls, so dim it and pull the fog in indoors.
    const area = areaAt(runtime.camera.position.x, runtime.camera.position.y, runtime.camera.position.z)
    interiorBlend.current = damp(interiorBlend.current, area.interior ? 1 : 0, 2.5, dt)
    const b = interiorBlend.current
    if (hemi.current) hemi.current.intensity = 0.6 - b * 0.4
    light.intensity = 2.8 - b * 1.2
    const fog = scene.fog as FogExp2 | null
    if (fog) {
      fog.color.copy(OUTDOOR_FOG).lerp(INTERIOR_FOG, b)
      fog.density = (2.1 / viewDistance) * (1 - b * 0.4)
    }
  })

  return (
    <>
      <SkyDome />
      <Environment frames={1} resolution={128} environmentIntensity={0.35}>
        <SkyDome />
      </Environment>
      <hemisphereLight ref={hemi} args={['#7d8db8', '#2e261e', 0.6]} />
      <directionalLight
        key={mapSize}
        ref={sun}
        color="#ffb27a"
        intensity={3.2}
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={10}
        shadow-camera-far={SUN_DISTANCE + 160}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  )
}
