import { Quaternion, Vector3, type Object3D } from 'three'

/**
 * Wand casting gesture: the moment the spell is cast, the wand arm thrusts straight out towards
 * the aim point as if throwing the spell, with a small wrist flick, holds briefly, then returns.
 * The spell itself leaves on the click (no wind-up delay); the throw plays over it.
 *
 *   thrust 0 -> THRUST_END, hold until HOLD_END, recover until CAST_GESTURE_DURATION.
 *
 * The pose curve is pure so it can be tested without a scene; poseWandArm turns a pose into
 * bone rotations for either avatar.
 */

const THRUST_END = 0.07
const HOLD_END = 0.22

/** Seconds until the arm is back in its normal pose; animation and facing treat the player as "casting" this long. */
export const CAST_GESTURE_DURATION = 0.42

export interface GesturePose {
  /** Wrist rotation about the character's right axis; positive raises the wand tip. */
  pitch: number
  /** Wrist rotation about the vertical axis; positive swings the tip to the character's left. */
  yaw: number
  /** 0..1 how far the arm is thrust out along the aim direction (elbow straight, wand forward). */
  reach: number
  /** 0..1 blend weight of the whole gesture over the underlying animation. */
  weight: number
}

const REST: GesturePose = { pitch: 0, yaw: 0, reach: 0, weight: 0 }
const smooth = (x: number) => x * x * (3 - 2 * x)
/** Fast start, soft stop: the arm shoots out and then settles, like a throw. */
const throwOut = (x: number) => 1 - (1 - x) ** 3
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

const RAISE = 0.3
/** Small wrist snap at the end of the thrust; the arm itself does most of the work. */
const FLICK_DOWN = -0.18

/** Gesture pose `t` seconds after the cast. Outside the gesture it returns rest. */
export function wandGesturePose(t: number): GesturePose {
  if (!(t >= 0) || t >= CAST_GESTURE_DURATION) return REST
  if (t < THRUST_END) {
    const k = throwOut(t / THRUST_END)
    return { pitch: lerp(RAISE, FLICK_DOWN, k), yaw: 0, reach: k, weight: 1 }
  }
  if (t < HOLD_END) return { pitch: FLICK_DOWN, yaw: 0, reach: 1, weight: 1 }
  const k = smooth((t - HOLD_END) / (CAST_GESTURE_DURATION - HOLD_END))
  return { pitch: FLICK_DOWN, yaw: 0, reach: 1, weight: 1 - k }
}

/** True while the gesture is still moving the wand (used for the tip trail). */
export const gestureActive = (t: number) => t >= 0 && t < CAST_GESTURE_DURATION

const _up = new Vector3(0, 1, 0)
const _right = new Vector3()
const _qYaw = new Quaternion()
const _qPitch = new Quaternion()
const _world = new Quaternion()
const _parent = new Quaternion()
const _delta = new Quaternion()
const _identity = new Quaternion()
const _full = new Quaternion()

/**
 * Rotate `bone` about its own pivot by a world-space rotation. Works for any bone axis
 * convention because the rotation is converted into the bone's parent space:
 *   local' = parent^-1 * R * parent * local
 */
function rotateBoneWorld(bone: Object3D, worldRotation: Quaternion) {
  if (!bone.parent) return
  bone.parent.getWorldQuaternion(_parent)
  _delta.copy(_parent).invert().multiply(worldRotation).multiply(_parent)
  bone.quaternion.premultiply(_delta)
}

/**
 * Rotate `bone` by the gesture's wrist pose, expressed in the character's frame (facing yaw,
 * 0 = -Z), scaled by `amount`.
 */
export function applyGesture(bone: Object3D, pose: GesturePose, facing: number, amount = 1) {
  const w = pose.weight * amount
  if (w <= 1e-4) return
  _right.set(Math.cos(facing), 0, -Math.sin(facing))
  _qYaw.setFromAxisAngle(_up, pose.yaw * w)
  _qPitch.setFromAxisAngle(_right, pose.pitch * w)
  rotateBoneWorld(bone, _world.multiplyQuaternions(_qYaw, _qPitch))
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _from = new Vector3()
const _to = new Vector3()

/** Turn `bone` so the world direction `from` swings towards `to`, by `amount` (0..1). */
export function alignBone(bone: Object3D, from: Vector3, to: Vector3, amount: number) {
  if (amount <= 1e-4 || from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return
  _full.setFromUnitVectors(_from.copy(from).normalize(), _to.copy(to).normalize())
  rotateBoneWorld(bone, _world.slerpQuaternions(_identity, _full, Math.min(1, amount)))
}

export interface WandArm {
  upper: Object3D | null
  fore: Object3D | null
  hand: Object3D | null
  /** Wand tip; when given, the hand turns so the wand points along the aim as the arm extends. */
  tip: Object3D | null
}

/** How straight the elbow gets at full reach; a locked-straight arm looks robotic. */
const ELBOW_STRAIGHTEN = 0.85

/**
 * Pose the casting arm for one frame, on top of whatever the animation set: a slight wind-up on
 * the forearm and hand, then the throw (elbow straightens, arm and wand swing onto the aim
 * direction), then the wrist flick. `aim` is a world-space direction.
 */
export function poseWandArm(arm: WandArm, pose: GesturePose, facing: number, aim: Vector3, scale = { fore: 0.5, hand: 0.75 }) {
  if (pose.weight <= 0) return
  const reach = pose.reach * pose.weight
  const loop = 1 - pose.reach
  if (arm.fore) applyGesture(arm.fore, pose, facing, scale.fore * loop)
  if (arm.hand) applyGesture(arm.hand, pose, facing, scale.hand * loop)

  if (reach > 1e-4 && arm.upper && arm.fore && arm.hand) {
    // Straighten the elbow: swing the forearm onto the upper arm's line.
    arm.upper.getWorldPosition(_a)
    arm.fore.getWorldPosition(_b)
    arm.hand.getWorldPosition(_c)
    alignBone(arm.fore, _c.sub(_b), _b.sub(_a), reach * ELBOW_STRAIGHTEN)
    // Throw the whole arm along the aim: shoulder -> wrist onto the aim direction.
    arm.upper.getWorldPosition(_a)
    arm.hand.getWorldPosition(_c)
    alignBone(arm.upper, _c.sub(_a), aim, reach)
    // Point the wand itself along the aim.
    if (arm.tip) {
      arm.hand.getWorldPosition(_c)
      arm.tip.getWorldPosition(_b)
      alignBone(arm.hand, _b.sub(_c), aim, reach)
    }
  }

  if (arm.hand) applyGesture(arm.hand, pose, facing, scale.hand * pose.reach)
}
