import { CylinderCollider } from '@react-three/rapier'
import { solidCylinder } from '../architecture/geometry'
import { getMaterials } from '../environment/materials'

type V3 = [number, number, number]

/** Small iron lamp post; pair it with a flame at `position.y + 2.75`. */
export function LampPostSimple({ position }: { position: V3 }) {
  const mats = getMaterials()
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} geometry={solidCylinder(0.25, 0.32, 0.4, 8)} material={mats.stoneDark} castShadow />
      <mesh position={[0, 1.45, 0]} geometry={solidCylinder(0.06, 0.08, 2.2, 6)} material={mats.iron} castShadow />
      <mesh position={[0, 2.7, 0]} geometry={solidCylinder(0.22, 0.14, 0.4, 6)} material={mats.iron} />
      <CylinderCollider args={[1.3, 0.25]} position={[0, 1.3, 0]} />
    </group>
  )
}
