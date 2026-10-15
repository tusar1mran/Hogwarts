import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'

/** Shared broom mesh (purely presentational) used by the rider's broom and by world pickups. */
export function BroomModel() {
  const parts = useMemo(() => {
    const handle = new CylinderGeometry(0.028, 0.035, 2.0, 8)
    handle.rotateX(Math.PI / 2)
    const bristles = new ConeGeometry(0.2, 0.75, 12, 1, true)
    bristles.rotateX(-Math.PI / 2)
    bristles.translate(0, 0, 1.15)
    const band = new TorusGeometry(0.06, 0.015, 6, 12)
    const glow = new SphereGeometry(0.06, 8, 6)
    return {
      handle,
      bristles,
      band,
      glow,
      wood: new MeshStandardMaterial({ color: '#5a3a22', roughness: 0.45 }),
      straw: new MeshStandardMaterial({ color: '#b08a4a', roughness: 0.9, side: 2 }),
      brass: new MeshStandardMaterial({ color: '#c9a050', metalness: 0.9, roughness: 0.3 }),
      glowMat: new MeshBasicMaterial({ color: new Color('#9fd8ff'), transparent: true, opacity: 0.9, blending: AdditiveBlending, toneMapped: false }),
    }
  }, [])
  useEffect(
    () => () => {
      Object.values(parts).forEach((p) => (p as { dispose: () => void }).dispose())
    },
    [parts],
  )
  return (
    <group>
      <mesh geometry={parts.handle} material={parts.wood} castShadow />
      <mesh geometry={parts.bristles} material={parts.straw} castShadow />
      <mesh geometry={parts.band} material={parts.brass} position={[0, 0, 0.78]} />
      <mesh geometry={parts.band} material={parts.brass} position={[0, 0, 0.84]} />
      <mesh geometry={parts.glow} material={parts.glowMat} position={[0, 0, -1.02]} />
    </group>
  )
}
