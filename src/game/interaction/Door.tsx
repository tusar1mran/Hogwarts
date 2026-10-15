import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { getMaterials } from '../world/environment/materials'
import { scaledBox, solidCylinder } from '../world/architecture/geometry'
import { registerInteractable } from './interactables'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { dampAngle } from '../core/math'
import { useGame } from '../state/gameStore'

export interface DoorProps {
  id: string
  label: string
  /** Bottom centre of the doorway. */
  position: [number, number, number]
  /** Same rotation as the wall that holds the doorway (local +Z faces outside). */
  rotationY: number
  width: number
  height: number
  thickness?: number
  startOpen?: boolean
}

const _local = new Vector3()

/**
 * Double door with hinged leaves. Closed doors block movement; opening removes the collider.
 * A door will not close on top of the player, so it can never trap them.
 */
export function Door({ id, label, position, rotationY, width, height, thickness = 0.25, startOpen = false }: DoorProps) {
  const mats = getMaterials()
  const [open, setOpen] = useState(startOpen)
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const angle = useRef(startOpen ? 1 : 0)
  const sessionId = useGame((s) => s.sessionId)
  const center = useMemo(() => new Vector3(position[0], position[1] + 1, position[2]), [position])

  useEffect(() => setOpen(startOpen), [sessionId, startOpen])

  useEffect(
    () =>
      registerInteractable({
        id,
        position: center,
        radius: 3.2,
        verb: open ? 'Close' : 'Open',
        label,
        onInteract: () => {
          if (open) {
            // Refuse to close while the player stands in the doorway.
            _local.copy(runtime.player.position).sub(center)
            _local.y = 0
            if (_local.length() < Math.max(1.6, width * 0.55)) return
          }
          setOpen(!open)
          events.emit({ type: 'door', open: !open, x: center.x, y: center.y, z: center.z })
        },
      }),
    [id, label, center, open, width],
  )

  useFrame((_, dt) => {
    angle.current = dampAngle(angle.current, open ? 1 : 0, 3.5, dt)
    const a = angle.current * (Math.PI / 2) * 0.92
    if (left.current) left.current.rotation.y = a
    if (right.current) right.current.rotation.y = -a
  })

  const leafW = width / 2 - 0.04
  const leaf = scaledBox(leafW, height - 0.05, thickness, 1.5)
  const band = scaledBox(leafW * 0.96, 0.12, thickness + 0.04, 1)

  return (
    <group position={position} rotation-y={rotationY}>
      {/* Hinges sit at the jambs; leaves swing inwards (towards local -Z). */}
      <group ref={left} position={[-width / 2, 0, 0]}>
        <mesh position={[leafW / 2, height / 2, 0]} geometry={leaf} material={mats.wood} castShadow receiveShadow />
        {[0.2, 0.5, 0.8].map((f) => (
          <mesh key={f} position={[leafW / 2, height * f, 0]} geometry={band} material={mats.iron} />
        ))}
        <mesh position={[leafW - 0.25, height * 0.48, thickness / 2 + 0.06]} rotation-x={Math.PI / 2} geometry={solidCylinder(0.09, 0.09, 0.1, 10)} material={mats.brass} />
      </group>
      <group ref={right} position={[width / 2, 0, 0]}>
        <mesh position={[-leafW / 2, height / 2, 0]} geometry={leaf} material={mats.wood} castShadow receiveShadow />
        {[0.2, 0.5, 0.8].map((f) => (
          <mesh key={f} position={[-leafW / 2, height * f, 0]} geometry={band} material={mats.iron} />
        ))}
        <mesh position={[-leafW + 0.25, height * 0.48, thickness / 2 + 0.06]} rotation-x={Math.PI / 2} geometry={solidCylinder(0.09, 0.09, 0.1, 10)} material={mats.brass} />
      </group>
      {!open && <CuboidCollider args={[width / 2, height / 2, thickness / 2 + 0.05]} position={[0, height / 2, 0]} />}
    </group>
  )
}
