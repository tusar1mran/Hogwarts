# Wand-aimed casting, broom-gated flight, and world map

The branch delivers the three requested gameplay features by gap-filling the existing systems rather than rebuilding them: the held wand now visibly points along the aim ray while aiming/casting, broom summoning is gated on owning a collected broom (with a versioned save bump so old saves still load), and a new M-key world map overlay plots quest and broom markers plus the player's pose from the 10 Hz HUD snapshot. The change is faithful to the approved design in `design.md` and the three `FEAT-00N.json` acceptance sets. **Watch for:** nothing blocking — only two cosmetic nits. **Verdict**: APPROVED

## High-level view

Wand aim is a localized, additive layer in `ProceduralAvatar.useFrame`: after the pose blender writes joint rotations, a damped factor `aimK` ramps up while aiming or during the 0.4 s cast window (gated to ground/non-flying states), the world-space aim pitch is clamped to the imported `CAMERA_LIMITS.groundPitch` via the pure `clampWorldAimPitch`, transformed into the wand group's parent space, and slerped onto `wandRoot`. Because `wandTip` is a child of the corrected `wandRoot`, the projectile origin (`runtime.wandTip`) is read after the correction, so spawning from the tip is preserved with no change to `SpellRuntime` or the spell economy. The quaternion/clamp math is extracted to pure helpers and unit-tested.

Flight gating threads a `hasBroom` boolean through `FlightMachineInput` so `stepFlightMachine` stays pure; the `Grounded` case refuses summoning with a player-visible `blocked` message when no broom is held, and `PlayerController` feeds `useProgression.getState().progression.hasBroom`. The flag is persisted through a save version bump (2→3) whose `parseSave` keeps v1 (migrate), v2 (defaults applied), and v3 (round-trip) loadable while rejecting v4+ as unsupported — regression-tested including `hasValidSave()` staying true for a stored v2.

The map derives all landmark geometry from `layout.ts` symbols through the pure `worldToMap`/`rectToMap`/`circleToMap` projection (no duplicated coordinates), plots quest markers from the shared `questMap.questMarkers`, broom glyphs from `BROOM_PICKUPS` styled by `broomsCollected`, and a player triangle from the `playerX`/`playerZ`/`playerFacing` HUD selectors patched at 10 Hz by `HudSync` — so the overlay re-renders at most ~10 Hz, never per animation frame. The HUD compass is refactored onto the same shared resolver via a `forCompass` flag, keeping it byte-identical for `talk`/`spellHit`/`rings`/`reach`, null for an active `flightState`, and correcting only the `collect` marker to the true `CODEX_POSITION`.

The gate is green: `npm run typecheck`, `npm test` (11 files, 106 tests), `npm run lint` (exit 0, only pre-existing warnings in untouched files), and `npm run build` all pass. No economy or engine regressions: `spellSystem.ts`, `registry.ts`, `flightPhysics.ts`, and `questData.ts` are untouched.

<details>
<summary>Issues (2)</summary>

1. **Summon notification wording** (NIT) — `collectBroom` says "Press {key} to summon your broom." vs the design's "...to summon it."; the live `toggleBroom` key is correctly resolved via `keyLabel`. No change required.
2. **Map view extent** (NIT) — `MAP_VIEW = WORLD_HALF_SIZE` (580) matches the design literally, so the castle occupies a small central region. Out of scope to change; not a defect.

</details>

<details>
<summary>Details</summary>

### Wand orients along aim, tip still spawns the projectile

`clampWorldAimPitch` (confirmed, `wandAim.ts`) clamps the world-space pitch to the imported `CAMERA_LIMITS.groundPitch` while preserving yaw and returns a fresh unit vector; `wandAimRotation` builds the quaternion mapping the wand's local `-Y` onto a parent-space direction. In `ProceduralAvatar.useFrame` the correction runs after `blender.apply` and before `r.wandTip.getWorldPosition(_tip)` writes `runtime.wandTip`, so the tip world position already reflects the aim orientation and `SpellRuntime.tryCast`'s `ctx.origin.copy(runtime.wandTip)` is unchanged (confirmed). `aimK` is damped with `dampFactor(12, dt)` toward 1 only while `(p.aiming || casting) && !flightPose && !isAirborneFlightState(...)`, so it never fights the broom pose and eases in/out. The `wandRoot` handle is wired through `HumanoidRig` (confirmed) and the missing-node fallback is retained. `RealisticAvatar` is left unchanged with a comment noting the procedural path carries the feature (`characterLibraryAvailable()` is false). `wandAim.test.ts` asserts the clamp extremes (`sin(0.55)`/`sin(-1.2)`), yaw preservation, mid-range round-trip, and ~5° rotation accuracy — 5/5 pass.

### Broom acquisition gate and save migration

`stepFlightMachine` gains `hasBroom` on `FlightMachineInput` and, in `Grounded`, returns `stay({ blocked: 'You have no broom...' })` before the grounded/overWater checks when `!hasBroom` (confirmed). The machine stays pure — no store imports — and `PlayerController` supplies `hasBroom` from the progression store; the existing `fizzle(machine.blocked)` surfaces the message. `collectBroom` is idempotent on id, sets `hasBroom`/`broomsCollected`, notifies with the live `toggleBroom` key, emits `{ type:'broom:collected', broomId }` (matching the `<noun>Id` convention), and saves. The save bump to v3 keeps v1 (migrate, `migratedFrom:1`), v2 (sanitize with defaults, `migratedFrom:2`), and v3 (round-trip, `migratedFrom:undefined`) loadable and rejects `version>3` as `unsupported`; `sanitizeProgression` defaults the two new fields and drops unknown broom ids via `BROOM_PICKUP_IDS`. `saveSystem.test.ts` and `flight.test.ts` (idle gains `hasBroom:true`, plus the two gate cases) are green.

Soft-lock guard: `broom-courtyard` sits at an early reachable spot `[18,0,36]` so a broom can be obtained before the flight-initiation `summon-broom` objective — which now requires `hasBroom` — can be reached.

### Map: layout-derived geometry, 10 Hz pose, shared compass resolver

`worldToMap` (confirmed, pure, tested center + 4 corners) and the `rectToMap`/`circleToMap` wrappers in `WorldMap.tsx` project every landmark from `layout.ts` symbols — no numeric landmark literal is copied into the component (AC-10). `questMarkers` places available quests at their giver NPC and active quests at the current objective location across all six objective kinds; `flightState` resolves to `FLIGHT_PLATFORM.center` on the map and `null` on the compass through the shared `objectiveLocation(..., forCompass)` resolver, so the map and compass cannot silently drift on the kinds they agree on. The HUD compass refactor (`compassObjective`) is byte-identical to the old `objectivePosition` for `talk`/`spellHit`/`rings`/`reach`, null for active `flightState`, and corrects `collect` from the placeholder `[-43,-40]` to the true `CODEX_POSITION` (<0.4 m shift) — a deliberate, documented bug fix asserted in `questMap.test.ts`. Note that `FLIGHT_PLATFORM.center` is a 2-element `[x,z]`, so `center[0]`/`center[1]` correctly map to world x/z.

`HudSync` patches `playerX`/`playerZ`/`playerFacing` on the existing 10 Hz tick; `WorldMap` reads them through `useHud` selectors, so it re-renders at most ~10 Hz and never per frame (NF.1). `BroomPickup` in `WorldItems.tsx` mirrors `Codex`/`ShrineEmber`: a `broomsCollected.includes(id)` selector drives registration/unregistration of the `Take` interactable and unmounts the mesh once collected; `onInteract` calls `collectBroom(id)`. `BroomModel` was extracted to its own module and consumed by both the avatar and the pickup, avoiding an import cycle. The `map` action is added to `bindings.ts` (default `KeyM`, previously unbound), the `Overlay` union, and `useMenuKeys` (table renamed to `toggles`, open-guard widened to include `'map'`), so it is rebindable, conflict-checked, and opens/closes symmetrically with the other panels. The panel is `role="dialog"` with an `aria-label` and marker `<title>`s.

### Verification

Run from the worktree root: `npm run typecheck` (clean), `npm test` (11 files, 106 tests pass), `npm run lint` (exit 0; the emitted warnings are all pre-existing react-hooks/immutability lints in files untouched by this task), `npm run build` (`tsc -b` + vite build succeed). No changes to `spellSystem.ts`, `registry.ts`, `SpellRuntime.tsx`, `flightPhysics.ts`, or `questData.ts`, so the economy and flight-physics engines are regression-free.

</details>

<details>
<summary>File map</summary>

New: `wandAim.ts` + test (pure aim clamp/rotation), `BroomModel.tsx` (extracted shared mesh), `WorldMap.tsx` (SVG overlay panel), `mapProjection.ts` + test (pure world→SVG), `questMap.ts` + test (shared quest-marker/compass resolver), `saveSystem.test.ts`, `progressionStore.test.ts`.

Modified: `HumanoidRig.tsx` (expose `wandRoot`), `PlayerAvatar.tsx` (apply aim slerp; import extracted `BroomModel`), `PlayerController.tsx` (thread `hasBroom`), `flightMachine.ts` + `flight.test.ts` (gate), `questEngine.ts` (`hasBroom`/`broomsCollected`), `progressionStore.ts` (`collectBroom`), `saveSystem.ts` (v3 + migration), `events.ts` (`broom:collected`), `layout.ts` (`BROOM_PICKUPS`, `CODEX_POSITION`), `WorldItems.tsx` (`BroomPickup`, Codex sources `CODEX_POSITION`), `bindings.ts`/`gameStore.ts`/`hudStore.ts` (`map` action, overlay, player pose), `Systems.tsx` (HudSync pose patch), `App.tsx` (M key), `GameMenus.tsx` (render map), `HUD.tsx` (compass refactor).

Full diff: `git -C c:\Projects\Hogwarts\.worktrees\wand-broom-map diff main...HEAD`

</details>
