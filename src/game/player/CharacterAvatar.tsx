import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three'
import { CHARACTER_ASSETS, type BodyType, type HairStyle } from '../assets/manifest'
import { dressCharacter, retargetClips, type Outfit } from './characterModel'
import { probeAsset } from '../assets/probe'

/**
 * Skinned, dressed characters built from the bundled CC0 character library.
 * Loading suspends (wrap in <Suspense>); failures should be caught by an error boundary so
 * callers can fall back to the procedural rig.
 */

// No model in the library uses Draco, so never fetch a decoder from a CDN.
const NO_DRACO = false

export function preloadCharacterLibrary() {
  for (const url of Object.values(CHARACTER_ASSETS.bodies)) useGLTF.preload(url, NO_DRACO)
  for (const url of Object.values(CHARACTER_ASSETS.hair)) useGLTF.preload(url, NO_DRACO)
  useGLTF.preload(CHARACTER_ASSETS.animations, NO_DRACO)
}

const clipCache = new Map<BodyType, AnimationClip[]>()

export interface AvatarController {
  root: Object3D
  wandTip: Object3D | null
  pelvis: Object3D | null
  /** Cross-fade to a clip. Returns the action, or null when the clip does not exist. */
  play: (clip: string, opts?: { once?: boolean; fade?: number }) => AnimationAction | null
  current: () => AnimationAction | null
  has: (clip: string) => boolean
}

export interface CharacterAvatarProps {
  body: BodyType
  hair: HairStyle[]
  outfit: Outfit
  initialClip?: string
}

export const CharacterAvatar = forwardRef<AvatarController, CharacterAvatarProps>(function CharacterAvatar({ body, hair, outfit, initialClip = 'Idle_Loop' }, ref) {
  const bodyGltf = useGLTF(CHARACTER_ASSETS.bodies[body], NO_DRACO)
  const anims = useGLTF(CHARACTER_ASSETS.animations, NO_DRACO)
  // Load every hairstyle so the hook order never changes, then pick the requested ones.
  const hairScenes = {
    parted: useGLTF(CHARACTER_ASSETS.hair.parted, NO_DRACO).scene,
    long: useGLTF(CHARACTER_ASSETS.hair.long, NO_DRACO).scene,
    buns: useGLTF(CHARACTER_ASSETS.hair.buns, NO_DRACO).scene,
    beard: useGLTF(CHARACTER_ASSETS.hair.beard, NO_DRACO).scene,
  }
  const hairKey = hair.join(',')

  const dressed = useMemo(
    () => dressCharacter(bodyGltf.scene, outfit, hair.map((h) => hairScenes[h])),
    // hairScenes entries are stable cached scenes; hairKey captures the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodyGltf.scene, outfit, hairKey],
  )
  useEffect(() => () => dressed.dispose(), [dressed])

  const clips = useMemo(() => {
    let c = clipCache.get(body)
    if (!c) {
      c = retargetClips(anims.animations, bodyGltf.scene, anims.scene)
      clipCache.set(body, c)
    }
    return c
  }, [body, anims, bodyGltf.scene])

  const mixer = useMemo(() => new AnimationMixer(dressed.root), [dressed])
  const actions = useMemo(() => new Map(clips.map((c) => [c.name, mixer.clipAction(c)])), [clips, mixer])
  const current = useRef<AnimationAction | null>(null)

  const controller = useMemo<AvatarController>(() => {
    const play: AvatarController['play'] = (name, opts = {}) => {
      const action = actions.get(name)
      if (!action) return null
      if (action === current.current && !opts.once) return action
      action.reset()
      action.setLoop(opts.once ? LoopOnce : LoopRepeat, Infinity)
      action.clampWhenFinished = !!opts.once
      action.enabled = true
      action.setEffectiveWeight(1)
      action.setEffectiveTimeScale(1)
      const prev = current.current
      if (prev && prev !== action) action.crossFadeFrom(prev, opts.fade ?? 0.2, false)
      action.play()
      current.current = action
      return action
    }
    return {
      root: dressed.root,
      wandTip: dressed.wandTip,
      pelvis: dressed.root.getObjectByName('pelvis') ?? null,
      play,
      current: () => current.current,
      has: (name) => actions.has(name),
    }
  }, [actions, dressed])

  useEffect(() => {
    controller.play(initialClip, { fade: 0 })
    return () => {
      mixer.stopAllAction()
      current.current = null
    }
  }, [controller, initialClip, mixer])

  useImperativeHandle(ref, () => controller, [controller])

  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)))

  return <primitive object={dressed.root} />
})

let availability: Promise<boolean> | null = null

/** Resolves once whether the character library files are present (cached). */
export function characterLibraryAvailable(): Promise<boolean> {
  availability ??= Promise.all([
    probeAsset(CHARACTER_ASSETS.bodies.male),
    probeAsset(CHARACTER_ASSETS.bodies.female),
    probeAsset(CHARACTER_ASSETS.animations),
  ]).then((r) => r.every(Boolean))
  return availability
}
