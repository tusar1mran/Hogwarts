/**
 * Builds the optimised character assets used by the game from the Quaternius CC0 packs.
 *
 *   node scripts/build-character-assets.mjs <path to "Universal Base Characters[Standard]"> <path to UAL1_Standard.glb>
 *
 * Outputs (public/assets/models/):
 *   student_male.glb    base body + hair + eyes, textures resized to 1024 px WebP
 *   student_female.glb  same for the female base body
 *   animations.glb      the animation clips the game uses, no mesh
 *   hair_*.glb          hairstyles positioned in character space (attached to the head bone at runtime)
 *
 * Source packs (CC0 1.0, by Quaternius):
 *   https://quaternius.itch.io/universal-base-characters
 *   https://quaternius.itch.io/universal-animation-library
 */
import path from 'node:path'
import fs from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const [, , ubcDir, ualFile] = process.argv
if (!ubcDir || !ualFile) {
  console.error('Usage: node scripts/build-character-assets.mjs <UBC Standard dir> <UAL1_Standard.glb>')
  process.exit(1)
}

const OUT = path.resolve('public/assets/models')
fs.mkdirSync(OUT, { recursive: true })
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

/** Clips the game maps to its animation states (see MODEL_ASSETS in src/game/assets/manifest.ts). */
const KEEP_CLIPS = new Set([
  'Idle_Loop',
  'Idle_Talking_Loop',
  'Walk_Loop',
  'Walk_Formal_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Hit_Chest',
  'Hit_Head',
  'Spell_Simple_Enter',
  'Spell_Simple_Idle_Loop',
  'Spell_Simple_Shoot',
  'Spell_Simple_Exit',
  'Sitting_Idle_Loop',
  'Sitting_Enter',
  'Sitting_Exit',
  'Interact',
  'PickUp_Table',
  'Roll',
])

/**
 * Reads a .gltf with external resources. Some image URIs in the pack carry a stray "_png"
 * suffix that does not exist on disk; fall back to the name without it.
 */
async function readGltfTolerant(file, searchDirs = []) {
  const dir = path.dirname(file)
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const resources = {}
  const load = (uri) => {
    let p = path.join(dir, decodeURIComponent(uri))
    for (const extra of searchDirs) {
      if (fs.existsSync(p)) break
      p = path.join(extra, decodeURIComponent(uri))
    }
    if (!fs.existsSync(p)) {
      const alt = p.replace(/_png(\.png)$/i, '$1')
      if (!fs.existsSync(alt)) throw new Error(`Missing resource ${uri}`)
      console.warn(`  resource ${uri} not found, using ${path.basename(alt)}`)
      p = alt
    }
    resources[uri] = new Uint8Array(fs.readFileSync(p))
  }
  for (const b of json.buffers ?? []) if (b.uri) load(b.uri)
  for (const i of json.images ?? []) if (i.uri) load(i.uri)
  return io.readJSON({ json, resources })
}

async function buildCharacter(name, file) {
  const doc = await readGltfTolerant(path.join(ubcDir, 'Base Characters', 'Godot - UE', file))
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  )
  const out = path.join(OUT, `${name}.glb`)
  await io.write(out, doc)
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`)
}

async function buildAnimations() {
  const doc = await io.read(ualFile)
  const root = doc.getRoot()
  for (const anim of root.listAnimations()) if (!KEEP_CLIPS.has(anim.getName())) anim.dispose()
  // Strip the preview mannequin: only the bone hierarchy and clips are needed.
  for (const node of root.listNodes()) {
    node.setMesh(null)
    node.setSkin(null)
  }
  for (const mesh of root.listMeshes()) mesh.dispose()
  await doc.transform(prune({ keepLeaves: true }), dedup())
  const out = path.join(OUT, 'animations.glb')
  await io.write(out, doc)
  const kept = doc.getRoot().listAnimations().map((a) => a.getName())
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB) with ${kept.length} clips`)
  const missing = [...KEEP_CLIPS].filter((c) => !kept.includes(c))
  if (missing.length) console.warn('missing clips:', missing.join(', '))
}

async function buildHair(name, file) {
  const base = path.join(ubcDir, 'Hairstyles')
  const doc = await readGltfTolerant(path.join(base, 'Origin at 0', 'glTF (Godot)', file), [path.join(base, 'Textures')])
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }))
  const out = path.join(OUT, `${name}.glb`)
  await io.write(out, doc)
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`)
}

await buildHair('hair_parted', 'Hair_SimpleParted.gltf')
await buildHair('hair_long', 'Hair_Long.gltf')
await buildHair('hair_buns', 'Hair_Buns.gltf')
await buildHair('hair_beard', 'Hair_Beard.gltf')
await buildCharacter('student_male', 'Superhero_Male_FullBody.gltf')
await buildCharacter('student_female', 'Superhero_Female_FullBody.gltf')
await buildAnimations()
