import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MeshStandardMaterial, RepeatWrapping } from 'three'
import { getMaterials } from './materials'
import { LAKE, PLATEAU, RAVINE, WATER_LEVEL } from '../layout'

/**
 * Lake and ravine stream: a reflective standard material (picks up the sky environment map)
 * with two scrolling normal maps for gentle animated ripples.
 */
export function Water() {
  const material = useMemo(() => {
    const normalMap = getMaterials().waterNormals.clone()
    normalMap.wrapS = normalMap.wrapT = RepeatWrapping
    normalMap.repeat.set(24, 24)
    normalMap.needsUpdate = true
    const m = new MeshStandardMaterial({
      color: new Color('#1d3340'),
      roughness: 0.06,
      metalness: 0.35,
      normalMap,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.4,
    })
    m.normalScale.set(0.35, 0.35)
    return m
  }, [])

  useFrame((_, dt) => {
    const n = material.normalMap
    if (!n) return
    n.offset.x += dt * 0.006
    n.offset.y += dt * 0.004
  })

  useEffect(
    () => () => {
      material.normalMap?.dispose()
      material.dispose()
    },
    [material],
  )

  return (
    <group>
      <mesh position={[LAKE.center[0], WATER_LEVEL, LAKE.center[1]]} rotation-x={-Math.PI / 2} material={material} receiveShadow>
        <circleGeometry args={[LAKE.radius + 60, 64]} />
      </mesh>
      {/* Stream at the bottom of the ravine. */}
      <mesh position={[0, WATER_LEVEL - 0.5, RAVINE.centerZ]} rotation-x={-Math.PI / 2} material={material}>
        <planeGeometry args={[(PLATEAU.maxX - PLATEAU.minX) + 140, RAVINE.innerHalfWidth * 2.4]} />
      </mesh>
    </group>
  )
}
