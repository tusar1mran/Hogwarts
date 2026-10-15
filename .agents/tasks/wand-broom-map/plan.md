# Implementation Plan — Wand-Aimed Casting, Broomstick Flight Gate, World Map

Derived from the APPROVED `design.md` (3rd iteration) and `design-review.md` (APPROVED, 4 NITs).
Worktree root: `c:\Projects\Hogwarts\.worktrees\wand-broom-map`. All commands run from that root in
PowerShell (chain with `;`). Package: `eldoria-academy`.

Build/test commands (from `package.json`): `npm run typecheck` (`tsc -b`), `npm test` (`vitest run`),
`npm run lint` (`oxlint src`), `npm run build` (`tsc -b && vite build`). Never run `npm run dev`.

Baseline note: before editing, run `npm test` once to record the green baseline (6 test files:
`systems.test.ts`, `flight.test.ts`, `animationMachine.test.ts`, `quests.test.ts`,
`spellSystem.test.ts`, `menus.test.tsx`) so any later regression is attributable.

The ordering below is dependency-first: Feature 2's progression/save state must land before Feature 3
consumes `collectBroom`/`broomsCollected`; Feature 1 is independent and can land in any order.

---

## Feature 1 — Wand points along the aim direction

- [ ] 1. Create the pure wand-aim helper module.
      Add `WAND_LOCAL_AXIS = new Vector3(0,-1,0)`, `clampWorldAimPitch(aimDir, limits = CAMERA_LIMITS.groundPitch): Vector3`
      (clamp WORLD-space pitch, preserve yaw via `yaw = atan2(x,z)`, rebuild unit vector), and
      `wandAimRotation(parentSpaceAimDir): Quaternion` (normalize, `Quaternion.setFromUnitVectors(WAND_LOCAL_AXIS, dir)`).
      Import `CAMERA_LIMITS` from `../camera/CameraRig` — do not re-hardcode `[-1.2, 0.55]`.
      Files: `src/game/player/wandAim.ts`
      Verify: `npm run typecheck` passes (module compiles; it is consumed by the test in item 2).

- [ ] 2. Add the wandAim unit test.
      Assert `clampWorldAimPitch` returns `y === Math.sin(CAMERA_LIMITS.groundPitch[1])` (= sin 0.55) for an
      above-limit input and `y === Math.sin(CAMERA_LIMITS.groundPitch[0])` (= sin -1.2) for a below-limit input,
      both within 1e-6, with yaw (`atan2(x,z)`) preserved and a mid-range input round-tripping unchanged; assert
      `wandAimRotation(dir)` applied to `WAND_LOCAL_AXIS` reproduces several representative `dir`s within ~5°.
      Files: `src/game/player/wandAim.test.ts`
      Verify: `npx vitest run src/game/player/wandAim.test.ts` — new tests pass.

- [ ] 3. Expose the wand group as `wandRoot` from the procedural rig.
      Add `wandRoot: Object3D | null` to `HumanoidHandle`; add a `useRef<Object3D>` and attach it as `ref` on the
      existing `<group rotation-x={0.25} position={[0,-0.02,-0.02]}>` under `handR` (the group that holds the wand
      mesh and the `wandTip` empty); return it from `useImperativeHandle`.
      Files: `src/game/player/HumanoidRig.tsx`
      Verify: `npm run typecheck` passes.

- [ ] 4. Apply the aim-corrective orientation in the procedural avatar.
      In `ProceduralAvatar.useFrame`, after `blender.apply(...)` and BEFORE reading `r.wandTip` into
      `runtime.wandTip`: compute a damped aim factor `k` (ramps 0→1 while `runtime.player.aiming` or within 0.4 s of
      `runtime.player.castStartedAt`, reusing `dampFactor`), gated to ground/non-flying states. When `k>0` and
      `r.wandRoot` exists: `clampWorldAimPitch(runtime.aim.direction)`, transform the clamped world dir into the
      wand group's PARENT space via `wandRoot.parent.getWorldQuaternion(...).invert()`, call `wandAimRotation(...)`,
      and slerp `wandRoot.quaternion` toward it by `k`. Keep the existing missing-node fallback. No change to
      `SpellRuntime`, `spellSystem.ts`, or the economy.
      Files: `src/game/player/PlayerAvatar.tsx`
      Verify: `npm run typecheck` and `npm run build` pass. Code-path trace (AC-1/AC-2, not unit-testable):
      `aiming`→`k` ramps→`wandRoot` slerps to aim→`r.wandTip.getWorldPosition` writes `runtime.wandTip`→
      `SpellRuntime.tryCast` does `ctx.origin.copy(runtime.wandTip)` (confirmed at SpellRuntime.tsx:397), so the
      projectile still spawns from the now-correctly-pointed tip.

- [ ] 5. (Hedged) Mirror the correction in the realistic avatar only if a settable wand group is exposed.
      `RealisticAvatar` currently exposes `c.wandTip` but no settable wand group, so leave its behaviour unchanged
      and keep the documented fallback. Add a short comment noting the procedural path (shipped default,
      `characterLibraryAvailable()` is false) carries the feature. No functional change unless a wand group appears.
      Files: `src/game/player/PlayerAvatar.tsx`
      Verify: `npm run typecheck` passes.

---

## Feature 2 — Broom acquisition gate (progression + save state)

- [ ] 6. Extend progression state with broom ownership.
      Add `hasBroom: boolean` and `broomsCollected: string[]` to the `Progression` interface; default both in
      `createProgression()` (`false` and `[]`).
      Files: `src/game/quests/questEngine.ts`
      Verify: `npm run typecheck` passes. (AC-3 asserted via the store/save tests below.)

- [ ] 7. Add the `broom:collected` event.
      Add `{ type: 'broom:collected'; broomId: string }` to the `GameEvent` union (field name `broomId` follows the
      `<noun>Id` convention).
      Files: `src/game/core/events.ts`
      Verify: `npm run typecheck` passes.

- [ ] 8. Add the `collectBroom` store action.
      Add `collectBroom(id: string)` to `ProgressionStore`, modelled on `addArtifact`: no-op if
      `broomsCollected.includes(id)`; else set `{ hasBroom:true, broomsCollected:[...prev,id] }`, notify
      (`kind:'reward'`, message resolves the live summon key via
      `keyLabel(useSettings.getState().controls.bindings.toggleBroom[0])`), emit `{type:'broom:collected', broomId:id}`,
      and `save()`. Import `events`, `keyLabel`, and `useSettings` as needed.
      Files: `src/game/state/progressionStore.ts`
      Verify: `npm run typecheck` passes; store test in item 11 covers AC-6.

- [ ] 9. Gate the flight machine on `hasBroom`.
      Add `hasBroom: boolean` to `FlightMachineInput`; in the `Grounded` case, when `input.toggle`, return
      `stay({ blocked: 'You have no broom. Find one on the grounds first.' })` if `!input.hasBroom`, before the
      existing grounded/overWater checks.
      Files: `src/game/flight/flightMachine.ts`
      Verify: `npx vitest run src/game/flight/flight.test.ts` (after item 10) — gate cases pass; `npm run typecheck`.

- [ ] 10. Update the flight test for the new input field and add gate cases.
      Add `hasBroom: true` to the `idle` input constant so all existing cases stay green; add two cases: from
      `Grounded` with `{toggle:true,grounded:true,overWater:false,hasBroom:false}` stays `Grounded` with a non-empty
      `blocked` (AC-4), and with `hasBroom:true` transitions to `Summoning` (AC-5).
      Files: `src/game/flight/flight.test.ts`
      Verify: `npx vitest run src/game/flight/flight.test.ts` — all pass.

- [ ] 11. Add a progression-store test for `collectBroom`.
      Assert fresh progression has `hasBroom===false` and `broomsCollected` deep-equals `[]` (AC-3); after
      `collectBroom('broom-courtyard')`, `hasBroom===true` and the id is appended; a second call with the same id is
      a no-op; a `broom:collected` event fires. (Place alongside existing store/quest tests, e.g. extend
      `quests.test.ts` or a new `progressionStore.test.ts`.)
      Files: `src/game/quests/quests.test.ts` (or new `src/game/state/progressionStore.test.ts`)
      Verify: `npx vitest run` for the chosen file — new assertions pass.

- [ ] 12. Thread `hasBroom` into the flight machine from the controller.
      In `PlayerController.useFrame`, add `hasBroom: useProgression.getState().progression.hasBroom` to the inline
      `stepFlightMachine` input object. The existing `if (machine.blocked) useHud.getState().fizzle(machine.blocked)`
      surfaces the message.
      Files: `src/game/player/PlayerController.tsx`
      Verify: `npm run typecheck` and `npm run build` pass. Code-path trace (F2.1/F2.2): no broom → `Grounded` +
      blocked toast via `SpellBar`.

- [ ] 13. Bump the save version to 3 with safe v1/v2/v3 migration.
      Rename `SaveFileV2`→`SaveFileV3` (`version: 3`); set `SAVE_VERSION = 3`; add two lines to `sanitizeProgression`
      after the `createProgression()` spread: `hasBroom: typeof raw.hasBroom === 'boolean' ? raw.hasBroom : false`
      and `broomsCollected: strings(raw.broomsCollected).filter(id => BROOM_PICKUP_IDS.has(id))` where
      `BROOM_PICKUP_IDS = new Set(BROOM_PICKUPS.map(b => b.id))` (import `BROOM_PICKUPS` from `layout.ts` — depends on
      Feature 3 item 15, so land item 15 first or inline the ids temporarily; see note). In `parseSave`, accept
      `version === 1` (migrate), `version === 2 || version === SAVE_VERSION` (sanitize; `migratedFrom` = 2 for v2,
      undefined for v3), and reject anything else (including `version > 3`) as `unsupported`. `serializeSave` writes
      `version: 3`.
      Files: `src/game/quests/saveSystem.ts`
      Verify: `npx vitest run src/game/quests/saveSystem.test.ts` (item 14) — all pass; `npm run typecheck`.
      Note: `BROOM_PICKUPS` lives in `layout.ts` (Feature 3). To keep each item buildable, land layout item 15 before
      this item, OR define `BROOM_PICKUP_IDS` from a local constant and switch to the import once layout lands.

- [ ] 14. Add save-migration tests.
      Assert: a v1 string still migrates; a v2 string loads with `hasBroom===false`, `broomsCollected` deep-equals
      `[]`, and `hasValidSave()` stays true (the regression the review asked for); a v3 string round-trips both new
      fields; a `version:4` string returns `{ok:false, reason:'unsupported'}`; `sanitizeProgression` defaults missing
      `hasBroom`/`broomsCollected` and preserves set values (AC-8/AC-9).
      Files: `src/game/quests/saveSystem.test.ts` (new)
      Verify: `npx vitest run src/game/quests/saveSystem.test.ts` — all pass.

---

## Feature 3 — Broom pickups + World Map overlay

- [ ] 15. Add broom-pickup positions and the shared codex constant to layout.
      Add `BroomPickupDef` interface and `BROOM_PICKUPS` (`broom-courtyard` at ~`[18,0,36]` near the Practice
      Grounds — the early/reachable soft-lock guard; `broom-platform` at `[-56, FLIGHT_PLATFORM.height, 24]`), and
      `CODEX_POSITION: Vec3Tuple = [-43.3, LIBRARY_BALCONY_Y + 1.05, -40.2]` (exactly the literal `WorldItems.Codex`
      uses today).
      Files: `src/game/world/layout.ts`
      Verify: `npm run typecheck` passes.

- [ ] 16. Extract the shared broom mesh into its own module.
      Move the local `BroomModel` component out of `PlayerAvatar.tsx` into a new presentational module and import it
      in both places (avoids an import cycle).
      Files: `src/game/world/BroomModel.tsx` (new), `src/game/player/PlayerAvatar.tsx` (import from new module)
      Verify: `npm run typecheck` and `npm run build` pass.

- [ ] 17. Add the `BroomPickup` world entity and point `Codex` at the shared constant.
      Add a `BroomPickup({id,name,position})` component in `WorldItems.tsx` modelled on `Codex`/`ShrineEmber`:
      `collected = useProgression(s => s.progression.broomsCollected.includes(id))`; when not collected,
      `registerInteractable({ id, position (Y resolved via terrainHeight for the ground broom), radius:~2.5,
      verb:'Take', label:name, onInteract: () => useProgression.getState().collectBroom(id) })` and render
      `<BroomModel/>` with a gentle bob; return `null` and unregister once collected. Render
      `BROOM_PICKUPS.map(...)` in `WorldItems`. Change `Codex` to source its position from `CODEX_POSITION`.
      Files: `src/game/world/WorldItems.tsx`
      Verify: `npm run typecheck` and `npm run build` pass. Code-path trace (F2.4/F3.4): interact → `collectBroom` →
      gate passes next frame; selector flips → mesh unmounts.

- [ ] 18. Add the rebindable `map` action (default M).
      Add `'map'` to the `Action` union, `ACTION_META.map = { label:'Open world map', context:'any',
      group:'Interface' }`, and `DEFAULT_BINDINGS.map = ['KeyM']` (KeyM is currently unbound). `ACTIONS`,
      `findConflicts`, settings sanitize, and `SettingsPanel` pick it up automatically.
      Files: `src/game/input/bindings.ts`
      Verify: `npm run typecheck` passes. Rebind trace (NF.3): appears under Interface, conflict-checked.

- [ ] 19. Add `'map'` to the overlay union and HUD snapshot fields.
      Extend `Overlay` with `'map'` in `gameStore.ts`. Add `playerX: number`, `playerZ: number`,
      `playerFacing: number` (default `0`) to the `HudStore` interface and initial state so `patch` type-checks.
      Files: `src/game/state/gameStore.ts`, `src/game/state/hudStore.ts`
      Verify: `npm run typecheck` passes.

- [ ] 20. Patch player pose into the HUD snapshot at 10 Hz.
      In `HudSync` (`src/game/core/Systems.tsx`), add `playerX: runtime.player.position.x`,
      `playerZ: runtime.player.position.z`, `playerFacing: runtime.player.facing` to the existing `patch({...})`
      on the 10 Hz tick. Leave `heading: runtime.camera.yaw` as-is (it drives the compass).
      Files: `src/game/core/Systems.tsx`
      Verify: `npm run typecheck` passes.

- [ ] 21. Open the map from the M key.
      In `App.useMenuKeys`: rename the local `const map = {...}` to `const toggles = { spellbook, journal, inventory,
      map: b.map } as const`, iterate `toggles`, and widen the open guard to also allow `g.overlay === 'map'` so B/J/I
      and the map open over each other.
      Files: `src/App.tsx`
      Verify: `npm run typecheck` passes. Trace (F3.1): M → `openOverlay('map')`; M/Esc → close.

- [ ] 22. Create the pure map projection helper + test.
      Add `MAP_VIEW = WORLD_HALF_SIZE` and `worldToMap(x,z,size): {mx,my}` mapping world (x,z) to SVG coords
      (`mx = (x/(2*MAP_VIEW)+0.5)*size`, `my = (z/(2*MAP_VIEW)+0.5)*size`; world +Z → +Y so north (−Z) is up).
      Add a test asserting center→center and corners→corners round-trips.
      Files: `src/game/world/mapProjection.ts` (new), `src/game/world/mapProjection.test.ts` (new)
      Verify: `npx vitest run src/game/world/mapProjection.test.ts` — pass.

- [ ] 23. Create the shared quest-marker helper + test and refactor the HUD compass to use it.
      Add `QuestMarker` and `questMarkers(p): QuestMarker[]` in `src/game/quests/questMap.ts`: for each quest, if
      `available` place a marker at its giver NPC (`NPCS.find(n=>n.id===q.giver)`); if `active`, resolve the current
      objective by kind — `talk`→target NPC, `spellHit`→TRAINING_YARD center, `collect`→`CODEX_POSITION`,
      `flightState`→`FLIGHT_PLATFORM.center`, `rings`→next uncollected ring, `reach`→`FLIGHT_PLATFORM.center`; omit
      completed quests. Parameterise the shared per-objective resolver with a `forCompass` flag so a `flightState`
      active objective resolves to `null` for the compass (preserving today's fall-through) while the map shows the
      platform. Refactor `HUD.objectivePosition` to use the shared resolver — byte-identical for
      `talk/spellHit/rings/reach/flightState`, with the only change being `collect` corrected from `[-43,-40]` to the
      true `CODEX_POSITION`. Add `questMap.test.ts` asserting: each quest when `available` → marker at its giver;
      each active-objective kind → documented location (incl. active `flightState` → `FLIGHT_PLATFORM.center`); and
      the compass yields today's values for the unchanged kinds, `null` for active `flightState`, and `CODEX_POSITION`
      for `collect` (AC-11).
      Files: `src/game/quests/questMap.ts` (new), `src/game/quests/questMap.test.ts` (new),
      `src/ui/hud/HUD.tsx` (refactor `objectivePosition`)
      Verify: `npx vitest run src/game/quests/questMap.test.ts` — pass; `npm run typecheck`.

- [ ] 24. Create the WorldMap SVG panel and render it.
      New `src/ui/menus/WorldMap.tsx`: a `role="dialog"` `panel modal` with `CloseButton`, aria-label "World map".
      Draw the schematic from layout symbols via `worldToMap` ONLY (no numeric landmark literals, AC-10): LAKE/FOREST
      circles, PLATEAU/COURTYARD/GRAND_HALL/LIBRARY/TRAINING_YARD/BRIDGE rects, FLIGHT_PLATFORM circle, TOWERS
      circles, optional FLIGHT_RINGS/SECRETS. Plot `questMarkers(progression)` (labelled, each with `<title>`),
      `BROOM_PICKUPS` glyphs styled available vs collected via `broomsCollected.includes(id)`, and a player triangle
      at `worldToMap(playerX,playerZ)` rotated by `playerFacing` (reading `useHud` selectors — 10 Hz, not per frame).
      Render `{overlay === 'map' && <WorldMap />}` inside `overlay-backdrop` in `GameOverlays`.
      Files: `src/ui/menus/WorldMap.tsx` (new), `src/ui/menus/GameMenus.tsx`
      Verify: `npm run typecheck` and `npm run build` pass. Trace (F3.2/F3.3/F3.4/F3.5, NF.1): markers derive from
      layout+quest data; broom markers from `BROOM_PICKUPS`; player triangle from the 10 Hz snapshot.

- [ ] 25. Document the Map control in the README.
      Add the Map row (default M) to the controls table.
      Files: `README.md` (repo root; create a controls note if the file/table is absent — see note)
      Verify: `npm run build` passes (no code impact). Note: no README was found in the worktree root during
      exploration; if none exists, add the control to whatever controls documentation is present, or skip with a
      recorded finding rather than inventing a README.

---

## Final verification (all features)

- [ ] 26. Full gate.
      Run, from the worktree root: `npm run typecheck ; npm test ; npm run lint ; npm run build`. All four must pass
      (AC-12). Then walk the six code-path traces from design §10 (wand-points-along-aim; broom gate; pickup→flight
      enabled; map key+render; marker correctness; save round-trip) to confirm the non-unit-testable wiring. Remove
      any scratch files.
      Verify: all four commands exit 0; traces confirm the wiring described in the design.

---

## Notes / assumptions

- The `Action` union in `bindings.ts` is an explicit string-literal union (not derived), so item 18 must add `'map'`
  to the union itself in addition to `ACTION_META`/`DEFAULT_BINDINGS` — the design mentions meta/default but not the
  union; adding it to the union is required for `tsc` to pass.
- Item 13 (save) imports `BROOM_PICKUPS` from `layout.ts` (item 15). To keep every item independently buildable, land
  item 15 before item 13; the FEAT decomposition orders Feature 3's layout change ahead of being consumed where
  cross-feature, and the save change is validated at the integration step regardless.
- `spellSystem.test.ts` stays unmodified (pure economy). The "spawn origin == wand tip" check (AC-2) is a code-path
  trace against `SpellRuntime.tsx:397` (`ctx.origin.copy(runtime.wandTip)`), not a change to the economy test.
- No README exists in the worktree root; item 25 is best-effort documentation, not a blocker.
