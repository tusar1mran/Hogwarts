import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { applyGesture, CAST_GESTURE_DURATION, poseWandArm, wandGesturePose } from './wandGesture'
import { ANIM_TIMINGS } from './animationMachine'

describe('wand gesture', () => {
  it('rests outside the gesture window', () => {
    expect(wandGesturePose(-0.1).weight).toBe(0)
    expect(wandGesturePose(CAST_GESTURE_DURATION).weight).toBe(0)
    expect(wandGesturePose(5).weight).toBe(0)
  })

  it('throws the arm out almost immediately, so the cast never feels delayed', () => {
    expect(wandGesturePose(0).weight).toBe(1)
    expect(wandGesturePose(0.05).reach).toBeGreaterThan(0.9)
    expect(wandGesturePose(0.1).reach).toBe(1)
    // The wrist snaps down past level as the arm extends.
    expect(wandGesturePose(0.1).pitch).toBeLessThan(0)
  })

  it('is continuous after the throw (no pops while holding or recovering)', () => {
    let prev = wandGesturePose(0.08)
    for (let t = 0.085; t < CAST_GESTURE_DURATION; t += 0.005) {
      const cur = wandGesturePose(t)
      expect(Math.abs(cur.pitch * cur.weight - prev.pitch * prev.weight)).toBeLessThan(0.05)
      expect(Math.abs(cur.reach * cur.weight - prev.reach * prev.weight)).toBeLessThan(0.1)
      prev = cur
    }
  })

  it('throws the arm and wand along the aim direction at full reach', () => {
    // Shoulder at the origin, upper arm hanging down, forearm bent forward, wand pointing up.
    const root = new Object3D()
    const upper = new Object3D()
    const fore = new Object3D()
    fore.position.set(0, -0.3, 0)
    fore.rotation.x = 1.2
    const hand = new Object3D()
    hand.position.set(0, -0.28, 0)
    const tip = new Object3D()
    tip.position.set(0.05, 0.3, 0.1)
    root.add(upper)
    upper.add(fore)
    fore.add(hand)
    hand.add(tip)
    root.updateMatrixWorld(true)

    const aim = new Vector3(0.3, 0.2, -1).normalize()
    poseWandArm({ upper, fore, hand, tip }, { pitch: 0, yaw: 0, reach: 1, weight: 1 }, 0, aim)
    root.updateMatrixWorld(true)

    const w = (o: Object3D) => o.getWorldPosition(new Vector3())
    const armDir = w(hand).sub(w(upper)).normalize()
    const wandDir = w(tip).sub(w(hand)).normalize()
    expect(armDir.dot(aim)).toBeGreaterThan(0.999)
    expect(wandDir.dot(aim)).toBeGreaterThan(0.999)
    // The elbow is mostly straightened: the arm is close to its full length.
    expect(w(hand).distanceTo(w(upper))).toBeGreaterThan(0.55)
  })

  it('keeps the cast animation state for the whole gesture', () => {
    expect(ANIM_TIMINGS.cast).toBe(CAST_GESTURE_DURATION)
  })

  it('rotates a bone about the character’s right axis regardless of its parent’s rotation', () => {
    const parent = new Object3D()
    parent.rotation.set(0.7, -1.1, 0.4)
    const bone = new Object3D()
    parent.add(bone)
    parent.updateMatrixWorld(true)
    const before = new Vector3(0, 0, -1).applyQuaternion(bone.getWorldQuaternion(new Object3D().quaternion))
    // Facing 0: forward is -Z, right is +X. A positive pitch raises the forward direction.
    applyGesture(bone, { pitch: 0.5, yaw: 0, reach: 0, weight: 1 }, 0)
    parent.updateMatrixWorld(true)
    const after = new Vector3(0, 0, -1).applyQuaternion(bone.getWorldQuaternion(new Object3D().quaternion))
    // The bone's world orientation is the old one rotated about world +X: R * before == after.
    expect(after.distanceTo(before.clone().applyAxisAngle(new Vector3(1, 0, 0), 0.5))).toBeLessThan(1e-5)
    expect(new Vector3(0, 0, -1).applyAxisAngle(new Vector3(1, 0, 0), 0.5).y).toBeGreaterThan(0)
  })
})
