import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CAMERA_LIMITS } from '../camera/CameraRig'
import { WAND_LOCAL_AXIS, clampWorldAimPitch, wandAimRotation } from './wandAim'

const [MIN_PITCH, MAX_PITCH] = CAMERA_LIMITS.groundPitch

describe('clampWorldAimPitch', () => {
  it('clamps an above-limit input to sin(max)', () => {
    // Straight up is well above the upper limit (0.55 rad).
    const out = clampWorldAimPitch(new Vector3(0, 1, 0))
    expect(out.y).toBeCloseTo(Math.sin(MAX_PITCH), 6)
  })

  it('clamps a below-limit input to sin(min)', () => {
    // Straight down is well below the lower limit (-1.2 rad).
    const out = clampWorldAimPitch(new Vector3(0, -1, 0))
    expect(out.y).toBeCloseTo(Math.sin(MIN_PITCH), 6)
  })

  it('preserves yaw while clamping pitch', () => {
    const dir = new Vector3(0.3, 0.9, -0.2) // steep, above the limit
    const yawBefore = Math.atan2(dir.x, dir.z)
    const out = clampWorldAimPitch(dir)
    expect(Math.atan2(out.x, out.z)).toBeCloseTo(yawBefore, 6)
    expect(out.y).toBeCloseTo(Math.sin(MAX_PITCH), 6)
  })

  it('round-trips a mid-range unit input unchanged', () => {
    const dir = new Vector3(0.4, 0.2, -0.8).normalize()
    const out = clampWorldAimPitch(dir)
    expect(out.x).toBeCloseTo(dir.x, 6)
    expect(out.y).toBeCloseTo(dir.y, 6)
    expect(out.z).toBeCloseTo(dir.z, 6)
    expect(out.length()).toBeCloseTo(1, 6)
  })
})

describe('wandAimRotation', () => {
  const cos5 = Math.cos((5 * Math.PI) / 180)

  const dirs = [
    new Vector3(0, 0, -1),
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, -1, 0),
    new Vector3(0.5, 0.3, -0.8).normalize(),
    new Vector3(-0.4, -0.6, 0.7).normalize(),
  ]

  it('rotates the local wand axis onto representative directions within ~5 degrees', () => {
    for (const dir of dirs) {
      const q = wandAimRotation(dir)
      const pointed = WAND_LOCAL_AXIS.clone().applyQuaternion(q)
      expect(pointed.dot(dir)).toBeGreaterThanOrEqual(cos5)
    }
  })
})
