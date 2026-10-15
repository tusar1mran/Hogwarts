# Wand-Aimed Casting, Broomstick Flight, and World Map — Requirements & Design

Package: `eldoria-academy` (React 19, TypeScript, Vite, three.js, @react-three/fiber, @react-three/drei,
@react-three/rapier, zustand, Web Audio). Worktree root: `c:\Projects\Hogwarts\.worktrees\wand-broom-map`.

This document delivers three connected gameplay features by **building on the existing systems**, not rebuilding
them. The audit below is based on reading the real source; every claim cites the file and symbol it came from.

Baseline: the suite comprises **6 test files** (`systems.test.ts`, `flight.test.ts`, `animationMachine.test.ts`,
`quests.test.ts`, `spellSystem.test.ts`, `menus.test.tsx` — verified from source). The exact passing-test total is
**not** re-asserted here; the implementer must run `npm test` once before editing to record the real green baseline
so any regression is attributable (Finding 7). `npm run dev` / watch commands are never run.

> **Revision note.** This is the third iteration, revised against the current `design-review.json`
> (`verdict: CHANGES_REQUESTED`, 0 HIGH + 4 MEDIUM + 3 NIT). Every finding is resolved in the body below and
> itemised in §13.1 "Review findings resolution". The most consequential changes this pass: the wand-aim **pitch
> clamp is pinned** to the world-space camera limits (`CAMERA_LIMITS.groundPitch`, imported) with concrete test
> values (Finding 1); the compass `collect` marker is **corrected** to the true `CODEX_POSITION` and the
> "unchanged" wording is scoped accordingly (Finding 2); `useMenuKeys` gets a renamed `toggles` table and an
> explicit widened allow-list including `'map'` (Finding 3); and `questMarkers`/the compass now cover the
> **`flightState`** objective kind explicitly (Finding 4). The prior review's HIGH (save v1/v2/v3 migration) and
> its MEDIUM/NIT items remain resolved — see §13.2.

---

## 1. Summary

The game already ships working spellcasting, a complete flight state machine with an arcade flight model, and a
quest system with a save file. The three requested features are mostly **gap-filling**, not greenfield:

- **Feature 1 — Wand-aimed casting.** Casting already originates from the wand tip and travels along the aim ray.
  The genuine gap is purely visual: the held wand does not *orient to point along the aim direction* while
  aiming/casting; the arm uses a fixed forward pose keyed only on camera pitch. We add a wand-aim orientation so the
  held wand visibly points down the aim ray, and keep the projectile spawning from the (now correctly oriented)
  wand tip. No change to mana/cooldown economy.
- **Feature 2 — Broomstick flight.** Flight works end to end today, but summoning is **not gated** on owning a broom.
  We add a `hasBroom` progression flag, gate the `Grounded -> Summoning` transition on it, and surface a clear
  message when the player has not yet found a broom.
- **Feature 3 — Map with missions and broom locations.** There is no map UI and no broom pickups in the world. We
  add (a) placeable broom pickup entities in the world (reusing the interactable/WorldItems pattern) whose positions
  live in `layout.ts`, (b) a new rebindable `map` action (default **M**) that opens an SVG overlay panel following
  the existing B/J/I panel pattern, and (c) a top-down schematic that derives all geometry from `layout.ts` and plots
  active/available quests and broom pickups, plus the player's position/facing. Collecting a broom sets `hasBroom`.

Cross-cutting: new state goes through the versioned save (`saveSystem.ts`) with a version bump and safe migration
that keeps v1/v2/v3 loadable; high-frequency data stays in `runtime.ts` and is surfaced to React at ~10 Hz; the new
key is rebindable; the README controls table is updated.

The user's note *"Bar bar access dea lage editor e eta jeno na dea lage"* (the editor should stop repeatedly asking
for access) is an environment/permissions concern, not a code feature. It is recorded here as context only; no code
addresses it.

---

## 2. Per-feature current-state audit

### Feature 1 — Wand-aimed spell casting

| Aspect | State | Evidence |
| --- | --- | --- |
| Right-mouse aim | **Works** | `InputManager.isAimHeld()` returns `mouseButtons.right`; `PlayerController` sets `p.aiming = input.isAimHeld()`, drives the `aim` pose and faces the avatar to the camera yaw. |
| Left-mouse cast | **Works** | `InputManager.consumeLeftClick()` queues one click per press (only while pointer-locked); `SpellRuntime.useFrame` consumes it and calls `tryCast`. |
| Spell selection 1-6 / Z-X cycle | **Works** | `SpellRuntime` `input.onPress` handles `spell\d`, `nextSpell`, `prevSpell`; bindings exist in `bindings.ts` (`spell1..6`, `nextSpell`=X, `prevSpell`=Z). |
| Effect originates from wand tip | **Works (data)** | `tryCast` sets `ctx.origin.copy(runtime.wandTip)`; `spawnProjectile` fires from `this.origin`. `runtime.wandTip` is written each frame from the rig's `wandTip` Object3D world position (`PlayerAvatar` `ProceduralAvatar`/`RealisticAvatar`). |
| Travels in aim direction | **Works** | `spawnProjectile` aims from origin toward `ctx.aimPoint` (the screen-centre raycast hit in `CameraRig`), falling back to `ctx.aimDirection` when the point is too close. |
| Mana / cooldowns | **Works** | Pure economy in `spellSystem.ts` (`canCast`/`applyCast`/`refundCast`/`regenerate`); unit-tested in `spellSystem.test.ts`. Must stay intact. |
| **Wand visibly orients along aim direction** | **MISSING** | The wand group is a child of `handR` in `HumanoidRig` with a fixed `rotation-x={0.25}` and `position={[0,-0.02,-0.02]}`; the wand mesh and the `wandTip` empty (`position=[0,-0.36,0]`) live under it. The `aim`/`cast` poses in `POSES` set `upperArmR`/`forearmR`/`handR` to fixed rotations modulated only by `aimPitch` (camera pitch). Nothing rotates the wand to track the aim *yaw*; the whole avatar yaws to the camera (`PlayerController` facing damp to `camYaw`), which *approximates* horizontal aim, but the wand itself never explicitly points along `runtime.aim.direction`, and vertical aim is only loosely approximated. |

**Conclusion:** Feature 1 is ~90% done. The only genuine gap is a visible wand-aim orientation so the held wand
points along `runtime.aim.direction` while aiming/casting, with the projectile continuing to spawn from the (now
correctly pointed) tip.

### Feature 2 — Broomstick flight

| Aspect | State | Evidence |
| --- | --- | --- |
| Flight state machine | **Works** | `flightMachine.ts` implements Grounded→Summoning→Mounting→TakingOff→Flying→Landing→Dismounting with interrupts, water refusal, near-ground auto-land, landing timeout. Fully unit-tested in `flight.test.ts`. |
| Summon on F | **Works** | `toggleBroom` default `KeyF`; `PlayerController` `onPress` sets `flightToggle`, fed to `stepFlightMachine` as `toggle`. |
| Mount / take off / fly | **Works** | `PlayerController.useFrame` branches on `isAirborneFlightState`; `flightPhysics.stepFlight` handles throttle/climb/boost/heading; WASD + Shift boost + Space climb + Ctrl/C descend all wired through `input.axis`/`isDown`. |
| Land on F / near ground | **Works** | `machine.state === 'Flying'` + `toggle` or `nearGround` → Landing → Dismounting. |
| Broom visual | **Works** | `PlayerAvatar.Broom` spirals in on Summoning, slides under rider, banks while flying (`isBroomVisible`). |
| Ring course + landing pad quest | **Works** | `FLIGHT_RINGS` in `layout.ts`; `ProgressTriggers` detects platform landing and ring-course reset; `flight-initiation` quest in `questData.ts`. |
| **Broom-acquisition gate** | **MISSING** | `flightMachine` `Grounded` case allows `Summoning` whenever `input.toggle && input.grounded && !overWater`. There is no `hasBroom`/unlocked-brooms concept anywhere in `Progression` (`questEngine.ts`), `saveSystem.ts`, or the controller. Anyone can summon from the start. |

**Conclusion:** Flight is complete and robust. The only gap is the acquisition gate required by Feature 3: summoning
must require that the player has collected a broom.

### Feature 3 — Map with missions and broom locations

| Aspect | State | Evidence |
| --- | --- | --- |
| Map UI panel | **MISSING** | No map overlay. `Overlay` union in `gameStore.ts` is `null \| 'pause' \| 'spellbook' \| 'journal' \| 'inventory' \| 'settings' \| 'dialogue'`. `GameOverlays` renders only those. |
| Map key | **MISSING** | No `map` action in `bindings.ts`; `useMenuKeys` in `App.tsx` only maps `spellbook/journal/inventory`. `KeyM` is unused in `DEFAULT_BINDINGS`. |
| World schematic source | **Available to derive** | `layout.ts` exports `PLATEAU`, `LAKE`, `FOREST`, `COURTYARD`, `GRAND_HALL`, `LIBRARY`, `TRAINING_YARD`, `BRIDGE`, `FLIGHT_PLATFORM`, `TOWERS`, `AREAS`, `WORLD_HALF_SIZE`, `SPAWN`, `FLIGHT_RINGS`, `SECRETS`. No duplication needed. |
| Quest markers data | **Partially available** | `questData.QUESTS` (+ `giver`) and `questEngine` (`activeQuests`, `questStatus`, `currentObjective`, `objectiveTarget`) exist. `HUD.objectivePosition` maps the *first* active quest's objective to a world point, and has one hard-coded available-quest special case (`first-spark` → `NPCS[0]`). A general per-quest / per-giver marker helper does **not** exist yet — it is new logic (see Finding 5 resolution). |
| Broom pickups in world | **MISSING** | `WorldItems.tsx` has targets, crates, sentinel, codex, runes, shrine ember — no broom pickup. No broom positions in `layout.ts`. |
| Player position/facing feed | **Partially available** | `runtime.player.position`, `runtime.player.facing`, and `runtime.camera.yaw` exist. `HudSync` samples at 10 Hz into `hudStore`, but only `heading = runtime.camera.yaw` today; `hudStore` has **no** `playerX`/`playerZ`/`playerFacing` fields (see Findings 3 & 4 resolution). |

**Conclusion:** Feature 3 is genuinely new UI + new world entities + a small amount of state (both in `hudStore` and
in `Progression`). All positional data it needs either already lives in `layout.ts` or will be added there (broom
pickups) so `layout.ts` stays the single source of truth.

---

## 3. Technology stack (locked)

No new runtime dependencies. The map panel is rendered as **inline SVG inside a React component** (not canvas, not a
3D minimap). SVG is chosen over canvas because the rest of the UI is declarative React/CSS (`GameMenus.tsx`,
`HUD.tsx`), SVG markers get accessible text/`<title>` for free, hit-testing and styling reuse the existing CSS
variables, and the element count is tiny (a dozen landmarks + a handful of markers) so there is no canvas-level perf
need. State continues to use zustand; high-frequency data stays in `runtime.ts`.

---

## 4. Requirements

### Functional requirements

**Wand-aimed casting (F1)**
- F1.1 While aiming (RMB held) or during a cast, the held wand must visibly rotate so its tip axis points along
  `runtime.aim.direction` (both yaw and pitch), within the natural range allowed by a pitch clamp.
- F1.2 Spell projectiles and point-of-origin effects must continue to spawn from the wand tip's world position after
  the orientation in F1.1 is applied (i.e. the existing `runtime.wandTip` remains the origin, now correctly pointed).
- F1.3 The behaviour must work for the procedural `HumanoidRig` avatar (the shipped default, since
  `characterLibraryAvailable()` is `false`), and degrade gracefully (fallback origin, no correction) when a wand node
  is absent — including the skinned `RealisticAvatar` path when it exposes no settable wand group.
- F1.4 Mana, cooldowns, unlock gating, and the fizzle/refund flow are unchanged.

**Broomstick flight (F2)**
- F2.1 The player can only summon the broom (`Grounded -> Summoning`) when they possess a broom (`hasBroom === true`).
- F2.2 Attempting to summon without a broom produces a clear, player-visible message and stays Grounded.
- F2.3 All existing flight behaviour (mount, take off, fly with WASD + boost + climb/descend, land) is unchanged
  once summoning is permitted.
- F2.4 Collecting a broom pickup in the world sets `hasBroom = true` and notifies the player.

**Map (F3)**
- F3.1 A new rebindable action `map` (default **M**) toggles a Map overlay following the B/J/I panel pattern.
- F3.2 The Map renders a top-down schematic whose landmark geometry is derived from `layout.ts` (no duplicated
  coordinates).
- F3.3 The Map plots markers for every **active** and every **available** quest, labelled, at the quest's relevant
  world location (available → the quest's giver NPC; active → the current objective's location).
- F3.4 The Map plots markers for every broom pickup location; collected pickups are visually distinguished from
  uncollected ones.
- F3.5 The Map shows the player's current position and **avatar facing** (`runtime.player.facing`, not camera yaw).
- F3.6 Broom pickup positions are defined once in `layout.ts` and consumed by both the world entity and the map.

### Non-functional requirements

- NF.1 No per-frame React re-renders from the map or HUD: the map reads a ~10 Hz snapshot of player pose/facing from
  `hudStore` (extended with `playerX`/`playerZ`/`playerFacing`), consistent with `HudSync`.
- NF.2 New persisted state integrates into the versioned save with a version bump and safe defaults for old saves;
  loading a pre-change save (v1 **or** v2) must not throw and must default `hasBroom` to `false` and
  `broomsCollected` to `[]`.
- NF.3 The `map` key is rebindable and conflict-checked like every other binding; it must not collide with a default
  binding.
- NF.4 Accessibility: the overlay uses `role="dialog"` with an `aria-label`, markers carry text labels / `<title>`,
  and it is dismissible by its key, Esc, and an on-panel close control — matching existing panels.
- NF.5 Styling uses existing CSS variables/classes (`panel`, `modal`, `overlay-backdrop`, `--gold`, etc.).

### Acceptance criteria (specific, testable, numbered)

1. With RMB held and the camera pitched up/down and yawed, the procedural avatar's **wand group** (`wandRoot`) is
   oriented so its local tip axis (**-Y**, the axis the `wandTip` empty sits on) points along `runtime.aim.direction`
   within **~5°** in the horizontal plane and tracks pitch up to the pinned clamp; verified by a code-path trace plus
   a unit test. The clamp is pinned to `CAMERA_LIMITS.groundPitch = [-1.2, 0.55]` (imported, not re-hardcoded):
   `wandAim.test.ts` asserts the pure `clampWorldAimPitch` returns `y === sin(0.55)` at the up-extreme and
   `y === sin(-1.2)` at the down-extreme (within 1e-6, yaw preserved), and that `wandAimRotation` maps local **-Y**
   onto the clamped direction within ~5°. (Tolerance is honest: the correction is applied directly to the wand group,
   so there is no residual `handR`/wand-tilt error — see §5.)
2. An Arc Bolt cast while aiming at a target spawns from the wand tip and travels toward the aim point (unchanged
   economy): `spellSystem.test.ts` continues to pass unmodified, and a focused assertion confirms the spawn origin is
   copied from `runtime.wandTip`.
3. From a fresh progression (`createProgression()`), `hasBroom === false` and `broomsCollected` deep-equals `[]`.
4. `stepFlightMachine` from `Grounded` with `{ toggle:true, grounded:true, overWater:false, hasBroom:false }` stays
   `Grounded` and returns a non-empty `blocked` message (new unit test).
5. The same call with `hasBroom:true` transitions to `Summoning` (new unit test); all existing `flight.test.ts`
   cases still pass after `idle` gains `hasBroom:true`.
6. Collecting a broom pickup sets `useProgression.getState().progression.hasBroom === true`, appends the id to
   `broomsCollected`, and emits a notification + a `broom:collected` event; calling it again with the same id is a
   no-op (store test + code-path trace).
7. Pressing **M** in gameplay opens the Map overlay; pressing M again or Esc closes it; the overlay has
   `role="dialog"`.
8. `sanitizeProgression` applied to an object lacking `hasBroom` returns `hasBroom === false` and lacking
   `broomsCollected` returns `[]`; a round-trip with both set preserves them (new save test).
9. `parseSave` succeeds for a **v1** string, a **v2** string (defaulting `hasBroom:false`, `broomsCollected:[]`), and
   a **v3** string (round-trips both new fields); a `version: 4` string returns `{ ok:false, reason:'unsupported' }`
   (new save tests). `hasValidSave()` stays `true` for a stored v2 save.
10. The Map derives at least the lake, forest, plateau, courtyard, library, grand hall, training yard, flight
    platform, and towers from `layout.ts` symbols (no numeric literals duplicating those **landmark** coordinates in
    the map component) — verified by code review/trace.
11. The map shows exactly one marker per active quest, exactly one per available quest (at its giver NPC), and one
    per broom pickup; collected brooms render in the collected style. A `questMap.test.ts` asserts: (a) each of the
    three quests, when `available`, yields a marker at its giver's position; (b) each active-objective kind
    (`talk`/`spellHit`/`collect`/`flightState`/`rings`/`reach`) yields the documented location — in particular an
    active `flightState` objective (flight-initiation's `summon-broom`) yields a marker at `FLIGHT_PLATFORM.center`;
    and (c) the refactored HUD compass is byte-identical to today for `talk`/`spellHit`/`rings`/`reach`, returns
    **null** for an active `flightState` objective (unchanged — the old switch fell through its `default` to `null`),
    and returns the corrected `CODEX_POSITION` (`-43.3,-40.2`, a <0.4 m shift from the old `[-43,-40]`) for an active
    `collect` objective.
12. `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build` all pass.

### Out of scope

- Any change to the editor's permission prompts (environment concern, not code).
- Fog-of-war / map discovery progression, map zoom/pan, waypoint setting.
- New spells, new flight physics, new quests, or NPC changes.
- Replacing the procedural avatar or the skinned character pipeline.
- Minimap / 3D map rendering.
- Mystic-Pull broom pickup (interact-to-take only; deferred).

---

## 5. Design — Feature 1: wand points along the aim direction

### Approach choice

Two viable approaches:

- **(A) Author aim/cast poses that already point forward and rely on the avatar yawing to the camera.** This is what
  exists; it is cheap but the wand only *approximately* tracks horizontal aim (via body facing) and barely tracks
  pitch, and it cannot react to aim offsets. Rejected as the status quo that leaves the gap.
- **(B) After the pose blender writes joint rotations, apply a corrective local-space orientation to the wand group
  so the wand's tip axis aligns with `runtime.aim.direction`.** This layers on top of the existing animation without
  replacing any pose, works for arbitrary aim, and is localised to the avatar component.

**Chosen: (B).** It is the minimal, additive change that satisfies F1.1–F1.3 and leaves the animation system and
economy untouched.

### Pivot choice (resolves Finding 2)

The prior iteration proposed rotating **`forearmR`** so "the forearm's local -Y points along aim". That is wrong: the
tip is not on forearmR's -Y axis. The real hierarchy (verified in `HumanoidRig.tsx`) is:

```
forearmR  ->  handR (rotated every frame by the aim/cast pose)  ->  wandGroup (fixed rotation-x=0.25, pos=[0,-0.02,-0.02])  ->  wandTip (pos=[0,-0.36,0])
```

So the tip axis is the **wand group's local -Y**, measured in the wand group's parent space (which already bakes in
`handR`'s per-frame rotation and the group's own fixed tilt). Rotating `forearmR` would leave a residual error equal
to the composed `handR * wandGroup` rotation.

**Chosen fix (option (a) from the finding):** apply the corrective rotation **to the wand group itself**. We expose
the wand group as a new handle field `wandRoot: Object3D | null` from `HumanoidRig` (ref the existing
`<group rotation-x={0.25} position={[0,-0.02,-0.02]}>`). After `blender.apply`, we set `wandRoot`'s local quaternion
so that its local **-Y** (the axis `wandTip` sits on) points along the aim direction expressed in the wand group's
**parent** space. Because the correction is on the exact node the tip hangs from, "wand local -Y → aim" is **exact**
(no residual), which is why AC-1's tolerance is tightened to ~5° (only the pitch clamp and the damp ramp introduce
deviation, not kinematic residue).

### Mechanism

In `ProceduralAvatar.useFrame`, after `blender.apply(...)` and before reading the tip into `runtime.wandTip`:

1. Compute an aim-active factor `k` that ramps 0→1 while `runtime.player.aiming` **or**
   `runtime.player.castStartedAt >= 0 && now - runtime.player.castStartedAt < 0.4`, damped (reuse `dampFactor`) so it
   eases in/out — avoids a snap when aiming starts/stops. Gate `k` to **ground, non-flying** states so the correction
   never fights the broom-ride pose.
2. When `k > 0` and `wandRoot` exists: take `aimDir = runtime.aim.direction` (world space, unit). **Clamp the pitch
   in WORLD space first** (step 3), then transform the clamped world direction into the wand group's **parent**
   space: `parentWorldQuat = wandRoot.parent.getWorldQuaternion(...)`, then
   `localAimDir = clampedWorldDir.clone().applyQuaternion(parentWorldQuat.clone().invert())`. Call
   `wandAimRotation(localAimDir)` to get the target local quaternion that maps local **-Y** onto `localAimDir`. Slerp
   `wandRoot.quaternion` toward it by `k` (so at `k<1` it blends from the pose-authored orientation toward the
   aim-locked one).
3. **Pitch clamp (pinned — resolves Finding 1).** The clamp is applied to the WORLD-space aim pitch *before* the
   parent-space transform, so it maps directly and exactly onto the camera's euler-pitch limits (there is no implicit
   parent-space mapping). The rule is:

   ```ts
   // CAMERA_LIMITS imported from ../camera/CameraRig — NOT re-hardcoded.
   const worldPitch = Math.asin(clamp(aimDir.y, -1, 1))               // aimDir is unit; y = sin(pitch)
   const clampedPitch = clamp(worldPitch, CAMERA_LIMITS.groundPitch[0], CAMERA_LIMITS.groundPitch[1]) // [-1.2, 0.55]
   const yaw = Math.atan2(aimDir.x, aimDir.z)                          // preserve horizontal bearing
   const clampedWorldDir = new Vector3(
     Math.sin(yaw) * Math.cos(clampedPitch),
     Math.sin(clampedPitch),
     Math.cos(yaw) * Math.cos(clampedPitch),
   ) // unit by construction
   ```

   The yaw/axis convention is whatever reproduces `aimDir` when `clampedPitch === worldPitch` (verified by the
   round-trip assertion in the test). The clamp lives in `wandAim.ts` as a small pure helper
   `clampWorldAimPitch(aimDir, [min, max]): Vector3` so it is unit-testable independently of the scene. Because the
   clamp is on the *world* pitch, the AC-1 test asserts concrete values: at the up-extreme the returned direction's
   `y` equals `sin(0.55)`, at the down-extreme `sin(-1.2)`, each within tolerance. Gameplay aim is unaffected — the
   projectile still uses the true `aimPoint`/`aimDirection`; only the *visual* wand pose is clamped.
4. Then (unchanged) read `r.wandTip.getWorldPosition(_tip)` into `runtime.wandTip`. Because the wand node is a child
   of the now-corrected `wandRoot`, the tip world position already reflects the aim orientation — F1.2 holds with **no
   change to `SpellRuntime`**.

For `RealisticAvatar` (skinned GLB): `AvatarController` exposes `wandTip` and `pelvis` but **no settable wand group**.
We therefore apply the same correction only if a `wandRoot`-equivalent is exposed; otherwise the realistic path keeps
its current approximation and the documented fallback origin. This is acceptable because `characterLibraryAvailable()`
is `false` in the shipped repo, so the procedural path (which carries the full feature) is the default. (Hedged; not
blocking per the review's "Unverified/hedged, acceptable".)

### Extract a pure helper for testability

Pose/quaternion math is otherwise untestable without a renderer. We extract a pure function into
`src/game/player/wandAim.ts`:

```ts
import { Quaternion, Vector3 } from 'three'
import { CAMERA_LIMITS } from '../camera/CameraRig' // single source of pitch limits — not re-hardcoded
// WAND_LOCAL_AXIS is the wand group's local tip axis = (0,-1,0), the axis wandTip sits on.
export const WAND_LOCAL_AXIS = new Vector3(0, -1, 0)

/**
 * Clamp the WORLD-space aim pitch to the given [min,max] (radians) while preserving yaw.
 * `aimDir` must be unit length. Returns a new unit Vector3. Pure.
 * Default limits are CAMERA_LIMITS.groundPitch = [-1.2, 0.55].
 */
export function clampWorldAimPitch(
  aimDir: Vector3,
  limits: readonly [number, number] = CAMERA_LIMITS.groundPitch,
): Vector3

/**
 * Given the aim direction already expressed in the wand group's PARENT space, return the local
 * quaternion that rotates WAND_LOCAL_AXIS onto that direction. Pure: no scene access.
 * (Pitch is clamped earlier in WORLD space by clampWorldAimPitch, so this function does NOT clamp.)
 */
export function wandAimRotation(parentSpaceAimDir: Vector3): Quaternion
// Implementation: normalize, Quaternion.setFromUnitVectors(WAND_LOCAL_AXIS, dir).
```

`wandAim.test.ts` asserts two things (AC-1):
- **Clamp (concrete values).** `clampWorldAimPitch` with an input aimed above the limit returns a direction whose
  `y === sin(CAMERA_LIMITS.groundPitch[1])` (`sin(0.55)`) within 1e-6, and below the limit returns
  `y === sin(CAMERA_LIMITS.groundPitch[0])` (`sin(-1.2)`); a mid-range input round-trips unchanged; yaw
  (`atan2(x,z)`) is preserved by the clamp. The expected numbers are derived from the imported `CAMERA_LIMITS`, so
  the test and the implementation share one source.
- **Rotation.** Applying `wandAimRotation(dir)` to `WAND_LOCAL_AXIS` reproduces `dir` within ~5° for representative
  parent-space directions (exact mapping, no residual — the correction is on the wand group itself).

### Files touched (F1)

- `src/game/player/wandAim.ts` — **new**, pure helpers (`WAND_LOCAL_AXIS`, `clampWorldAimPitch`, `wandAimRotation`),
  importing `CAMERA_LIMITS` from `../camera/CameraRig` for the pitch bounds.
- `src/game/player/HumanoidRig.tsx` — add `wandRoot: Object3D | null` to `HumanoidHandle`; `ref` the wand group;
  expose it from `useImperativeHandle`.
- `src/game/player/PlayerAvatar.tsx` — in `ProceduralAvatar.useFrame`, apply the corrective slerp to `wandRoot` after
  `blender.apply` and before reading `wandTip` into `runtime.wandTip`; mirror (hedged) in the realistic path only if a
  wand group is exposed.
- `src/game/player/wandAim.test.ts` — **new** unit test.
- No change to `SpellRuntime.tsx`, `spellSystem.ts`, `registry.ts`, or the economy.

### Edge cases (F1)

- Aiming straight up/down: pitch is clamped so the wand stays in a plausible range; the projectile still uses the true
  `aimPoint`/`aimDirection` (origin from the tip), so gameplay aim is unaffected even if the pose is clamped.
- Flying: casting is already restricted to `FLIGHT_ALLOWED` spells and the flight pose dominates; `k` is gated to
  ground, non-flying states so it never fights the broom-ride pose.
- Rapid aim on/off: `k` is damped, so no visual snap.
- Missing `wandRoot`/`wandTip` node: the correction is skipped and the existing fallback
  (`runtime.wandTip.set(..., y+1.4, ...)`) is retained.

### Error handling (F1)

The wand-aim path performs no I/O and cannot fail recoverably; the only failure mode is a missing rig node, handled
by the existing fallback (not fatal, not logged — it is an expected per-frame branch).

---

## 6. Design — Feature 2: broom acquisition gate

### State shape change

Add to `Progression` (in `questEngine.ts`):

```ts
hasBroom: boolean          // true once any broom pickup is collected
broomsCollected: string[]  // ids of collected broom pickups (future-proofs multiple brooms; drives map "collected" styling)
```

`createProgression()` defaults `hasBroom:false`, `broomsCollected:[]`. `hasBroom` is derived-but-stored: it is set
true when the first broom is collected. Storing both is deliberate — `broomsCollected` tells the map which pickups
are gone; `hasBroom` is the cheap gate flag read every frame.

### Progression store action

Add `collectBroom(id: string)` to `progressionStore.ts`:

- If `broomsCollected` already includes `id`, no-op (idempotent — AC-6).
- Else set `{ hasBroom: true, broomsCollected: [...prev, id] }`, emit a HUD notification (`kind:'reward'`), emit the
  event `events.emit({ type: 'broom:collected', broomId: id })`, and `save()`.
- **Notification key label (resolves Finding 6).** The summon key is the rebindable `toggleBroom`, so the message
  resolves the live binding rather than hard-coding "F":
  `` `You found a broom. Press ${keyLabel(useSettings.getState().controls.bindings.toggleBroom[0])} to summon it.` ``
  (`keyLabel` is already exported from `bindings.ts` and used by the HUD/controls hint). This stays correct after a
  rebind.
- **Event field name (resolves Finding 5).** The event is `{ type: 'broom:collected'; broomId: string }` — matching
  the `events.ts` naming convention (`itemId`/`questId`/`npcId`/`locationId`); no existing event uses a bare `id`.

### Gating the flight machine

`stepFlightMachine` is pure and unit-tested; we thread a `hasBroom` boolean through `FlightMachineInput` rather than
reaching into stores (keeps the function pure and testable):

```ts
export interface FlightMachineInput {
  toggle: boolean
  grounded: boolean
  nearGround: boolean
  overWater: boolean
  interrupted: boolean
  hasBroom: boolean   // NEW
}
```

In the `Grounded` case, before the existing checks:

```ts
if (input.toggle) {
  if (!input.hasBroom) return stay({ blocked: 'You have no broom. Find one on the grounds first.' })
  if (!input.grounded) return stay({ blocked: 'You need solid footing to summon the broom.' })
  if (input.overWater)  return stay({ blocked: 'You cannot summon the broom here.' })
  return to('Summoning')
}
```

(Field/return names match the real `flightMachine.ts` shapes confirmed in the review's "Verified Assumptions".)

`PlayerController.useFrame` passes `hasBroom: useProgression.getState().progression.hasBroom` into the
`stepFlightMachine` input. The existing `if (machine.blocked) useHud.getState().fizzle(machine.blocked)` surfaces the
message (F2.2), reusing the fizzle toast already rendered by `SpellBar`.

### Soft-lock avoidance (resolves Finding 8)

The `flight-initiation` quest's `summon-broom` objective (`flightState: 'Summoning'`) can only advance once summoning
is permitted, which now requires `hasBroom`. To prevent a soft-lock, **at least one broom pickup is placed in an
early, reachable area (the Courtyard/Practice Grounds)** so the player can obtain a broom before reaching the flight
quest; a second broom sits by the Skyward Platform. This verified early-broom placement is the sole soft-lock guard.
The prior claim that "the flight instructor's dialogue already gates the quest" is **removed** — it was not verified
against dialogue data and is unnecessary.

### Test impact (F2)

`flight.test.ts`'s `idle` input constant gains `hasBroom:true` so existing transition tests keep passing (they are
about mechanics, not the gate). Two new tests assert the gate (AC-4, AC-5). The pure machine stays free of store
imports.

### Files touched (F2)

- `src/game/quests/questEngine.ts` — extend `Progression`, `createProgression`.
- `src/game/state/progressionStore.ts` — add `collectBroom`.
- `src/game/flight/flightMachine.ts` — add `hasBroom` to input + gate.
- `src/game/player/PlayerController.tsx` — pass `hasBroom` into `stepFlightMachine`.
- `src/game/flight/flight.test.ts` — update `idle`, add two gate tests.
- `src/game/core/events.ts` — add `broom:collected` event (see §8).

### Edge cases / invariants (F2)

- Save with `hasBroom:true` but zero brooms in `broomsCollected` (hand-edited/corrupt): the sanitizer keeps
  `hasBroom` as given (boolean) and `broomsCollected` as a filtered string array; the gate still works. Invariant
  *"hasBroom implies at least one collected"* is **not** enforced on load because enforcing it could strip a
  legitimately unlocked broom; the gate only reads `hasBroom`, so a lenient load is safe. Enforcement layer: none by
  design; documented here.
- Collecting the same broom twice: `collectBroom` is idempotent on `id`.

---

## 7. Design — Feature 3: broom pickups + Map overlay

### 7.1 Broom pickup entities

**Positions (single source of truth).** Add to `layout.ts`:

```ts
export interface BroomPickupDef { id: string; name: string; position: Vec3Tuple }
export const BROOM_PICKUPS: BroomPickupDef[] = [
  { id: 'broom-courtyard', name: 'Training Broom', position: [ 18, 0, 36] },   // near Practice Grounds entrance (early, reachable)
  { id: 'broom-platform',  name: 'Swiftwood Broom', position: [-56, FLIGHT_PLATFORM.height, 24] }, // by the Skyward Platform
]
```

Exact Y for the ground pickup is resolved at mount time via `terrainHeight(x,z)` (as `ShrineEmber`/`Rune` already do),
so only X/Z are authored meaningfully; the platform broom uses `FLIGHT_PLATFORM.height`. The courtyard broom is
reachable before the platform (soft-lock guard, §6).

**Entity.** Add a `BroomPickup` component in `WorldItems.tsx` modelled on `Codex`/`ShrineEmber`:

- Reuses `BroomModel` (currently defined locally in `PlayerAvatar.tsx`) so the pickup and the ridden broom look
  identical. To avoid an import cycle, `BroomModel` is moved into a tiny shared presentational module
  `src/game/world/BroomModel.tsx` and imported by both `PlayerAvatar.tsx` and `WorldItems.tsx` (low risk, pure
  presentational component).
- Derives `collected` from a `useProgression` selector: `const collected = useProgression(s => s.progression.broomsCollected.includes(id))`
  — exactly matching `Codex`/`ShrineEmber`. **It does NOT use `sessionId`** (that mechanism is only for
  transient-physics items such as `PracticeTarget`/`Crate`/`Sentinel`). A new game resets collection because
  `newGame()` rebuilds progression via `createProgression()`, so the broom reappears. (Resolves Finding 6.)
- When not collected, registers an interactable (`registerInteractable({ id, position, radius: ~2.5, verb:'Take',
  label:name, onInteract })`) and renders the floating broom mesh; the effect cleanup unregisters it.
- `onInteract` calls `useProgression.getState().collectBroom(id)`.
- Returns `null` for the mesh and unregisters once `collected` — consistent with `Codex` (`if (collected) return null`).
- A gentle bob/float + glow so it reads as collectible, consistent with `Codex`/`Rune` visuals.

**Decision:** register the broom as an **interactable only** (interact to pick up); no `EntityKind` change and no
Mystic-Pull pickup, to keep scope tight (deferred, out of scope §4).

### 7.2 New input action `map`

- `bindings.ts`: add `'map'` to the `Action` union, `ACTION_META.map = { label:'Open world map', context:'any',
  group:'Interface' }`, and `DEFAULT_BINDINGS.map = ['KeyM']`. `ACTIONS = Object.keys(DEFAULT_BINDINGS)`, so it
  updates automatically. **KeyM is currently unbound** (verified against `DEFAULT_BINDINGS`), so no default conflict.
- `settings.ts` `sanitizeSettings` iterates `ACTIONS`, so the new action is picked up automatically; old stored
  settings without `map` get the default `['KeyM']` via the existing fallback branch. No settings version bump needed.
- `SettingsPanel` renders bindings by `ACTION_META[...].group`, so `map` appears under **Interface** and is rebindable
  and conflict-checked (`findConflicts` iterates `ACTIONS`) with zero component changes.

### 7.3 Opening the Map overlay

- `gameStore.ts`: extend `Overlay` union with `'map'`.
- `App.tsx` `useMenuKeys` (resolves Finding 3). The real function uses a local `const map = { spellbook, journal,
  inventory }` and gates opening with an explicit `||` allow-list. Two concrete edits:
  - **Rename the local toggle table** from `map` to `toggles` to avoid the confusing `map: b.map` written into a const
    already named `map`:
    ```ts
    const toggles = { spellbook: b.spellbook, journal: b.journal, inventory: b.inventory, map: b.map } as const
    for (const [overlay, codes] of Object.entries(toggles) as Array<[keyof typeof toggles, string[]]>) {
    ```
  - **Add `'map'` to the open guard** so the map opens from any panel AND other panels open while the map is up (no
    silent no-op). The exact revised line:
    ```ts
    if (g.overlay === overlay) resumeGame()
    else if (
      g.overlay === null || g.overlay === 'pause' || g.overlay === 'spellbook' ||
      g.overlay === 'journal' || g.overlay === 'inventory' || g.overlay === 'map'
    ) g.openOverlay(overlay)
    ```
  The toggle logic (open if closed/other panel, resume if already this panel) is otherwise reused verbatim. §10 trace
  4 verifies the allow-list symmetry.
- `GameMenus.tsx` `GameOverlays`: render `{overlay === 'map' && <WorldMap />}` inside the existing `overlay-backdrop`.

### 7.4 The `WorldMap` component (SVG)

New file `src/ui/menus/WorldMap.tsx`. A `role="dialog"` panel (`panel modal`) with a `CloseButton` header matching
the other panels.

**Projection.** A pure helper `src/game/world/mapProjection.ts` maps world (x,z) to SVG coordinates:

```ts
export const MAP_VIEW = WORLD_HALF_SIZE   // half-extent shown; derived, not hardcoded
export function worldToMap(x: number, z: number, size: number): { mx: number; my: number }
// mx = (x / (2*MAP_VIEW) + 0.5) * size ; my = (z / (2*MAP_VIEW) + 0.5) * size
// Note: world +Z maps to +Y (down) in SVG, so north (−Z) is up. Documented in the file.
```

Keeping projection pure lets us unit test it (round-trip center, corners) and keeps the component declarative.

**Schematic layers (all derived from `layout.ts` — AC-10):**

- Water: `LAKE` as a circle (`center`, `radius`); ocean/void as the SVG background.
- Terrain regions: `FOREST` circle; `PLATEAU` rectangle.
- Structures as rectangles: `COURTYARD`, `GRAND_HALL`, `LIBRARY`, `TRAINING_YARD`, `BRIDGE` (from `minZ/maxZ` +
  `halfWidth`, centered on x=0).
- `FLIGHT_PLATFORM` as a circle (`center`/`radius`).
- `TOWERS` as small circles at each `(x,z)` with `radius`.
- Optional faint `FLIGHT_RINGS` dots and `SECRETS` (only when `cartographers-lens` owned, mirroring the compass rule
  in `HUD`).

Each shape is produced by passing the layout symbol through `worldToMap`; **no coordinate literal from `layout.ts` is
copied into the component** (AC-10).

**Quest markers (F3.3) — new shared helper (resolves Finding 5).** The existing `HUD.objectivePosition` is NOT a
general per-quest mapper: it handles only `activeQuests(p)[0]`, has one hard-coded `first-spark → NPCS[0]` available
case, and returns a hard-coded `[-43,-40]` for `collect`. F3.3 needs a marker for **every** active and **every**
available quest. We therefore write **new logic** in a shared module `src/game/quests/questMap.ts`:

```ts
export interface QuestMarker { id: string; label: string; at: [number, number]; status: 'active' | 'available' }
export function questMarkers(p: Progression): QuestMarker[]
```

- For each quest in `QUESTS`:
  - if `questStatus(p, q.id) === 'available'`: place a marker at its **giver** NPC via
    `NPCS.find(n => n.id === q.giver)` (new generic giver lookup — this did not exist before). Skip if no giver NPC
    found.
  - if `active`: place a marker at the current objective's world location, over **all** active quests (not just the
    first). The real `ObjectiveDef` union has **six** kinds — `talk | spellHit | collect | flightState | rings |
    reach` (verified in `questData.ts`) — and `questMarkers` handles every one:
    - `talk` → the target NPC position (`NPCS.find(n => n.id === o.npcId)`).
    - `spellHit` → the training-yard center (`[(TRAINING_YARD.minX+maxX)/2, (minZ+maxZ)/2]`).
    - `collect` → `CODEX_POSITION` (the shared layout constant; see Finding 2 resolution).
    - `flightState` → `FLIGHT_PLATFORM.center`. **This is a new decision** (the existing `HUD.objectivePosition`
      has no `flightState` case and falls through to `null`): on the *map* we want the player to see where to go to
      summon the broom, so flight-initiation's active `summon-broom` objective is plotted at the Skyward Platform.
    - `rings` → the next uncollected ring (`FLIGHT_RINGS[firstIndex not in p.ringsCollected]`).
    - `reach` → `FLIGHT_PLATFORM.center`.
    `questMarkers` therefore **never** returns `undefined`/throws for a valid active objective; if an NPC lookup
    fails (should not happen — all givers/npcIds exist) that single marker is skipped.
  - **Compass divergence for `flightState` is intentional and documented.** The compass is derived from
    `questMarkers` but the `objectivePosition` wrapper deliberately maps a `flightState` active objective back to
    `null` (preserving today's behaviour where the compass shows no marker while summoning), whereas the *map* shows
    the `FLIGHT_PLATFORM.center` marker. This is the one place map and compass intentionally differ; both are
    asserted in `questMap.test.ts` (AC-11).
  - `completed` quests are omitted.
- `HUD.objectivePosition` (the compass) is refactored to share the per-objective location logic with `questMarkers`
  so the two cannot drift on the kinds they agree on. To keep the compass behaviour it has today, the shared
  per-objective resolver is parameterised with a `forCompass` flag: when `forCompass` is true, a `flightState`
  objective resolves to `null` (matching today's fall-through) instead of the platform the map uses. The compass then
  takes the first active quest's objective (plus the existing `first-spark`-available special case). Net effect: the
  HUD is byte-identical to today for `talk`/`spellHit`/`rings`/`reach`/`flightState`, and the **only** behavioural
  change is the `collect` marker, corrected from the placeholder `[-43,-40]` to the true `CODEX_POSITION`
  (`-43.3,-40.2`), a <0.4 m shift (see Finding 2 resolution). AC-11 asserts the unchanged cases, the `null` for
  `flightState`, and the corrected `collect` case.
- The `collect` objective's position is sourced from a **shared codex constant** rather than re-hard-coding
  `[-43,-40]`. We export `CODEX_POSITION: Vec3Tuple = [-43.3, LIBRARY_BALCONY_Y + 1.05, -40.2]` from `layout.ts` —
  exactly the literal that `WorldItems.Codex` already uses (`new Vector3(-43.3, LIBRARY_BALCONY_Y + 1.05, -40.2)`,
  verified) — and have both `WorldItems.Codex` and `questMap` consume it. (Resolves the duplicated-literal NIT and
  Finding 2.)
- **Compass drift is accepted and documented (resolves Finding 2).** The real `HUD.objectivePosition` `collect` case
  currently returns the hard-coded `[-43, -40]`, which is **not** the true codex position (`-43.3, -40.2`). Routing
  the refactored compass through `CODEX_POSITION` therefore **corrects** the `lost-archive` collect marker by about
  **0.36 m** (`hypot(0.3, 0.2)`). We deliberately accept this as a bug fix, not a regression: the compass points at
  the actual Codex rather than a rounded placeholder. The "unchanged" claims elsewhere in this document are scoped
  accordingly — the compass is byte-identical for every objective **except** `collect`, whose marker shifts <0.4 m to
  the true codex. AC-11 asserts this explicitly (see below).

**Broom markers (F3.4).** For each `BROOM_PICKUPS` entry, a broom glyph at `worldToMap(position)`, styled
"available" vs "collected" based on `progression.broomsCollected.includes(id)`.

**Player marker (F3.5) — avatar facing, not camera yaw (resolves Finding 3).** A triangle at
`worldToMap(playerX, playerZ)` rotated by the **player facing**. Position and facing come from a **10 Hz snapshot**,
not per frame: `HudSync` is extended to also patch `playerX: runtime.player.position.x`,
`playerZ: runtime.player.position.z`, and `playerFacing: runtime.player.facing` into `hudStore`. The existing
`heading` field stays `runtime.camera.yaw` and continues to drive the compass. The map reads `useHud` selectors for
`playerX/playerZ/playerFacing`, so it re-renders at most ~10 Hz while open and never per animation frame (NF.1).

**Accessibility/styling.** `role="dialog"`, `aria-label="World map"`; each marker `<g>` has a `<title>` and the quest
list is also rendered as a short textual legend beneath the SVG for screen-reader users; colors use existing CSS
variables. Closable via M, Esc, and the header close button.

### 7.5 Files touched (F3)

- `src/game/world/layout.ts` — add `BroomPickupDef` + `BROOM_PICKUPS` + `CODEX_POSITION` constant.
- `src/game/world/BroomModel.tsx` — **new** (moved shared broom mesh).
- `src/game/player/PlayerAvatar.tsx` — import `BroomModel` from the new module.
- `src/game/world/WorldItems.tsx` — add `BroomPickup` component + render loop; `Codex` sources its position from
  `CODEX_POSITION`.
- `src/game/input/bindings.ts` — add `map` action/meta/default.
- `src/game/state/gameStore.ts` — add `'map'` to `Overlay`.
- `src/game/state/hudStore.ts` — **add `playerX: number`, `playerZ: number`, `playerFacing: number`** to the
  `HudStore` interface and initial state (all default `0`), so `patch` type-checks (resolves Finding 4).
- `src/game/core/Systems.tsx` — `HudSync` patches `playerX`/`playerZ`/`playerFacing` on the existing 10 Hz tick.
- `src/App.tsx` — handle the `map` key in `useMenuKeys`.
- `src/ui/menus/GameMenus.tsx` — render `<WorldMap />`.
- `src/ui/menus/WorldMap.tsx` — **new** panel.
- `src/game/world/mapProjection.ts` — **new** pure projection helper (+ test).
- `src/game/quests/questMap.ts` — **new** shared quest-marker helper (+ test); `HUD.tsx` refactored to use it.
- `README.md` — add the Map row to the controls table.

### 7.6 Edge cases (F3)

- Map opened with no active quest and `first-spark` available: one "available" marker at the giver (Magister Vale),
  matching the compass.
- All brooms collected: broom markers all render in the collected style; no world broom meshes remain.
- Player outside the shown extent (shouldn't happen: `WORLD_HALF_SIZE` clamps movement): the player marker is clamped
  to the map edge.
- Map opened while flying: allowed (it is an overlay that pauses input like other panels); the player triangle still
  updates from the 10 Hz snapshot.
- Opening another panel while the map is open: handled by the single-overlay model (`openOverlay` replaces).

### 7.7 Validation of external inputs (F3)

The map consumes only internal state (progression, runtime snapshot, layout constants) — no untrusted input. The only
externally-sourced data is the save file, validated by the save sanitizer (§8). The `map` binding comes from
`settings.ts` which already coerces arbitrary stored data via `sanitizeSettings` (`['KeyM']` default on absence).

---

## 8. Save-version migration plan (resolves Finding 1 — HIGH)

New persisted fields: `Progression.hasBroom: boolean` and `Progression.broomsCollected: string[]`.

- `SAVE_VERSION` bumps **2 → 3** in `saveSystem.ts`. The save file shape is otherwise unchanged
  (`{ version, savedAt, progression }`); `SaveFileV2` is renamed/retyped to `SaveFileV3` with `version: 3`.
- `sanitizeProgression` adds (after the existing `const base = createProgression()` spread, which already supplies the
  new defaults):
  - `hasBroom: typeof raw.hasBroom === 'boolean' ? raw.hasBroom : false`
  - `broomsCollected: strings(raw.broomsCollected).filter(id => BROOM_PICKUP_IDS.has(id))` where
    `BROOM_PICKUP_IDS = new Set(BROOM_PICKUPS.map(b => b.id))` (unknown ids dropped, same pattern as `artifacts`).
  - Because `sanitizeProgression` spreads `...base` first, any field it does not set already defaults from
    `createProgression()`; adding the two explicit lines makes the intent and clamping clear and lets old saves (no
    such keys) default safely (NF.2).
- **`parseSave` accepting branches (the fix).** Today `parseSave` accepts only `version === 1` and
  `version === SAVE_VERSION`. Bumping to 3 without a v2 branch would make every currently-shipped **v2** save fall
  through to `{ ok:false, reason:'unsupported' }` — real data loss. The corrected logic keeps **v1, v2, and v3**
  loadable:

  ```ts
  if (raw.version === 1) {
    const progression = sanitizeProgression(migrateV1(raw), warnings)
    return progression ? { ok: true, progression, migratedFrom: 1, warnings } : { ok: false, reason: 'corrupt' }
  }
  if (raw.version === 2 || raw.version === SAVE_VERSION /* 3 */) {
    // v2 and v3 share { version, savedAt, progression }; sanitizeProgression supplies hasBroom/broomsCollected defaults.
    const progression = sanitizeProgression(raw.progression, warnings)
    return progression
      ? { ok: true, progression, migratedFrom: raw.version === SAVE_VERSION ? undefined : 2, warnings }
      : { ok: false, reason: 'corrupt', detail: 'Invalid progression' }
  }
  // Anything else (including version > 3) is from a newer build:
  return { ok: false, reason: 'unsupported', detail: `Save version ${raw.version} is newer than this build supports` }
  ```

  A stored v2 save therefore loads with `hasBroom:false`, `broomsCollected:[]`, and `hasValidSave()` stays `true`.
- `serializeSave` writes `version: 3` (`SaveFileV3`).
- **Save-test additions (AC-8/AC-9):**
  - a **v2** save string (no `hasBroom`) loads successfully with `hasBroom === false`, `broomsCollected` deep-equals
    `[]` (the regression test the review asked for);
  - a **v1** save string still migrates;
  - a **v3** save string round-trips `hasBroom`/`broomsCollected`;
  - a `version: 4` save string returns `{ ok:false, reason:'unsupported' }`.

Events (`src/game/core/events.ts`): add `{ type: 'broom:collected'; broomId: string }` to the `GameEvent` union so
audio/analytics can react later; emitted by `collectBroom`. The `broomId` field name follows the existing convention
(`itemId`/`questId`/`npcId`/`locationId`) — no event uses a bare `id` (Finding 5). (Audio hookup is optional and out
of scope; the event is cheap to add.)

---

## 9. Testability

| Behaviour | Test level | How |
| --- | --- | --- |
| Spell economy unchanged | unit (existing) | `spellSystem.test.ts` runs unmodified. |
| Spawn origin == wand tip | unit (new, light) | assert the cast path copies `runtime.wandTip` into `ctx.origin`. |
| Wand aim rotation + pitch clamp | unit (new) | `wandAim.test.ts`: `clampWorldAimPitch` returns `y=sin(0.55)`/`y=sin(-1.2)` at the extremes (from imported `CAMERA_LIMITS`), preserves yaw, round-trips mid-range; `wandAimRotation(dir)` applied to `WAND_LOCAL_AXIS` reproduces `dir` within ~5° (AC-1). |
| Flight gate (no broom / with broom) | unit (new) | `flight.test.ts` extends `idle` with `hasBroom` and adds two cases (AC-4/5). |
| Existing flight transitions/physics | unit (existing) | `flight.test.ts` still green after `idle` gains `hasBroom:true`. |
| `collectBroom` sets flag + idempotent + event | unit (new) | a store test on the progression mutation (AC-6). |
| Save migration/defaults (v1/v2/v3/future) | unit (new) | `saveSystem.test.ts` for AC-8/AC-9, including the v2-string regression. |
| Map projection round-trip | unit (new) | `mapProjection.test.ts`: center→center, corners→corners. |
| Quest-marker helper | unit (new) | `questMap.test.ts`: each of the three quests when `available` → marker at its giver's position; each active-objective kind → expected location; HUD compass still yields exactly today's first-quest marker (AC-11). |

**Not unit-testable (traced instead):** the actual 3D wand orientation, the SVG rendering, the M-key overlay toggle,
and the in-world pickup interaction. For these, §10 defines explicit code-path traces.

---

## 10. Verification plan

Commands (from the worktree root; PowerShell, chain with `;`). Do **not** run `npm run dev`.

```
npm run typecheck ; npm test ; npm run lint ; npm run build
```

All four must pass (AC-12). **Before editing, run `npm test` once to record the green baseline** (6 test files); the
exact count is established at that moment rather than assumed, so any regression after the changes is attributable
(Finding 7).

**Code-path traces (behaviours not coverable by unit tests):**

1. **Wand points along aim.** Trace `ProceduralAvatar.useFrame`: after `blender.apply`, `k` ramps when
   `runtime.player.aiming` is true (set by `PlayerController` from `input.isAimHeld`) or during the 0.4 s cast window;
   `wandAimRotation` solves the local quaternion from `runtime.aim.direction` transformed into `wandRoot.parent` space;
   `wandRoot.quaternion` slerps toward it; then `r.wandTip.getWorldPosition` writes `runtime.wandTip`. In
   `SpellRuntime.tryCast`, `ctx.origin.copy(runtime.wandTip)` → `spawnProjectile` fires from that origin toward
   `runtime.aim.point`. Confirms F1.1/F1.2 end to end.
2. **Broom gate.** Trace `PlayerController.useFrame` → builds `stepFlightMachine` input with
   `hasBroom: progression.hasBroom` → `Grounded` case returns `blocked` when false →
   `useHud.getState().fizzle(machine.blocked)` renders the toast via `SpellBar`. Confirms F2.1/F2.2.
3. **Broom pickup → flight enabled.** Trace `BroomPickup` interactable `onInteract` → `collectBroom(id)` sets
   `hasBroom:true`, appends to `broomsCollected`, saves, notifies, emits `broom:collected` → next frame the gate
   passes → `Summoning`; the pickup's `useProgression` selector flips `collected` → the mesh unmounts. Confirms
   F2.4/F2.1/F3.4.
4. **Map key + render.** Trace `App.useMenuKeys` M branch → `openOverlay('map')` → `GameOverlays` renders
   `<WorldMap />`; `WorldMap` reads `useHud` (`playerX/playerZ/playerFacing` from the extended `HudSync`) and
   `layout.ts` symbols through `worldToMap`. Confirms F3.1/F3.2/F3.5 and NF.1 (only 10 Hz hud selectors drive
   re-render).
5. **Marker correctness.** Trace `questMap.questMarkers` (active + available/giver) and `BROOM_PICKUPS` map
   consumption; cross-check collected styling against `progression.broomsCollected`; confirm the refactored compass
   still shows the single first-quest marker. Confirms F3.3/F3.4.
6. **Save round-trip.** Beyond unit tests, trace `progressionStore.save()` → `writeSave` → `serializeSave` (version 3)
   and `continueFromSave` → `readSave` → `parseSave` (v1/v2/v3 branches) → `sanitizeProgression` (defaults for old
   saves). Confirms NF.2.

**Rebind check (manual trace):** `SettingsPanel` lists `map` under Interface because `ACTION_META.map.group` is
`'Interface'`; `findConflicts` includes it; clearing/rebinding uses the generic slot logic. Confirms NF.3.

**Cleanup:** no temporary files are introduced; any scratch files used during verification are removed.

---

## 11. Risk register

- **Import cycle** from sharing `BroomModel`: mitigated by extracting it to its own presentational module.
- **Realistic avatar wand-group access** for F1: mitigated by applying the correction only when a wand group is
  exposed and falling back to current behaviour; the procedural path (the shipped default, `characterLibraryAvailable()`
  is `false`) always shows the feature.
- **Flight-quest soft-lock** if no broom is reachable before the quest: mitigated by the verified early (Courtyard)
  broom placement; no reliance on unverified dialogue gating.
- **Save compatibility**: mitigated by additive fields, lenient sanitizer defaults, and the explicit `{v1, v2, v3}`
  accepting branches with `version > 3` rejection; **v1 and v2 saves both still load** (regression-tested).

---

## 12. Summary of files

New: `src/game/player/wandAim.ts`, `src/game/player/wandAim.test.ts`, `src/game/world/BroomModel.tsx`,
`src/ui/menus/WorldMap.tsx`, `src/game/world/mapProjection.ts`, `src/game/world/mapProjection.test.ts`,
`src/game/quests/questMap.ts`, `src/game/quests/questMap.test.ts`, `src/game/quests/saveSystem.test.ts`.

Modified: `HumanoidRig.tsx` (expose `wandRoot`), `PlayerAvatar.tsx`, `PlayerController.tsx`, `flightMachine.ts`,
`flight.test.ts`, `questEngine.ts`, `progressionStore.ts`, `saveSystem.ts`, `events.ts`, `layout.ts` (broom pickups +
`CODEX_POSITION`), `WorldItems.tsx`, `bindings.ts`, `gameStore.ts`, `hudStore.ts` (player x/z/facing fields),
`App.tsx`, `GameMenus.tsx`, `HUD.tsx` (refactor to shared quest-marker helper), `core/Systems.tsx` (HudSync patches
player x/z/facing), `README.md`.

Unchanged economy/engines: `spellSystem.ts`, `registry.ts`, `flightPhysics.ts`, `questData.ts`.

---

## 13. Review findings resolution

### 13.1 Second review (`design-review.json`, verdict `CHANGES_REQUESTED`: 0 HIGH, 4 MEDIUM, 3 NIT)

All seven findings from the current `design-review.json` are addressed. Each was re-verified against the real
worktree source before this revision.

1. **[MEDIUM] Wand-aim pitch clamp unspecified yet drives AC-1 — ADDRESSED (option (a)).** §5 step 3 now pins the
   clamp: it is applied to the **world-space** aim pitch *before* the parent-space transform, mapping directly onto
   the camera euler limits. The rule is given in code: `worldPitch = asin(clamp(aimDir.y,-1,1))`, clamp to
   `CAMERA_LIMITS.groundPitch` (`[-1.2, 0.55]`, **imported** from `CameraRig`, not re-hardcoded), rebuild the unit
   world direction from `(yaw, clampedPitch)`, then transform to parent space. A new pure helper
   `clampWorldAimPitch(aimDir, limits)` lives in `wandAim.ts`. `wandAim.test.ts` asserts concrete expected values —
   `y === sin(0.55)` at the up-extreme and `y === sin(-1.2)` at the down-extreme (derived from the imported
   `CAMERA_LIMITS`, within 1e-6), yaw preserved, mid-range round-trips — and that `wandAimRotation` maps local **-Y**
   onto the clamped direction within ~5° (AC-1).

2. **[MEDIUM] HUD compass "unchanged" conflicts with the `CODEX_POSITION` refactor — ADDRESSED (option (a), accept
   the shift).** Verified: `WorldItems.Codex` really sits at `(-43.3, LIBRARY_BALCONY_Y+1.05, -40.2)` while the
   compass `collect` case hard-codes `[-43,-40]`. We define `CODEX_POSITION = [-43.3, LIBRARY_BALCONY_Y+1.05, -40.2]`
   in `layout.ts` (exactly the existing Codex literal) and route both the Codex entity and the compass/map through it.
   The design no longer claims the compass is wholly unchanged: it is byte-identical for every objective **except**
   `collect`, whose marker is **corrected** to the true codex, a <0.4 m (≈0.36 m) shift. §7.4, AC-11, and the Finding
   2 note in §7.4 all state this explicitly; the HUD assertion in `questMap.test.ts` checks the corrected value.

3. **[MEDIUM] `useMenuKeys` allow-list not enumerated for `map` — ADDRESSED.** §7.3 now specifies: rename the local
   toggle table from `map` to `toggles` (avoiding the confusing `map: b.map` into a const named `map`), add
   `map: b.map` to `toggles`, and widen the open guard to the exact line
   `g.overlay === null || g.overlay === 'pause' || g.overlay === 'spellbook' || g.overlay === 'journal' || g.overlay === 'inventory' || g.overlay === 'map'`
   so B/J/I still open while the map is up and vice-versa. §10 trace 4 verifies this point.

4. **[MEDIUM] `questMarkers` omitted the `flightState` objective kind — ADDRESSED.** §7.4 now enumerates all six
   `ObjectiveDef` kinds (`talk|spellHit|collect|flightState|rings|reach`) and specifies each location, including
   `flightState → FLIGHT_PLATFORM.center` on the **map**. The shared resolver takes a `forCompass` flag so the
   compass maps `flightState → null` (preserving today's fall-through) while the map shows the platform. A
   `questMap.test.ts` case asserts the active `flightState` behaviour for both surfaces (AC-11); `questMarkers` never
   returns `undefined`/throws for a valid objective.

5. **[NIT] `broom:collected` event used a bare `id` — ADDRESSED.** §6 and §8 now name the event
   `{ type: 'broom:collected'; broomId: string }`, matching the `events.ts` convention
   (`itemId`/`questId`/`npcId`/`locationId`); `collectBroom` emits `{ type:'broom:collected', broomId:id }`.

6. **[NIT] `collectBroom` hard-coded "Press F" — ADDRESSED (resolve the label).** §6 now resolves the key label at
   message time via `keyLabel(useSettings.getState().controls.bindings.toggleBroom[0])` so the notification tracks a
   rebind instead of going stale.

7. **[NIT] "82 tests" baseline taken on faith — ACKNOWLEDGED.** Only the 6 test-file count is verifiable from source;
   the 82 total / per-file counts are not re-asserted as fact. §10 now instructs the implementer to run `npm test`
   once before editing to establish the real baseline so regressions are attributable; the header no longer presents
   the total count as independently verified.

### 13.2 First review (prior `design-review.json`: 1 HIGH, 4 MEDIUM, 3 NIT) — still resolved

These were resolved in the previous iteration and remain in force; summarised for traceability.

- **[HIGH] Save v2 files unreadable after 2→3 bump.** §8 specifies three accepting branches in `parseSave`:
  `version === 1` (migrate), `version === 2 || version === SAVE_VERSION(3)` (shared shape + `sanitizeProgression`
  defaults), `version > 3` → `unsupported`. AC-9/`saveSystem.test.ts` assert a v2 string loads with
  `hasBroom:false`/`broomsCollected:[]` and `hasValidSave()` stays `true`.
- **Wand-aim correction applied to the wand group** (`wandRoot`), not `forearmR` — §5.
- **Player marker uses `runtime.player.facing`**, not camera yaw — F3.5 / §7.4.
- **`hudStore.ts` listed as modified** with `playerX/playerZ/playerFacing` (default 0) — §7.5 / §12.
- **`questMarkers` described as new logic** (multi-quest + giver lookup), not a trivial switch reuse — §7.4.
- **Broom `collected` derived from `broomsCollected.includes(id)`** (no `sessionId`) — §7.1.
- **Shared `CODEX_POSITION`** removes the duplicated `[-43,-40]` literal — §7.4/§7.5.

8. **[NIT] Unverified "instructor dialogue already gates the quest" — ADDRESSED.** §6 and §11 drop that claim; the
   soft-lock guard rests solely on the verified early Courtyard broom placement.
