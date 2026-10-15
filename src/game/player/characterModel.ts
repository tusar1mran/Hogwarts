import {
  AnimationClip,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RepeatWrapping,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  type Bone,
  type KeyframeTrack,
  type Material,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createRng } from '../core/math'

/**
 * Dresses a Quaternius base character (CC0) as an Eldoria student.
 *
 * Clothing is generated from the body itself so it deforms with the same skeleton:
 *  - fitted shells (jumper, trousers, boots, coat) are copies of body regions pushed out along
 *    the normals, with region chosen from each vertex's dominant bone;
 *  - the long robe skirt is a generated, skinned tube weighted between pelvis and thighs;
 *  - belt, scarf, hood and wand are rigid meshes attached to bones.
 */

export interface Outfit {
  robe: string
  lining: string
  jumper: string
  trousers: string
  boots: string
  scarf: [string, string]
  belt: string
  /** Robe hem height above the ground, metres (lower = longer robe). */
  hem: number
  hood: boolean
  wand: boolean
  skinTint?: string
}

export const STUDENT_OUTFIT: Outfit = {
  robe: '#171b2c',
  lining: '#2c3e78',
  jumper: '#3a3d46',
  trousers: '#24232a',
  boots: '#3a2416',
  scarf: ['#1f3270', '#c9a85a'],
  belt: '#4a2f1d',
  hem: 0.3,
  hood: true,
  wand: true,
}

export interface DressedCharacter {
  root: Group
  wandTip: Object3D | null
  dispose: () => void
}

type Region = 'skin' | 'jumper' | 'trousers' | 'boots'

const _v = new Vector3()
const _n = new Vector3()

function regionFor(bone: string, y: number): Region {
  if (/^(Head|neck_01|hand_|index_|middle_|pinky_|ring_|thumb_)/.test(bone)) return 'skin'
  if (/^(foot_|ball_)/.test(bone)) return 'boots'
  if (bone.startsWith('calf_')) return y < 0.4 ? 'boots' : 'trousers'
  if (bone.startsWith('thigh_')) return 'trousers'
  if (bone === 'pelvis') return y > 0.98 ? 'jumper' : 'trousers'
  return 'jumper'
}

/** Fine woven-fabric normal map, shared by all cloth materials. */
let fabricNormal: CanvasTexture | null = null
function getFabricNormal() {
  if (fabricNormal) return fabricNormal
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const rng = createRng(3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.sin((x / size) * Math.PI * 32) * 0.5
      const weft = Math.sin((y / size) * Math.PI * 32) * 0.5
      const noise = (rng() - 0.5) * 0.25
      const i = (y * size + x) * 4
      img.data[i] = (0.5 + warp * 0.35 + noise) * 255
      img.data[i + 1] = (0.5 + weft * 0.35 + noise) * 255
      img.data[i + 2] = 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  fabricNormal = new CanvasTexture(c)
  fabricNormal.wrapS = fabricNormal.wrapT = RepeatWrapping
  fabricNormal.repeat.set(8, 8)
  return fabricNormal
}

function cloth(color: string, roughness = 0.9, sheen = 0.15) {
  const m = new MeshStandardMaterial({ color: new Color(color), roughness, metalness: 0, normalMap: getFabricNormal() })
  m.normalScale.set(sheen + 0.25, sheen + 0.25)
  return m
}

/** Copies the body triangles of one region and inflates them along the normals. */
function shellGeometry(body: SkinnedMesh, regionOf: Int8Array, wanted: Set<number>, offset: number, extraOffset?: (y: number) => number) {
  const src = body.geometry
  const pos = src.attributes.position
  const nrm = src.attributes.normal
  const index = src.index
  const tri: number[] = []
  const count = index ? index.count : pos.count
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i
    const b = index ? index.getX(i + 1) : i + 1
    const c = index ? index.getX(i + 2) : i + 2
    if (wanted.has(regionOf[a]) && wanted.has(regionOf[b]) && wanted.has(regionOf[c])) tri.push(a, b, c)
  }
  const g = new BufferGeometry()
  const p = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i)
    _n.fromBufferAttribute(nrm, i)
    const off = offset + (extraOffset ? extraOffset(_v.y) : 0)
    p[i * 3] = _v.x + _n.x * off
    p[i * 3 + 1] = _v.y + _n.y * off
    p[i * 3 + 2] = _v.z + _n.z * off
  }
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setAttribute('normal', nrm)
  if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv)
  g.setAttribute('skinIndex', src.attributes.skinIndex)
  g.setAttribute('skinWeight', src.attributes.skinWeight)
  g.setIndex(tri)
  return g
}

function boneByName(bones: Bone[], name: string) {
  return bones.find((b) => b.name === name) ?? null
}

/** Attach a rigid object to a bone so it sits at the given bind-pose world transform. */
function attachRigid(bone: Object3D, object: Object3D, worldPos: Vector3, worldQuat = new Quaternion()) {
  const world = new Matrix4().compose(worldPos, worldQuat, new Vector3(1, 1, 1))
  const local = new Matrix4().copy(bone.matrixWorld).invert().multiply(world)
  local.decompose(object.position, object.quaternion, object.scale)
  bone.add(object)
}

/** Horizontal extents of the body around height y (bind pose, mesh space). */
function slice(body: SkinnedMesh, y: number, band = 0.025) {
  const pos = body.geometry.attributes.position
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i)
    if (Math.abs(py - y) > band) continue
    const px = pos.getX(i)
    // Ignore the arms in T-pose.
    if (Math.abs(px) > 0.3) continue
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minZ = Math.min(minZ, pos.getZ(i))
    maxZ = Math.max(maxZ, pos.getZ(i))
  }
  if (!Number.isFinite(minX)) return { cx: 0, cz: 0, rx: 0.17, rz: 0.12 }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rx: (maxX - minX) / 2, rz: (maxZ - minZ) / 2 }
}

/** Long skirt of the robe: a tube from the waist to the hem, open at the front, skinned to pelvis and thighs. */
function robeSkirt(body: SkinnedMesh, bones: Bone[], outfit: Outfit, frontSign: number, robe: Material, lining: Material) {
  const pelvis = bones.indexOf(boneByName(bones, 'pelvis')!)
  const thighL = bones.indexOf(boneByName(bones, 'thigh_l')!)
  const thighR = bones.indexOf(boneByName(bones, 'thigh_r')!)
  const calfL = bones.indexOf(boneByName(bones, 'calf_l')!)
  const calfR = bones.indexOf(boneByName(bones, 'calf_r')!)
  const thighLPos = new Vector3().setFromMatrixPosition(bones[thighL].matrixWorld)
  const leftSign = Math.sign(thighLPos.x) || 1

  const top = 1.02
  const bottom = outfit.hem
  const waist = slice(body, top)
  const hips = slice(body, 0.85, 0.04)
  const rows = 12
  const segs = 36
  const opening = 0.32 // radians either side of the front left open
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const skinIdx: number[] = []
  const skinW: number[] = []
  const index: number[] = []
  const front = frontSign > 0 ? 0 : Math.PI // angle of the front (+Z when frontSign > 0)

  for (let r = 0; r <= rows; r++) {
    const t = r / rows
    const y = top + (bottom - top) * t
    // Fit the waist, widen over the hips, then flare towards the hem.
    const fit = t < 0.25 ? t / 0.25 : 1
    const rx = (waist.rx + (hips.rx - waist.rx) * fit) + 0.045 + t * t * 0.16
    const rz = (waist.rz + (hips.rz - waist.rz) * fit) + 0.05 + t * t * 0.13
    const cz = waist.cz + (hips.cz - waist.cz) * fit
    for (let s = 0; s <= segs; s++) {
      const u = s / segs
      // Sweep around from one side of the opening to the other.
      const a = front + opening + u * (Math.PI * 2 - opening * 2)
      const x = Math.sin(a) * rx
      const z = cz + Math.cos(a) * rz
      positions.push(x, y, z)
      normals.push(Math.sin(a), 0.15, Math.cos(a))
      uvs.push(u * 4, t * 3)
      // Weights: pelvis at the waist, legs towards the hem, split by side.
      const side = (x / rx) * leftSign // +1 on the left leg's side
      const l = Math.min(1, Math.max(0, 0.5 + side * 0.9))
      const leg = Math.min(0.8, t * 0.95)
      const calf = Math.max(0, t - 0.6) * 0.5
      const wp = 1 - leg
      skinIdx.push(pelvis, thighL, thighR, l > 0.5 ? calfL : calfR)
      skinW.push(wp, (leg - calf) * l, (leg - calf) * (1 - l), calf)
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s
      const b = a + segs + 1
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setAttribute('skinIndex', new Uint16BufferAttribute(skinIdx, 4))
  g.setAttribute('skinWeight', new Float32BufferAttribute(skinW, 4))
  g.setIndex(index)
  g.computeVertexNormals()

  // Double-sided: the inside of the robe shows the lining colour via a back-face material group.
  g.clearGroups()
  g.addGroup(0, index.length, 0)
  g.addGroup(0, index.length, 1)
  const outer = new SkinnedMesh(g, [robe, lining])
  outer.position.copy(body.position)
  outer.quaternion.copy(body.quaternion)
  outer.scale.copy(body.scale)
  outer.bind(body.skeleton, body.bindMatrix)
  outer.castShadow = true
  outer.frustumCulled = false
  return { outer, geometry: g }
}

/**
 * Build a dressed, animatable copy of a base character scene.
 * The returned root faces +Z (glTF convention); rotate by PI to face -Z.
 */
export function dressCharacter(source: Object3D, outfit: Outfit, hairStyles: Object3D[] = []): DressedCharacter {
  const root = new Group()
  const scene = cloneSkinned(source)
  root.add(scene)
  scene.updateMatrixWorld(true)
  const headBone = scene.getObjectByName('Head')
  for (const style of hairStyles) {
    const hair = style.clone(true)
    hair.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mat = (mesh.material as MeshStandardMaterial).clone()
      // Hair cards use alpha in the colour map: cut out instead of sorting transparency.
      mat.transparent = false
      mat.alphaTest = 0.4
      mat.side = DoubleSide
      mesh.material = mat
    })
    // Hairstyles are authored in character space, so attach with the identity bind transform.
    if (headBone) attachRigid(headBone, hair, new Vector3(0, 0, 0))
    else scene.add(hair)
  }

  const disposables: Array<{ dispose: () => void }> = []
  let body: SkinnedMesh | null = null
  let face: Object3D | null = null
  scene.traverse((o) => {
    const sm = o as SkinnedMesh
    if (!sm.isSkinnedMesh) return
    sm.castShadow = true
    sm.receiveShadow = true
    sm.frustumCulled = false
    const name = (Array.isArray(sm.material) ? sm.material[0] : sm.material)?.name ?? ''
    if (/Superhero|Body|Regular|Teen/i.test(name)) body = sm
    if (/Eyes/i.test(name)) face = sm
  })
  if (!body) return { root, wandTip: null, dispose: () => undefined }
  const b = body as SkinnedMesh
  const bones = b.skeleton.bones

  // Which way the face points (+Z for glTF exports, but measure rather than assume).
  let frontSign = 1
  if (face) {
    const fg = (face as SkinnedMesh).geometry
    fg.computeBoundingBox()
    const c = fg.boundingBox!.getCenter(new Vector3())
    frontSign = c.z >= 0 ? 1 : -1
  }

  // Region per vertex from the dominant bone.
  const pos = b.geometry.attributes.position
  const si = b.geometry.attributes.skinIndex
  const sw = b.geometry.attributes.skinWeight
  const regionOf = new Int8Array(pos.count)
  const code: Record<Region, number> = { skin: 0, jumper: 1, trousers: 2, boots: 3 }
  for (let i = 0; i < pos.count; i++) {
    let best = 0
    let bestW = -1
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k)
      if (w > bestW) {
        bestW = w
        best = si.getComponent(i, k)
      }
    }
    regionOf[i] = code[regionFor(bones[best]?.name ?? '', pos.getY(i))]
  }

  const mats = {
    jumper: cloth(outfit.jumper, 0.95, 0.3),
    trousers: cloth(outfit.trousers, 0.85),
    boots: new MeshStandardMaterial({ color: outfit.boots, roughness: 0.45, metalness: 0.05 }),
    robe: cloth(outfit.robe, 0.8, 0.2),
    lining: cloth(outfit.lining, 0.6, 0.1),
    belt: new MeshStandardMaterial({ color: outfit.belt, roughness: 0.55 }),
    brass: new MeshStandardMaterial({ color: '#c49a4a', roughness: 0.3, metalness: 0.9 }),
    scarfA: cloth(outfit.scarf[0], 0.95, 0.3),
    scarfB: cloth(outfit.scarf[1], 0.95, 0.3),
    wand: new MeshStandardMaterial({ color: '#3a2618', roughness: 0.45 }),
    wandTip: new MeshStandardMaterial({ color: '#cfeaff', emissive: new Color('#7fc8ff'), emissiveIntensity: 2.5, toneMapped: false }),
  }
  mats.robe.side = DoubleSide
  // Skirt: robe on the outside (front faces), lining visible from inside (back faces).
  const skirtOuter = mats.robe.clone()
  skirtOuter.side = 0 // FrontSide
  const skirtInner = mats.lining.clone()
  skirtInner.side = 1 // BackSide
  disposables.push(skirtOuter, skirtInner)
  Object.values(mats).forEach((m) => disposables.push(m))

  const addShell = (regions: Region[], offset: number, material: Material, extra?: (y: number) => number) => {
    const g = shellGeometry(b, regionOf, new Set(regions.map((r) => code[r])), offset, extra)
    const m = new SkinnedMesh(g, material)
    m.position.copy(b.position)
    m.quaternion.copy(b.quaternion)
    m.scale.copy(b.scale)
    m.bind(b.skeleton, b.bindMatrix)
    m.castShadow = true
    m.frustumCulled = false
    b.parent!.add(m)
    disposables.push(g)
    return m
  }

  addShell(['boots'], 0.016, mats.boots)
  addShell(['trousers'], 0.007, mats.trousers)
  addShell(['jumper'], 0.008, mats.jumper)
  // Open robe over the jumper: slightly looser on the chest and sleeves.
  addShell(['jumper'], 0.022, mats.robe, (y) => (y < 1.05 ? 0.004 : 0))

  const skirt = robeSkirt(b, bones, outfit, frontSign, skirtOuter, skirtInner)
  b.parent!.add(skirt.outer)
  disposables.push(skirt.geometry)

  // Rigid accessories.
  const pelvis = boneByName(bones, 'pelvis')
  const spine3 = boneByName(bones, 'spine_03')
  const neck = boneByName(bones, 'neck_01')
  const hand = boneByName(bones, 'hand_r')
  const middle = boneByName(bones, 'middle_01_r')

  if (pelvis) {
    const w = slice(b, 1.0)
    const beltGeo = new TorusGeometry(1, 0.035, 6, 32)
    disposables.push(beltGeo)
    const belt = new Mesh(beltGeo, mats.belt)
    belt.scale.set(w.rx + 0.045, w.rz + 0.05, 1)
    belt.castShadow = true
    const holder = new Object3D()
    holder.add(belt)
    belt.rotation.x = Math.PI / 2
    attachRigid(pelvis, holder, new Vector3(w.cx, 1.0, w.cz))
    const buckleGeo = new BoxGeometry(0.07, 0.055, 0.02)
    disposables.push(buckleGeo)
    const buckle = new Mesh(buckleGeo, mats.brass)
    attachRigid(pelvis, buckle, new Vector3(w.cx, 1.0, w.cz + frontSign * (w.rz + 0.06)))
  }

  if (neck && spine3) {
    const neckPos = new Vector3().setFromMatrixPosition(neck.matrixWorld)
    const n = slice(b, neckPos.y - 0.01, 0.02)
    const scarfGeo = new TorusGeometry(1, 0.03, 8, 28)
    disposables.push(scarfGeo)
    // Two-colour wrap.
    for (let i = 0; i < 2; i++) {
      const ring = new Mesh(scarfGeo, i === 0 ? mats.scarfA : mats.scarfB)
      ring.scale.set(n.rx + 0.035 + i * 0.006, n.rz + 0.04 + i * 0.006, 1 + i * 0.1)
      ring.rotation.x = Math.PI / 2
      ring.castShadow = true
      const holder = new Object3D()
      holder.add(ring)
      attachRigid(neck, holder, new Vector3(n.cx, neckPos.y - 0.02 - i * 0.035, n.cz))
    }
    // Hanging ends with stripes.
    const tailGeo = new BoxGeometry(0.075, 0.07, 0.018)
    disposables.push(tailGeo)
    for (const sx of [-0.05, 0.035]) {
      for (let k = 0; k < 5; k++) {
        const stripe = new Mesh(tailGeo, k % 2 === 0 ? mats.scarfA : mats.scarfB)
        stripe.castShadow = true
        const y = neckPos.y - 0.08 - k * 0.07
        const z = n.cz + frontSign * (slice(b, y, 0.03).rz + 0.05)
        attachRigid(spine3, stripe, new Vector3(n.cx + sx, y, z), new Quaternion().setFromEuler(new Euler(frontSign * 0.08, 0, sx > 0 ? 0.06 : -0.04)))
      }
    }
    if (outfit.hood) {
      const hoodGeo = new SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)
      disposables.push(hoodGeo)
      const hood = new Mesh(hoodGeo, mats.robe)
      hood.scale.set(1.05, 0.55, 0.75)
      hood.castShadow = true
      attachRigid(spine3, hood, new Vector3(n.cx, neckPos.y - 0.06, n.cz - frontSign * (n.rz + 0.07)), new Quaternion().setFromEuler(new Euler(-frontSign * 0.5, 0, 0)))
    }
  }

  let wandTip: Object3D | null = null
  if (outfit.wand && hand) {
    const handPos = new Vector3().setFromMatrixPosition(hand.matrixWorld)
    const dir = middle ? new Vector3().setFromMatrixPosition(middle.matrixWorld).sub(handPos).normalize() : new Vector3(1, 0, 0)
    // Point the wand out of the fist, angled slightly forward of the fingers.
    dir.addScaledVector(new Vector3(0, 0, frontSign), 0.35).normalize()
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir)
    const wandGeo = new CylinderGeometry(0.006, 0.011, 0.34, 6)
    wandGeo.translate(0, 0.17, 0)
    const tipGeo = new SphereGeometry(0.016, 8, 6)
    disposables.push(wandGeo, tipGeo)
    const wand = new Group()
    const shaft = new Mesh(wandGeo, mats.wand)
    shaft.castShadow = true
    const glow = new Mesh(tipGeo, mats.wandTip)
    glow.position.y = 0.34
    wandTip = new Object3D()
    wandTip.position.y = 0.36
    wand.add(shaft, glow, wandTip)
    const grip = handPos.clone().addScaledVector(dir, 0.05)
    attachRigid(hand, wand, grip, q)
  }

  return {
    root,
    wandTip,
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}

/**
 * Prepare animation clips from the shared animation library for a character whose bone
 * lengths differ slightly: keep rotations, keep only the pelvis translation (scaled), drop scale.
 */
export function retargetClips(clips: AnimationClip[], character: Object3D, animationRoot: Object3D): AnimationClip[] {
  const charPelvis = character.getObjectByName('pelvis')
  const animPelvis = animationRoot.getObjectByName('pelvis')
  const ratio = charPelvis && animPelvis && animPelvis.position.length() > 0 ? charPelvis.position.length() / animPelvis.position.length() : 1
  return clips.map((clip) => {
    const tracks: KeyframeTrack[] = []
    for (const t of clip.tracks) {
      const [node, prop] = t.name.split('.')
      if (prop === 'scale') continue
      if (prop === 'position') {
        if (node !== 'pelvis') continue
        const scaled = t.clone()
        for (let i = 0; i < scaled.values.length; i++) scaled.values[i] *= ratio
        tracks.push(scaled)
        continue
      }
      tracks.push(t)
    }
    return new AnimationClip(clip.name, clip.duration, tracks)
  })
}

