# Asset manifest

Eldoria bundles one set of third-party assets, the CC0 character library described below. Everything else is
generated at runtime:

| Area | Built-in fallback | Source file |
| --- | --- | --- |
| Stone, slate, wood, flagstone, book-spine, stained-glass, banner, fog and water textures | Canvas-generated PBR sets (colour, normal, roughness) | `src/game/world/environment/textures.ts` |
| Castle architecture | Modular procedural geometry (walls with pointed arches, towers, spires, columns, stairs, railings, gable roofs) | `src/game/world/architecture/` |
| Terrain, mountains, lake, ravine | Deterministic noise heightfield + far mountain backdrop | `src/game/world/terrain/` |
| Trees, rocks, glowing plants | Instanced procedural meshes | `src/game/world/areas/Vegetation.tsx` |
| Character clothing (jumper, trousers, boots, robe, belt, scarf, hood, wand) | Generated from the body's skin weights so it deforms with the skeleton | `src/game/player/characterModel.ts` |
| Character fallback | Procedural jointed humanoid, used only if the character files fail to load | `src/game/player/HumanoidRig.tsx` |
| Music | Generative Web Audio sequencer (pads, harp, choir-like voices, drones, percussion) | `src/game/audio/AudioEngine.ts`, `themes.ts` |
| Sound effects and ambience | Web Audio synthesis | `src/game/audio/cues.ts` |

## Optional replacement assets

The game probes for these files at start-up. If a file is missing or invalid, the fallback above is used and a single
`[assets]` message is logged in development. Nothing crashes. The authoritative list lives in
`src/game/assets/manifest.ts`.

### Bundled character library (`public/assets/models/`)

| File | Contents | Built from |
| --- | --- | --- |
| `student_male.glb`, `student_female.glb` | Rigged base bodies (65-bone humanoid skeleton), eyes, eyebrows; textures 1024 px WebP | Universal Base Characters [Standard] |
| `hair_parted.glb`, `hair_long.glb`, `hair_buns.glb`, `hair_beard.glb` | Hairstyles in character space, attached to the head bone at runtime | Universal Base Characters [Standard] |
| `animations.glb` | 21 clips (idle, talk, walk, jog, sprint, jump start/loop/land, hit, spellcasting, sitting, interact, roll), no mesh | Universal Animation Library [Standard] (`UAL1_Standard.glb`) |

- **Author:** Quaternius. **Source:** https://quaternius.itch.io/universal-base-characters and
  https://quaternius.itch.io/universal-animation-library (free Standard downloads, 11/10/2026).
- **Licence:** CC0 1.0 Universal. Both downloads include a licence file stating CC0 1.0 (`License_Standard.txt`,
  `License.txt`). Attribution is not required; it is given in the Credits screen anyway.
- **Note:** a secondary source reports that Quaternius may publish future packs under a different licence. The files
  bundled here were checked against the CC0 licence files shipped inside these specific downloads. Keep the original
  zips (or their licence files) with the project records.
- **Rebuild:** `node scripts/build-character-assets.mjs "<Universal Base Characters[Standard] folder>" "<UAL1_Standard.glb>"`
  (dedupes, prunes, converts textures to WebP and strips the animation preview mesh).

### Optional replacement character

To use a different character, export a glTF/GLB with the same 65-bone skeleton (Unreal-mannequin naming: `pelvis`,
`spine_01`…`hand_r`, `Head`) and replace `student_male.glb`. Animation clips are bound by bone name and
mapped to game states in `CLIP_MAP` (`src/game/assets/manifest.ts`); missing clips fall back automatically.

### Audio (`public/assets/audio/`, `.ogg`)

| Cue id / file | Purpose |
| --- | --- |
| `music-menu`, `music-castle`, `music-hall`, `music-forest`, `music-flight`, `music-combat`, `music-interior` | Looping music per state (crossfaded, with hysteresis) |
| `ambient-wind`, `ambient-forest`, `ambient-interior` | Looping ambient beds |
| `footstep-stone`, `footstep-grass`, `footstep-wood` | Footsteps (pitch-varied per step) |
| `cast-arc`, `cast-wave`, `cast-shield`, `cast-orb`, `cast-pull`, `cast-blink` | Spell casts |
| `impact-spark`, `shield-down`, `broom-summon`, `broom-takeoff`, `broom-land`, `door`, `bell` | Gameplay and world sounds |

Use 44.1 or 48 kHz OGG Vorbis (MP3 also decodes in all target browsers if you change the extension in the manifest).
Loops should be trimmed to loop seamlessly.

## Licensing rules

- Only add files you have the right to redistribute in a public web build (your own work, commissioned work with a
  licence that covers distribution, or CC0 / CC-BY material).
- Never use film or game soundtracks, recreations of recognisable franchise themes, or assets ripped from other games.
- Do not hot-link files from third-party URLs. Install them locally under `public/assets/`.
- Record every added asset below and in the in-game Credits screen (`src/ui/menus/Credits.tsx`).

| File | Author | Source URL | Licence | Attribution required |
| --- | --- | --- | --- | --- |
| `public/assets/models/*.glb` (character library) | Quaternius | quaternius.itch.io (two packs above) | CC0 1.0 | No (credited anyway) |

## Code dependencies (licences checked against installed package metadata on 11/10/2026)

| Package | Version | Licence |
| --- | --- | --- |
| three | 0.186.1 | MIT |
| react, react-dom | 19.3.0 | MIT |
| @react-three/fiber | 9.8.1 | MIT |
| @react-three/drei | 10.7.9 | MIT |
| @react-three/rapier | 2.2.0 | Not declared in npm metadata; check the upstream repository before distribution |
| @dimforge/rapier3d-compat | 0.19.2 | Apache-2.0 |
| @react-three/postprocessing | 3.2.0 | MIT |
| postprocessing | 6.39.5 | Zlib |
| zustand | 5.0.15 | MIT |
| @gltf-transform/core, functions, extensions (build-time only) | 4.5.1 | MIT |
| sharp (build-time only) | 0.35.5 | Apache-2.0 |
