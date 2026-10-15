import { Quaternion, Vector3 } from 'three'
import { clamp } from '../core/math'
import { CAMERA_LIMITS } from '../camera/CameraRig'

/**
 * Pure helpers for pointing the held wand along the aim direction.
 *
 * The procedural wand mesh grows from the hand down its local -Y axis (the wandTip empty
 * sits at [0,-0.36,0]), so WAND_LOCAL_AXIS is the direction the tip points in the wand
 * group's own frame. Keeping these as pure functions makes the quaternion/clamp maths
 * unit-testable without a scene.
 */

/** Local axis of the wand group that points towards the tip. */
export const WAND_LOCAL_AXIS = new Vector3(0, -1, 0)

const _dir = new Vector3()
const _quat = new Quaternion()

/**
 * Clamp a world-space aim direction so its pitch stays inside the camera's ground limits,
 * preserving yaw. Returns a fresh unit Vector3.
 */
export function clampWorldAimPitch(aimDir: Vector3, limits: readonly [number, number] = CAMERA_LIMITS.groundPitch): Vector3 {
  _dir.copy(aimDir).normalize()
  const worldPitch = Math.asin(clamp(_dir.y, -1, 1))
  const clampedPitch = clamp(worldPitch, limits[0], limits[1])
  const yaw = Math.atan2(_dir.x, _dir.z)
  const cp = Math.cos(clampedPitch)
  return new Vector3(Math.sin(yaw) * cp, Math.sin(clampedPitch), Math.cos(yaw) * cp)
}

/**
 * Rotation that turns WAND_LOCAL_AXIS to point along the given direction (expressed in the
 * wand group's parent space). Returns a fresh Quaternion.
 */
export function wandAimRotation(parentSpaceAimDir: Vector3): Quaternion {
  _dir.copy(parentSpaceAimDir).normalize()
  return _quat.setFromUnitVectors(WAND_LOCAL_AXIS, _dir).clone()
}
