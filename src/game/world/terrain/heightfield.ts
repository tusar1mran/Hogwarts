import { fbm2, ridged2 } from '../../core/noise'
import { clamp, lerp, smoothstep } from '../../core/math'
import { FOREST, LAKE, PLATEAU, RAVINE } from '../layout'

/** Distance from a point to the plateau rectangle (0 inside). */
function plateauDistance(x: number, z: number) {
  const dx = Math.max(PLATEAU.minX - x, 0, x - PLATEAU.maxX)
  const dz = Math.max(PLATEAU.minZ - z, 0, z - PLATEAU.maxZ)
  return Math.hypot(dx, dz)
}

/**
 * Procedural terrain height at (x, z). Pure and deterministic: the render mesh,
 * the physics trimesh, flight ground clearance and prop placement all share it.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)

  // Rolling highland base.
  let h = 8 + fbm2(x * 0.006 + 3.1, z * 0.006 - 7.4, 5) * 18

  // Gentle forest basin so the giant trees sit on walkable ground.
  const df = Math.hypot(x - FOREST.center[0], z - FOREST.center[1])
  h = lerp(h, 4 + fbm2(x * 0.02, z * 0.02, 3) * 4, 1 - smoothstep(FOREST.radius * 0.6, FOREST.radius * 1.3, df))

  // Mountain ring framing the valley.
  const mountain = smoothstep(250, 520, r)
  if (mountain > 0) {
    const crest = ridged2(x * 0.004 + 11, z * 0.004 - 5, 5)
    h += mountain * (60 + crest * 140)
  }

  // Lake basin to the south-west.
  const dl = Math.hypot(x - LAKE.center[0], z - LAKE.center[1])
  const lakeT = 1 - smoothstep(LAKE.innerRadius, LAKE.radius, dl)
  h = lerp(h, LAKE.bottom, lakeT)

  // Castle plateau with a falloff that becomes cliffs towards the lake.
  const p = 1 - smoothstep(0, 42, plateauDistance(x, z))
  h = lerp(h, 0, p)

  // Ravine carved across the approach, crossed by the bridge.
  const rz = Math.abs(z - RAVINE.centerZ)
  const rv = 1 - smoothstep(RAVINE.innerHalfWidth, RAVINE.outerHalfWidth, rz)
  h -= rv * RAVINE.depth * clamp(p * 1.4, 0, 1)

  return h
}

/** Approximate surface normal by central differences. */
export function terrainNormal(x: number, z: number, eps = 1): [number, number, number] {
  const hL = terrainHeight(x - eps, z)
  const hR = terrainHeight(x + eps, z)
  const hD = terrainHeight(x, z - eps)
  const hU = terrainHeight(x, z + eps)
  const nx = hL - hR
  const ny = 2 * eps
  const nz = hD - hU
  const len = Math.hypot(nx, ny, nz)
  return [nx / len, ny / len, nz / len]
}
