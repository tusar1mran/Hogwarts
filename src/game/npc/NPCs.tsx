import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { HumanoidRig, PoseBlender, type HumanoidHandle, type RigAppearance } from '../player/HumanoidRig'
import type { AnimState } from '../core/types'
import { registerInteractable } from '../interaction/interactables'
import { registerEntity, bodyColliderHandles } from '../entities/registry'
import { runtime } from '../core/runtime'
import { dampAngle } from '../core/math'
import { useDialogue } from '../state/dialogueStore'
import { DIALOGUES } from './dialogueData'
import { FLIGHT_PLATFORM } from '../world/layout'
import { CharacterAvatar, characterLibraryAvailable, type AvatarController } from '../player/CharacterAvatar'
import { AvatarErrorBoundary } from '../player/PlayerAvatar'
import { STUDENT_OUTFIT, type Outfit } from '../player/characterModel'
import type { BodyType, HairStyle } from '../assets/manifest'

export interface NpcDef {
  id: string
  position: [number, number, number]
  /** Facing when idle (radians, 0 = -Z). */
  facing: number
  appearance: RigAppearance
  /** Dressed-model look (used when the character library is available). */
  body: BodyType
  hair: HairStyle[]
  outfit: Outfit
  /** Idle behaviour: 'idle' stands, 'practice' casts at the air every few seconds. */
  behaviour: 'idle' | 'practice' | 'reading'
}

export const NPCS: NpcDef[] = [
  {
    id: 'mentor',
    position: [38.5, 0, 22],
    facing: Math.PI / 2,
    appearance: { robe: '#3b1f2e', trim: '#d6b45c', skin: '#c99272', hair: '#cfcfcf', beard: true, hat: true, hood: false, scale: 1.05 },
    body: 'male',
    hair: ['parted', 'beard'],
    outfit: { ...STUDENT_OUTFIT, robe: '#3b1f2e', lining: '#8a6a2a', jumper: '#2a2422', scarf: ['#5a2234', '#d6b45c'], hem: 0.12, hood: false, wand: true },
    behaviour: 'idle',
  },
  {
    id: 'student',
    position: [48, 0, 34],
    facing: -Math.PI * 0.75,
    appearance: { robe: '#1f3a2c', trim: '#c8c8c8', skin: '#8d5a3c', hair: '#1b1410', scale: 0.95 },
    body: 'female',
    hair: ['long'],
    outfit: { ...STUDENT_OUTFIT, robe: '#1d2a22', lining: '#2f6b48', scarf: ['#2f6b48', '#c8c8c8'] },
    behaviour: 'practice',
  },
  {
    id: 'librarian',
    position: [-25, 0, -20.4],
    facing: Math.PI,
    appearance: { robe: '#2c2a44', trim: '#9fb4d8', skin: '#e3bc9a', hair: '#8a8a8a', hood: false, scale: 0.98, wand: false },
    body: 'female',
    hair: ['buns'],
    outfit: { ...STUDENT_OUTFIT, robe: '#2c2a44', lining: '#6f86b8', jumper: '#4a4458', scarf: ['#6f86b8', '#2c2a44'], hem: 0.08, hood: false, wand: false },
    behaviour: 'reading',
  },
  {
    id: 'flight-instructor',
    position: [FLIGHT_PLATFORM.center[0] + 2, FLIGHT_PLATFORM.height, FLIGHT_PLATFORM.center[1] - 3],
    facing: Math.PI * 0.6,
    appearance: { robe: '#5a2a18', trim: '#e0c070', skin: '#d6a77f', hair: '#b5652b', boots: '#3a2a1a', hood: false },
    body: 'male',
    hair: ['parted'],
    outfit: { ...STUDENT_OUTFIT, robe: '#4a2a18', lining: '#c08a3a', jumper: '#5a4632', trousers: '#3a2e24', scarf: ['#c08a3a', '#4a2a18'], hem: 0.55, hood: false, wand: false },
    behaviour: 'idle',
  },
  {
    // Beside the road just south of the Pilgrim Bridge, facing the spawn so new players meet him.
    id: 'groundskeeper',
    position: [7, 0, 120],
    facing: 2.4,
    appearance: { robe: '#3a3a22', trim: '#8a7a4a', skin: '#b98262', hair: '#5a4a3a', beard: true, boots: '#2a2014', hood: false, scale: 1.08, wand: false },
    body: 'male',
    hair: ['long', 'beard'],
    outfit: { ...STUDENT_OUTFIT, robe: '#3a3a22', lining: '#6a6a3a', jumper: '#4a3a2a', trousers: '#2e2a20', scarf: ['#6a6a3a', '#3a3a22'], hem: 0.35, hood: false, wand: false },
    behaviour: 'idle',
  },
]

const _toPlayer = new Vector3()

function Npc({ def, useModel }: { def: NpcDef; useModel: boolean }) {
  const root = useRef<Group>(null)
  const rig = useRef<HumanoidHandle>(null)
  const model = useRef<AvatarController>(null)
  const modelClip = useRef('')
  const body = useRef<RapierRigidBody>(null)
  const blender = useMemo(() => new PoseBlender(), [])
  const s = useRef({ t: Math.random() * 10, facing: def.facing, nextCast: 3, castAt: -10, state: 'idle' as AnimState })
  const position = useMemo(() => new Vector3(...def.position), [def.position])
  const dialogue = DIALOGUES[def.id]

  useEffect(
    () =>
      registerInteractable({
        id: `npc-${def.id}`,
        position: position.clone().setY(position.y + 1),
        radius: 3,
        verb: 'Talk to',
        label: dialogue?.name ?? def.id,
        onInteract: () => useDialogue.getState().open(def.id),
      }),
    [def.id, position, dialogue],
  )

  useEffect(
    () =>
      registerEntity(
        { id: `npc-${def.id}`, kind: 'npc', getPosition: (out) => out.copy(position).setY(position.y + 1) },
        bodyColliderHandles(body.current),
      ),
    [def.id, position],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = s.current
    st.t += dt
    if (!root.current) return
    // Turn to face the player when they come close, otherwise return to the idle facing.
    _toPlayer.subVectors(runtime.player.position, position)
    _toPlayer.y = 0
    const near = _toPlayer.length() < 6
    const talking = useDialogue.getState().active?.npcId === def.id
    const targetFacing = near || talking ? Math.atan2(-_toPlayer.x, -_toPlayer.z) : def.facing
    st.facing = dampAngle(st.facing, targetFacing, 4, dt)
    root.current.rotation.y = st.facing
    const r = rig.current

    let state: AnimState = 'idle'
    if (def.behaviour === 'practice' && !near) {
      if (st.t > st.nextCast) {
        st.castAt = st.t
        st.nextCast = st.t + 3 + Math.random() * 3
      }
      state = st.t - st.castAt < 0.42 ? 'cast' : 'aim'
    }
    if (def.behaviour === 'reading' && !near) state = 'aim'

    // Dressed model: map behaviour to library clips.
    const m = model.current
    if (m) {
      let clip = talking ? 'Idle_Talking_Loop' : 'Idle_Loop'
      if (!talking && def.behaviour === 'practice' && !near) clip = state === 'cast' ? 'Spell_Simple_Shoot' : 'Spell_Simple_Idle_Loop'
      if (clip !== modelClip.current) {
        m.play(clip, { once: clip === 'Spell_Simple_Shoot', fade: 0.25 })
        modelClip.current = clip
      }
      return
    }
    if (!r?.joints?.hips) return
    blender.update(state, dt, 8)
    blender.apply(r.joints, { t: st.t, phase: 0, oneShot: Math.min(1, (st.t - st.castAt) / 0.42), aimPitch: def.behaviour === 'reading' ? -0.6 : 0.05, turn: 0 }, 0.98)
  })

  return (
    <group>
      <RigidBody ref={body} type="fixed" colliders={false} position={[position.x, position.y + 0.9, position.z]}>
        <CapsuleCollider args={[0.55, 0.38]} />
      </RigidBody>
      <group ref={root} position={position}>
        {useModel ? (
          <AvatarErrorBoundary fallback={<HumanoidRig ref={rig} appearance={def.appearance} />}>
            <Suspense fallback={<HumanoidRig ref={rig} appearance={def.appearance} />}>
              <group rotation-y={Math.PI}>
                <CharacterAvatar ref={model} body={def.body} hair={def.hair} outfit={def.outfit} />
              </group>
            </Suspense>
          </AvatarErrorBoundary>
        ) : (
          <HumanoidRig ref={rig} appearance={def.appearance} />
        )}
      </group>
    </group>
  )
}

export function NPCs() {
  const [useModel, setUseModel] = useState(false)
  useEffect(() => {
    let alive = true
    void characterLibraryAvailable().then((ok) => alive && setUseModel(ok))
    return () => {
      alive = false
    }
  }, [])
  return (
    <group>
      {NPCS.map((n) => (
        <Npc key={n.id} def={n} useModel={useModel} />
      ))}
    </group>
  )
}
