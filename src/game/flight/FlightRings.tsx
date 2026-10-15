import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Group, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three'
import { FLIGHT_RINGS } from '../world/layout'
import { runtime } from '../core/runtime'
import { events } from '../core/events'
import { useProgression } from '../state/progressionStore'
import { useHud } from '../state/hudStore'
import { isAirborneFlightState } from './flightMachine'

const RING_RADIUS = 3.4
const _p = new Vector3()

/** Floating rings of the flight course. Each counts once per course run. */
export function FlightRings() {
  const collected = useProgression((s) => s.progression.ringsCollected)
  const refs = useRef<Group[]>([])
  const geometry = useMemo(() => new TorusGeometry(RING_RADIUS, 0.22, 10, 48), [])
  const materials = useMemo(
    () => ({
      active: new MeshStandardMaterial({ color: '#ffe6a0', emissive: new Color('#ffbf3c'), emissiveIntensity: 2.6, toneMapped: false, roughness: 0.3 }),
      done: new MeshStandardMaterial({ color: '#7b8aa8', emissive: new Color('#3a4a6a'), emissiveIntensity: 0.6, transparent: true, opacity: 0.35 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      materials.active.dispose()
      materials.done.dispose()
    },
    [geometry, materials],
  )

  // Each ring faces along the course towards the next ring.
  const orientations = useMemo(
    () =>
      FLIGHT_RINGS.map((p, i) => {
        const next = FLIGHT_RINGS[(i + 1) % FLIGHT_RINGS.length]
        return Math.atan2(next[0] - p[0], next[2] - p[2])
      }),
    [],
  )

  useEffect(() => {
    useHud.getState().patch({ ringsCollected: collected.length, ringsTotal: FLIGHT_RINGS.length })
  }, [collected])

  useFrame((_, dt) => {
    const flying = isAirborneFlightState(runtime.flight.state)
    const prog = useProgression.getState()
    FLIGHT_RINGS.forEach((r, i) => {
      const g = refs.current[i]
      if (g) {
        g.rotation.z += dt * 0.4
        g.position.y = Math.sin(runtime.time * 0.8 + i) * 0.3
      }
      if (!flying || prog.progression.ringsCollected.includes(i)) return
      _p.set(r[0], r[1] + (g?.position.y ?? 0), r[2])
      if (_p.distanceTo(runtime.player.position) < RING_RADIUS + 0.6) {
        if (prog.collectRing(i)) {
          events.emit({ type: 'flight:ring', ringIndex: i })
          const n = useProgression.getState().progression.ringsCollected.length
          useHud.getState().notify({ kind: 'info', title: `Ring ${n} of ${FLIGHT_RINGS.length}`, body: n === FLIGHT_RINGS.length ? 'Course complete! Land on the Skyward Platform to reset it.' : undefined })
        }
      }
    })
  })

  return (
    <group>
      {FLIGHT_RINGS.map((r, i) => (
        <group key={i} position={r} rotation-y={orientations[i]}>
          <group ref={(g) => { if (g) refs.current[i] = g }}>
            <mesh geometry={geometry} material={collected.includes(i) ? materials.done : materials.active} />
          </group>
        </group>
      ))}
    </group>
  )
}
